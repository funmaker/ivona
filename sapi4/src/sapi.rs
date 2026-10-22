//! Subset of the SAPI 4 interfaces (ANSI variants), from speech.h of the Microsoft Speech SDK 4.0.

#![allow(non_upper_case_globals, non_camel_case_types)]

use crate::sys::*;
use core::ffi::c_void;

const SVFN_LEN: usize = 262;
const LANG_LEN: usize = 64;
const TTSI_NAMELEN: usize = SVFN_LEN;
const TTSI_STYLELEN: usize = SVFN_LEN;

pub const CHARSET_TEXT: u32 = 0;

pub const CLSID_TTSEnumerator: GUID = GUID(0xd67c0280, 0xc743, 0x11cd, [0x80, 0xe5, 0x00, 0xaa, 0x00, 0x3e, 0x4b, 0x50]);
pub const CLSID_AudioDestFile: GUID = GUID(0xd4623720, 0xe4b9, 0x11cf, [0x8d, 0x56, 0x00, 0xa0, 0xc9, 0x03, 0x4a, 0x7e]);
pub const IID_ITTSEnumA: GUID = GUID(0x05eb6c6d, 0xdbab, 0x11cd, [0xb3, 0xca, 0x00, 0xaa, 0x00, 0x47, 0xba, 0x4f]);
pub const IID_ITTSAttributesA: GUID = GUID(0x0fd6e2a1, 0xe77d, 0x11cd, [0xb3, 0xca, 0x00, 0xaa, 0x00, 0x47, 0xba, 0x4f]);
pub const IID_ITTSNotifySinkA: GUID = GUID(0x05eb6c6f, 0xdbab, 0x11cd, [0xb3, 0xca, 0x00, 0xaa, 0x00, 0x47, 0xba, 0x4f]);
pub const IID_ITTSBufNotifySink: GUID = GUID(0xe4963d40, 0xc743, 0x11cd, [0x80, 0xe5, 0x00, 0xaa, 0x00, 0x3e, 0x4b, 0x50]);
pub const IID_IAudioFile: GUID = GUID(0xfd7c2320, 0x3d6d, 0x11b9, [0xc0, 0x00, 0xfe, 0xd6, 0xcb, 0xa3, 0xb1, 0xa9]);

