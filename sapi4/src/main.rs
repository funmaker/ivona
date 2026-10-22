//! Minimal SAPI 4 command line synthesizer, meant to be run under Wine.
//!
//!   sapi4.exe list
//!     Prints installed voices, one per line: "<mode name>\t<language id>\t<gender>"
//!
//!   sapi4.exe speak <mode name> <pitch> <speed> <output path>
//!     Reads UTF-8 text from stdin and writes it as a WAV file to the output path.
//!     Pitch and speed of 0 keep the voice defaults.
//!
//! Interface definitions are taken from speech.h of the Microsoft Speech SDK 4.0.

#![no_std]
#![no_main]

extern crate alloc;

#[macro_use]
mod sys;
mod sapi;

use alloc::vec::Vec;
use core::ptr::null_mut;
use core::sync::atomic::{AtomicBool, Ordering};
use sapi::*;
use sys::*;

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
  eprint(b"sapi4: panic\n");
  unsafe { ExitProcess(101) }
}

#[global_allocator]
static ALLOCATOR: HeapAllocator = HeapAllocator;

#[no_mangle]
pub extern "C" fn mainCRTStartup() -> ! {
  let code = match run() {
    Ok(()) => 0,
    Err(code) => code,
  };

  unsafe { ExitProcess(code) }
}

type Result<T = ()> = core::result::Result<T, u32>;

fn fail<T>(what: &[u8], hr: HRESULT) -> Result<T> {
  eprint(b"sapi4: ");
  eprint(what);
  eprint(b" failed (0x");
  let mut hex = [0u8; 8];
  for (i, digit) in hex.iter_mut().enumerate() {
    *digit = b"0123456789abcdef"[((hr as u32) >> (28 - i * 4)) as usize & 0xF];
  }
  eprint(&hex);
  eprint(b")\n");
  Err(1)
}

fn check(what: &[u8], hr: HRESULT) -> Result {
  if hr < 0 { fail(what, hr) } else { Ok(()) }
}

fn run() -> Result {
  let args = args();
  let command = args.get(1).map(|arg| arg.as_slice());

  if command != Some(wide!("list")) && !(command == Some(wide!("speak")) && args.len() >= 6) {
    eprint(b"Usage:\n  sapi4.exe list\n  sapi4.exe speak <voice> <pitch> <speed> <out.wav> < text.txt\n");
    return Err(2);
  }

  unsafe {
    check(b"CoInitialize", CoInitialize(null_mut()))?;

    let mut tts_enum: *mut Com<ITTSEnumAVtbl> = null_mut();
    check(b"CoCreateInstance(TTSEnumerator)", CoCreateInstance(&CLSID_TTSEnumerator, null_mut(), CLSCTX_ALL, &IID_ITTSEnumA, as_out(&mut tts_enum)))?;

    let result = if command == Some(wide!("list")) {
      list(tts_enum)
    } else {
      speak(tts_enum, &args[2], parse_u32(&args[3]) as u16, parse_u32(&args[4]), &args[5])
    };

    ((*(*tts_enum).vtbl).release)(tts_enum);
    CoUninitialize();

    result
  }
}

unsafe fn list(tts_enum: *mut Com<ITTSEnumAVtbl>) -> Result {
  let mut out = Vec::new();

  for info in modes(tts_enum) {
    out.extend_from_slice(c_str(&info.mode_name));
    out.push(b'\t');
    push_u32(&mut out, info.language.language_id as u32);
    out.push(b'\t');
    push_u32(&mut out, info.gender as u32);
    out.push(b'\n');
  }

  write_all(GetStdHandle(STD_OUTPUT_HANDLE), &out);
  Ok(())
}

static AUDIO_STARTED: AtomicBool = AtomicBool::new(false);
static AUDIO_STOPPED: AtomicBool = AtomicBool::new(false);
static TEXT_DONE: AtomicBool = AtomicBool::new(false);

unsafe extern "system" fn on_audio_start(_: *mut Sink, _: u64) -> HRESULT { AUDIO_STARTED.store(true, Ordering::SeqCst); S_OK }
unsafe extern "system" fn on_audio_stop(_: *mut Sink, _: u64) -> HRESULT { AUDIO_STOPPED.store(true, Ordering::SeqCst); S_OK }
unsafe extern "system" fn on_text_data_done(_: *mut Sink, _: u64, _: u32) -> HRESULT { TEXT_DONE.store(true, Ordering::SeqCst); S_OK }

static NOTIFY_SINK: Sink = Sink::new(&IID_ITTSNotifySinkA, &NotifySinkVtbl {
  base: SinkBase::NEW,
  attrib_changed: ignore_u32,
  audio_start: on_audio_start,
  audio_stop: on_audio_stop,
  visual: ignore_visual,
});

static BUF_NOTIFY_SINK: Sink = Sink::new(&IID_ITTSBufNotifySink, &BufNotifySinkVtbl {
  base: SinkBase::NEW,
  text_data_done: on_text_data_done,
  text_data_started: ignore_u64,
  book_mark: ignore_u64_u32,
  word_position: ignore_u64_u32,
});

