//! Minimal AquesTalk10 command line synthesizer.
//!
//!   aquestalk <bas> <spd> <vol> <pit> <acc> <lmd> <fsc>
//!     Reads a UTF-8 phonetic symbol string (音声記号列) from stdin and writes a WAV file to stdout.
//!     Parameters are the fields of AQTK_VOICE, see AquesTalk.h.
//!
//! The library is loaded at runtime from $AQUESTALK_LIB, or libAquesTalk10.so.1.1 next to this binary.
//! $AQUESTALK_DEV_KEY and $AQUESTALK_USR_KEY set the license keys. Without a development key the
//! library runs as the evaluation version, which pronounces the ナ and マ rows as ヌ.

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

const LIBRARY: &str = "libAquesTalk10.so.1.1";
const RTLD_NOW: c_int = 2;
const RTLD_GLOBAL: c_int = 0x100;

#[repr(C)]
struct AqtkVoice {
  bas: c_int,
  spd: c_int,
  vol: c_int,
  pit: c_int,
  acc: c_int,
  lmd: c_int,
  fsc: c_int,
}

type SyntheUtf8 = unsafe extern "C" fn(*const AqtkVoice, *const c_char, *mut c_int) -> *mut u8;
type FreeWave = unsafe extern "C" fn(*mut u8);
type SetKey = unsafe extern "C" fn(*const c_char) -> c_int;

#[link(name = "dl")]
extern "C" {
  fn dlopen(filename: *const c_char, flags: c_int) -> *mut c_void;
  fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
  fn dlerror() -> *const c_char;
}

fn dl_error() -> String {
  unsafe {
    let err = dlerror();
    if err.is_null() { "unknown error".into() } else { CStr::from_ptr(err).to_string_lossy().into_owned() }
  }
}

unsafe fn symbol<T>(handle: *mut c_void, name: &CStr) -> Result<T, String> {
  let ptr = dlsym(handle, name.as_ptr());
  if ptr.is_null() { return Err(format!("missing symbol {}: {}", name.to_string_lossy(), dl_error())); }
  Ok(std::mem::transmute_copy(&ptr))
}

fn error_message(code: c_int) -> &'static str {
  match code {
    101 => "out of memory",
    103 => "invalid symbol string (eg. leading long vowel or repeated sokuon)",
    104 => "no valid readings in the symbol string",
    105 => "undefined reading symbol in the symbol string",
    106 => "invalid tag",
    107 => "tag too long (or missing '>')",
    108 => "invalid tag value",
    120 => "symbol string too long",
    121 => "too many reading symbols in one phrase",
    122 => "symbol string too long (internal buffer overflow)",
    _ => "other error",
  }
}

fn library_path() -> PathBuf {
  if let Some(path) = std::env::var_os("AQUESTALK_LIB") { return path.into(); }

  std::env::current_exe()
    .ok()
    .and_then(|exe| exe.parent().map(|dir| dir.join(LIBRARY)))
    .unwrap_or_else(|| LIBRARY.into())
}

fn run() -> Result<(), String> {
  let params: Vec<c_int> = std::env::args()
    .skip(1)
    .map(|arg| arg.parse().map_err(|_| format!("invalid parameter {arg:?}")))
    .collect::<Result<_, _>>()?;

  let [bas, spd, vol, pit, acc, lmd, fsc] = params[..] else {
    return Err("usage: aquestalk <bas> <spd> <vol> <pit> <acc> <lmd> <fsc> < koe.txt > out.wav".into());
  };
  let voice = AqtkVoice { bas, spd, vol, pit, acc, lmd, fsc };

  let mut koe = Vec::new();
  std::io::stdin().read_to_end(&mut koe).map_err(|err| format!("failed to read stdin: {err}"))?;
  let koe = CString::new(koe).map_err(|_| "input contains a NUL byte")?;

  let path = library_path();
  let path_c = CString::new(path.as_os_str().as_encoded_bytes()).map_err(|_| "invalid library path")?;

  unsafe {
    // The library is C++, but does not list libstdc++ as a dependency
    if dlopen(c"libstdc++.so.6".as_ptr(), RTLD_NOW | RTLD_GLOBAL).is_null() {
      return Err(format!("failed to load libstdc++: {}", dl_error()));
    }
    
    let handle = dlopen(path_c.as_ptr(), RTLD_NOW);
    if handle.is_null() { return Err(format!("failed to load {}: {}", path.display(), dl_error())); }

    let synthe: SyntheUtf8 = symbol(handle, c"AquesTalk_Synthe_Utf8")?;
    let free_wave: FreeWave = symbol(handle, c"AquesTalk_FreeWave")?;

    for (var, name) in [("AQUESTALK_DEV_KEY", c"AquesTalk_SetDevKey"), ("AQUESTALK_USR_KEY", c"AquesTalk_SetUsrKey")] {
      let Some(key) = std::env::var_os(var).filter(|key| !key.is_empty()) else { continue };
      let key = CString::new(key.as_encoded_bytes()).map_err(|_| format!("invalid {var}"))?;
      let set_key: SetKey = symbol(handle, name)?;
      if set_key(key.as_ptr()) != 0 { eprintln!("aquestalk: warning: {var} was rejected"); }
    }

    let mut size: c_int = 0;
    let wav = synthe(&voice, koe.as_ptr(), &mut size);
    if wav.is_null() { return Err(format!("synthesis failed: {} (error {size})", error_message(size))); }

    let result = std::io::stdout().lock().write_all(std::slice::from_raw_parts(wav, size as usize));
    free_wave(wav);
    result.map_err(|err| format!("failed to write stdout: {err}"))
  }
}

fn main() -> ExitCode {
  match run() {
    Ok(()) => ExitCode::SUCCESS,
    Err(err) => {
      eprintln!("aquestalk: {err}");
      ExitCode::FAILURE
    }
  }
}