#[repr(C)]
pub struct SDATA {
  pub data: *const c_void,
  pub size: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct LANGUAGEA {
  pub language_id: u16,
  pub dialect: [u8; LANG_LEN],
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct TTSMODEINFOA {
  pub engine_id: GUID,
  pub mfg_name: [u8; TTSI_NAMELEN],
  pub product_name: [u8; TTSI_NAMELEN],
  pub mode_id: GUID,
  pub mode_name: [u8; TTSI_NAMELEN],
  pub language: LANGUAGEA,
  pub speaker: [u8; TTSI_NAMELEN],
  pub style: [u8; TTSI_STYLELEN],
  pub gender: u16,
  pub age: u16,
  pub features: u32,
  pub interfaces: u32,
  pub engine_features: u32,
}

/// A COM object pointer: the first field of every object is its vtable
#[repr(C)]
pub struct Com<V> {
  pub vtbl: *const V,
}

type QueryInterface = unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT;
type Release<V> = unsafe extern "system" fn(*mut Com<V>) -> u32;

#[repr(C)]
pub struct ITTSEnumAVtbl {
  pub query_interface: QueryInterface,
  pub add_ref: Release<Self>,
  pub release: Release<Self>,
  pub next: unsafe extern "system" fn(*mut Com<Self>, u32, *mut TTSMODEINFOA, *mut u32) -> HRESULT,
  pub skip: unsafe extern "system" fn(*mut Com<Self>, u32) -> HRESULT,
  pub reset: unsafe extern "system" fn(*mut Com<Self>) -> HRESULT,
  pub clone: unsafe extern "system" fn(*mut Com<Self>, *mut *mut Com<Self>) -> HRESULT,
  pub select: unsafe extern "system" fn(*mut Com<Self>, GUID, *mut *mut Com<ITTSCentralAVtbl>, *mut c_void) -> HRESULT,
}

#[repr(C)]
pub struct ITTSCentralAVtbl {
  pub query_interface: QueryInterface,
  pub add_ref: Release<Self>,
  pub release: Release<Self>,
  pub inject: unsafe extern "system" fn(*mut Com<Self>, *const u8) -> HRESULT,
  pub mode_get: unsafe extern "system" fn(*mut Com<Self>, *mut TTSMODEINFOA) -> HRESULT,
  pub phoneme: unsafe extern "system" fn(*mut Com<Self>, u32, u32, SDATA, *mut SDATA) -> HRESULT,
  pub posn_get: unsafe extern "system" fn(*mut Com<Self>, *mut u64) -> HRESULT,
  pub text_data: unsafe extern "system" fn(*mut Com<Self>, u32, u32, SDATA, *mut c_void, GUID) -> HRESULT,
  pub to_file_time: unsafe extern "system" fn(*mut Com<Self>, *mut u64, *mut u64) -> HRESULT,
  pub audio_pause: unsafe extern "system" fn(*mut Com<Self>) -> HRESULT,
  pub audio_resume: unsafe extern "system" fn(*mut Com<Self>) -> HRESULT,
  pub audio_reset: unsafe extern "system" fn(*mut Com<Self>) -> HRESULT,
  pub register: unsafe extern "system" fn(*mut Com<Self>, *mut c_void, GUID, *mut u32) -> HRESULT,
  pub unregister: unsafe extern "system" fn(*mut Com<Self>, u32) -> HRESULT,
}

#[repr(C)]
pub struct ITTSAttributesAVtbl {
  pub query_interface: QueryInterface,
  pub add_ref: Release<Self>,
  pub release: Release<Self>,
  pub pitch_get: unsafe extern "system" fn(*mut Com<Self>, *mut u16) -> HRESULT,
  pub pitch_set: unsafe extern "system" fn(*mut Com<Self>, u16) -> HRESULT,
  pub real_time_get: unsafe extern "system" fn(*mut Com<Self>, *mut u32) -> HRESULT,
  pub real_time_set: unsafe extern "system" fn(*mut Com<Self>, u32) -> HRESULT,
  pub speed_get: unsafe extern "system" fn(*mut Com<Self>, *mut u32) -> HRESULT,
  pub speed_set: unsafe extern "system" fn(*mut Com<Self>, u32) -> HRESULT,
  pub volume_get: unsafe extern "system" fn(*mut Com<Self>, *mut u32) -> HRESULT,
  pub volume_set: unsafe extern "system" fn(*mut Com<Self>, u32) -> HRESULT,
}

#[repr(C)]
pub struct IAudioFileVtbl {
  pub query_interface: QueryInterface,
  pub add_ref: Release<Self>,
  pub release: Release<Self>,
  pub register: unsafe extern "system" fn(*mut Com<Self>, *mut c_void) -> HRESULT,
  pub set: unsafe extern "system" fn(*mut Com<Self>, *const u16, u32) -> HRESULT,
  pub add: unsafe extern "system" fn(*mut Com<Self>, *const u16, u32) -> HRESULT,
  pub flush: unsafe extern "system" fn(*mut Com<Self>) -> HRESULT,
  pub real_time_set: unsafe extern "system" fn(*mut Com<Self>, u16) -> HRESULT,
  pub real_time_get: unsafe extern "system" fn(*mut Com<Self>, *mut u16) -> HRESULT,
}

/// Statically allocated notification sink, so reference counting is a no-op
#[repr(C)]
pub struct Sink {
  vtbl: *const SinkBase,
  iid: &'static GUID,
}

unsafe impl Sync for Sink {}

impl Sink {
  /// `V` must be a `#[repr(C)]` vtable starting with `SinkBase`
  pub const fn new<V>(iid: &'static GUID, vtbl: &'static V) -> Self {
    Sink { vtbl: vtbl as *const V as *const SinkBase, iid }
  }

  pub fn as_ptr(&'static self) -> *mut c_void {
    self as *const Sink as *mut c_void
  }
}

#[repr(C)]
pub struct SinkBase {
  query_interface: unsafe extern "system" fn(*mut Sink, *const GUID, *mut *mut c_void) -> HRESULT,
  add_ref: unsafe extern "system" fn(*mut Sink) -> u32,
  release: unsafe extern "system" fn(*mut Sink) -> u32,
}

impl SinkBase {
  pub const NEW: SinkBase = SinkBase { query_interface: sink_query_interface, add_ref: sink_ref, release: sink_ref };
}

unsafe extern "system" fn sink_query_interface(this: *mut Sink, iid: *const GUID, out: *mut *mut c_void) -> HRESULT {
  if *iid == IID_IUnknown || *iid == *(*this).iid {
    *out = this.cast();
    S_OK
  } else {
    *out = core::ptr::null_mut();
    0x80004002u32 as HRESULT // E_NOINTERFACE
  }
}

unsafe extern "system" fn sink_ref(_: *mut Sink) -> u32 { 1 }

pub unsafe extern "system" fn ignore_u32(_: *mut Sink, _: u32) -> HRESULT { S_OK }
pub unsafe extern "system" fn ignore_u64(_: *mut Sink, _: u64) -> HRESULT { S_OK }
pub unsafe extern "system" fn ignore_u64_u32(_: *mut Sink, _: u64, _: u32) -> HRESULT { S_OK }
pub unsafe extern "system" fn ignore_visual(_: *mut Sink, _: u64, _: i8, _: i8, _: u32, _: *mut c_void) -> HRESULT { S_OK }

#[repr(C)]
pub struct NotifySinkVtbl {
  pub base: SinkBase,
  pub attrib_changed: unsafe extern "system" fn(*mut Sink, u32) -> HRESULT,
  pub audio_start: unsafe extern "system" fn(*mut Sink, u64) -> HRESULT,
  pub audio_stop: unsafe extern "system" fn(*mut Sink, u64) -> HRESULT,
  pub visual: unsafe extern "system" fn(*mut Sink, u64, i8, i8, u32, *mut c_void) -> HRESULT,
}

#[repr(C)]
pub struct BufNotifySinkVtbl {
  pub base: SinkBase,
  pub text_data_done: unsafe extern "system" fn(*mut Sink, u64, u32) -> HRESULT,
  pub text_data_started: unsafe extern "system" fn(*mut Sink, u64) -> HRESULT,
  pub book_mark: unsafe extern "system" fn(*mut Sink, u64, u32) -> HRESULT,
  pub word_position: unsafe extern "system" fn(*mut Sink, u64, u32) -> HRESULT,
}