unsafe fn speak(tts_enum: *mut Com<ITTSEnumAVtbl>, voice: &[u16], pitch: u16, speed: u32, output: &[u16]) -> Result {
  let voice = wide_to_ansi(voice);
  let Some(info) = modes(tts_enum).find(|info| lstrcmpiA(info.mode_name.as_ptr(), voice.as_ptr()) == 0) else {
    eprint(b"sapi4: unknown voice \"");
    eprint(&voice[..voice.len() - 1]);
    eprint(b"\"\n");
    return Err(1);
  };

  let text = read_all(GetStdHandle(STD_INPUT_HANDLE));
  let text = wide_to_ansi(&utf8_to_wide(&text));

  let mut output = output.to_vec();
  output.push(0);

  let mut audio_file: *mut Com<IAudioFileVtbl> = null_mut();
  check(b"CoCreateInstance(AudioDestFile)", CoCreateInstance(&CLSID_AudioDestFile, null_mut(), CLSCTX_ALL, &IID_IAudioFile, as_out(&mut audio_file)))?;
  check(b"IAudioFile::Set", ((*(*audio_file).vtbl).set)(audio_file, output.as_ptr(), 1))?;
  // 0x100 renders at real time, 0xFFFF as fast as the engine can
  ((*(*audio_file).vtbl).real_time_set)(audio_file, 0xFFFF);

  let mut central: *mut Com<ITTSCentralAVtbl> = null_mut();
  check(b"ITTSEnum::Select", ((*(*tts_enum).vtbl).select)(tts_enum, info.mode_id, &mut central, audio_file.cast()))?;

  let mut attribs: *mut Com<ITTSAttributesAVtbl> = null_mut();
  if ((*(*central).vtbl).query_interface)(central.cast(), &IID_ITTSAttributesA, as_out(&mut attribs)) >= 0 {
    if pitch != 0 { ((*(*attribs).vtbl).pitch_set)(attribs, pitch); }
    if speed != 0 { ((*(*attribs).vtbl).speed_set)(attribs, speed); }
    ((*(*attribs).vtbl).release)(attribs);
  }

  let mut sink_key = 0;
  check(b"ITTSCentral::Register", ((*(*central).vtbl).register)(central, NOTIFY_SINK.as_ptr(), IID_ITTSNotifySinkA, &mut sink_key))?;

  let data = SDATA { data: text.as_ptr().cast(), size: text.len() as u32 };
  check(b"ITTSCentral::TextData", ((*(*central).vtbl).text_data)(central, CHARSET_TEXT, 0, data, BUF_NOTIFY_SINK.as_ptr(), IID_ITTSBufNotifySink))?;

  // Wait for the engine to finish rendering. If audio never starts (eg. text with nothing to say),
  // give up shortly after the engine reports the text as processed.
  let stopped = || AUDIO_STOPPED.load(Ordering::SeqCst);
  let started = || AUDIO_STARTED.load(Ordering::SeqCst);
  let text_done = || TEXT_DONE.load(Ordering::SeqCst);

  pump_until(|| stopped() || text_done(), 60_000);
  pump_until(|| stopped() || (!started() && text_done()), 60_000);
  pump_until(stopped, if started() { 60_000 } else { 500 });

  ((*(*central).vtbl).unregister)(central, sink_key);
  ((*(*audio_file).vtbl).flush)(audio_file);
  ((*(*central).vtbl).release)(central);
  ((*(*audio_file).vtbl).release)(audio_file);

  Ok(())
}

unsafe fn modes(tts_enum: *mut Com<ITTSEnumAVtbl>) -> impl Iterator<Item = TTSMODEINFOA> {
  ((*(*tts_enum).vtbl).reset)(tts_enum);

  core::iter::from_fn(move || {
    let mut info: TTSMODEINFOA = core::mem::zeroed();
    let mut fetched = 0;

    if ((*(*tts_enum).vtbl).next)(tts_enum, 1, &mut info, &mut fetched) == S_OK && fetched == 1 {
      Some(info)
    } else {
      None
    }
  })
}

unsafe fn pump_until(done: impl Fn() -> bool, timeout_ms: u32) {
  let start = GetTickCount();
  let mut msg: MSG = core::mem::zeroed();

  while !done() && GetTickCount().wrapping_sub(start) < timeout_ms {
    while PeekMessageA(&mut msg, null_mut(), 0, 0, PM_REMOVE) != 0 {
      TranslateMessage(&msg);
      DispatchMessageA(&msg);
    }
    MsgWaitForMultipleObjects(0, core::ptr::null(), 0, 10, QS_ALLINPUT);
  }
}

fn parse_u32(arg: &[u16]) -> u32 {
  arg.iter()
     .take_while(|c| (b'0' as u16..=b'9' as u16).contains(c))
     .fold(0u32, |acc, &c| acc.wrapping_mul(10).wrapping_add((c - b'0' as u16) as u32))
}

fn push_u32(out: &mut Vec<u8>, mut value: u32) {
  let mut digits = [0u8; 10];
  let mut len = 0;

  loop {
    digits[len] = b'0' + (value % 10) as u8;
    len += 1;
    value /= 10;
    if value == 0 { break; }
  }

  out.extend(digits[..len].iter().rev());
}

fn c_str(buf: &[u8]) -> &[u8] {
  &buf[..buf.iter().position(|&c| c == 0).unwrap_or(buf.len())]
}
