//! Bare Win32 bindings and helpers. Everything is imported through raw-dylib,
//! so no import libraries or C runtime are needed to link.

use alloc::vec::Vec;
use core::alloc::{GlobalAlloc, Layout};
use core::ffi::c_void;
use core::ptr::null_mut;

pub type HRESULT = i32;
pub type HANDLE = *mut c_void;
pub type BOOL = i32;

pub const S_OK: HRESULT = 0;
pub const CLSCTX_ALL: u32 = 0x17;
pub const STD_INPUT_HANDLE: u32 = -10i32 as u32;
pub const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
pub const STD_ERROR_HANDLE: u32 = -12i32 as u32;
pub const PM_REMOVE: u32 = 1;
pub const QS_ALLINPUT: u32 = 0x4FF;
pub const CP_ACP: u32 = 0;
pub const CP_UTF8: u32 = 65001;

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct GUID(pub u32, pub u16, pub u16, pub [u8; 8]);

#[allow(non_upper_case_globals)]
pub const IID_IUnknown: GUID = GUID(0x00000000, 0x0000, 0x0000, [0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);

#[repr(C)]
pub struct MSG {
  pub hwnd: HANDLE,
  pub message: u32,
  pub wparam: usize,
  pub lparam: isize,
  pub time: u32,
  pub pt: [i32; 2],
  pub private: u32,
}

#[link(name = "kernel32", kind = "raw-dylib", import_name_type = "undecorated")]
extern "system" {
  pub fn ExitProcess(code: u32) -> !;
  pub fn GetStdHandle(handle: u32) -> HANDLE;
  pub fn ReadFile(file: HANDLE, buf: *mut u8, len: u32, read: *mut u32, overlapped: *mut c_void) -> BOOL;
  pub fn WriteFile(file: HANDLE, buf: *const u8, len: u32, written: *mut u32, overlapped: *mut c_void) -> BOOL;
  pub fn GetTickCount() -> u32;
  pub fn GetCommandLineW() -> *const u16;
  pub fn LocalFree(mem: *mut c_void) -> *mut c_void;
  pub fn GetProcessHeap() -> HANDLE;
  pub fn HeapAlloc(heap: HANDLE, flags: u32, size: usize) -> *mut c_void;
  pub fn HeapFree(heap: HANDLE, flags: u32, mem: *mut c_void) -> BOOL;
  pub fn MultiByteToWideChar(page: u32, flags: u32, src: *const u8, src_len: i32, dst: *mut u16, dst_len: i32) -> i32;
  pub fn WideCharToMultiByte(page: u32, flags: u32, src: *const u16, src_len: i32, dst: *mut u8, dst_len: i32, default: *const u8, used_default: *mut BOOL) -> i32;
  pub fn lstrcmpiA(a: *const u8, b: *const u8) -> i32;
  pub fn lstrlenW(s: *const u16) -> i32;
}

#[link(name = "user32", kind = "raw-dylib", import_name_type = "undecorated")]
extern "system" {
  pub fn PeekMessageA(msg: *mut MSG, hwnd: HANDLE, min: u32, max: u32, remove: u32) -> BOOL;
  pub fn TranslateMessage(msg: *const MSG) -> BOOL;
  pub fn DispatchMessageA(msg: *const MSG) -> isize;
  pub fn MsgWaitForMultipleObjects(count: u32, handles: *const HANDLE, wait_all: BOOL, timeout: u32, mask: u32) -> u32;
}

#[link(name = "shell32", kind = "raw-dylib", import_name_type = "undecorated")]
extern "system" {
  pub fn CommandLineToArgvW(cmd: *const u16, argc: *mut i32) -> *mut *mut u16;
}

#[link(name = "ole32", kind = "raw-dylib", import_name_type = "undecorated")]
extern "system" {
  pub fn CoInitialize(reserved: *mut c_void) -> HRESULT;
  pub fn CoUninitialize();
  pub fn CoCreateInstance(clsid: *const GUID, outer: *mut c_void, context: u32, iid: *const GUID, out: *mut *mut c_void) -> HRESULT;
}

// Routines called implicitly by compiler generated code, normally provided by the static CRT.
core::arch::global_asm!(
  ".globl _memcpy",
  "_memcpy:",
  "  push edi",
  "  push esi",
  "  mov edi, [esp + 12]",
  "  mov esi, [esp + 16]",
  "  mov ecx, [esp + 20]",
  "  mov eax, edi",
  "  rep movsb",
  "  pop esi",
  "  pop edi",
  "  ret",
  
  ".globl _memmove",
  "_memmove:",
  "  push edi",
  "  push esi",
  "  mov edi, [esp + 12]",
  "  mov esi, [esp + 16]",
  "  mov ecx, [esp + 20]",
  "  mov eax, edi",
  "  cmp edi, esi",
  "  jbe 2f",
  "  lea edx, [esi + ecx]",
  "  cmp edi, edx",
  "  jae 2f",
  "  lea esi, [esi + ecx - 1]",
  "  lea edi, [edi + ecx - 1]",
  "  std",
  "  rep movsb",
  "  cld",
  "  jmp 3f",
  "2:",
  "  rep movsb",
  "3:",
  "  pop esi",
  "  pop edi",
  "  ret",
  
  ".globl _memset",
  "_memset:",
  "  push edi",
  "  mov edi, [esp + 8]",
  "  mov eax, [esp + 12]",
  "  mov ecx, [esp + 16]",
  "  mov edx, edi",
  "  rep stosb",
  "  mov eax, edx",
  "  pop edi",
  "  ret",
  
  ".globl _memcmp",
  "_memcmp:",
  "  push esi",
  "  push edi",
  "  mov esi, [esp + 12]",
  "  mov edi, [esp + 16]",
  "  mov ecx, [esp + 20]",
  "  xor eax, eax",
  "  repe cmpsb",
  "  je 2f",
  "  movzx eax, byte ptr [esi - 1]",
  "  movzx edx, byte ptr [edi - 1]",
  "  sub eax, edx",
  "2:",
  "  pop edi",
  "  pop esi",
  "  ret",
);

// Stack probe emitted for frames larger than a page, normally provided by the static CRT.
// Probes each page of the requested `eax` bytes and moves esp down by that amount.
// Same as compiler-rt's i386 __chkstk/_alloca.
core::arch::global_asm!(
  ".globl __chkstk",
  "__chkstk:",
  "  push ecx",
  "  cmp eax, 0x1000",
  "  lea ecx, [esp + 8]",
  "  jb 2f",
  "3:",
  "  sub ecx, 0x1000",
  "  test [ecx], ecx",
  "  sub eax, 0x1000",
  "  cmp eax, 0x1000",
  "  ja 3b",
  "2:",
  "  sub ecx, eax",
  "  test [ecx], ecx",
  "  lea eax, [esp + 4]",
  "  mov esp, ecx",
  "  mov ecx, [eax - 4]",
  "  push [eax]",
  "  sub eax, esp",
  "  ret",
);

pub struct HeapAllocator;

unsafe impl GlobalAlloc for HeapAllocator {
  unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
    if layout.align() > 8 { return null_mut(); }
    HeapAlloc(GetProcessHeap(), 0, layout.size()).cast()
  }

  unsafe fn dealloc(&self, ptr: *mut u8, _: Layout) {
    HeapFree(GetProcessHeap(), 0, ptr.cast());
  }
}

/// ASCII string literal as a `&'static [u16]`
macro_rules! wide {
  ($s:literal) => {{
    const S: &[u8] = $s.as_bytes();
    const W: [u16; S.len()] = {
      let mut w = [0u16; S.len()];
      let mut i = 0;
      while i < S.len() {
        w[i] = S[i] as u16;
        i += 1;
      }
      w
    };
    &W as &[u16]
  }};
}

pub fn as_out<T>(ptr: &mut *mut T) -> *mut *mut c_void {
  (ptr as *mut *mut T).cast()
}

pub fn eprint(text: &[u8]) {
  unsafe { write_all(GetStdHandle(STD_ERROR_HANDLE), text) }
}

pub unsafe fn write_all(handle: HANDLE, mut data: &[u8]) {
  while !data.is_empty() {
    let mut written = 0;
    if WriteFile(handle, data.as_ptr(), data.len().min(1 << 20) as u32, &mut written, null_mut()) == 0 || written == 0 { break; }
    data = &data[written as usize..];
  }
}

pub unsafe fn read_all(handle: HANDLE) -> Vec<u8> {
  let mut data = Vec::new();
  let mut buf = [0u8; 4096];
  let mut read = 0;

  while ReadFile(handle, buf.as_mut_ptr(), buf.len() as u32, &mut read, null_mut()) != 0 && read > 0 {
    data.extend_from_slice(&buf[..read as usize]);
  }

  data
}

/// Command line arguments, without NUL terminators
pub fn args() -> Vec<Vec<u16>> {
  unsafe {
    let mut argc = 0;
    let argv = CommandLineToArgvW(GetCommandLineW(), &mut argc);
    if argv.is_null() { return Vec::new(); }

    let args = (0..argc as usize).map(|i| {
      let arg = *argv.add(i);
      let len = lstrlenW(arg) as usize;
      core::slice::from_raw_parts(arg, len).to_vec()
    }).collect();

    LocalFree(argv.cast());
    args
  }
}

/// UTF-8 to UTF-16, without NUL terminator
pub fn utf8_to_wide(text: &[u8]) -> Vec<u16> {
  if text.is_empty() { return Vec::new(); }

  unsafe {
    let len = MultiByteToWideChar(CP_UTF8, 0, text.as_ptr(), text.len() as i32, null_mut(), 0);
    let mut wide = alloc::vec![0u16; len.max(0) as usize];
    MultiByteToWideChar(CP_UTF8, 0, text.as_ptr(), text.len() as i32, wide.as_mut_ptr(), len);
    wide
  }
}

/// UTF-16 to the ANSI code page, NUL terminated
pub fn wide_to_ansi(text: &[u16]) -> Vec<u8> {
  if text.is_empty() { return alloc::vec![0]; }

  unsafe {
    let len = WideCharToMultiByte(CP_ACP, 0, text.as_ptr(), text.len() as i32, null_mut(), 0, core::ptr::null(), null_mut());
    let mut ansi = alloc::vec![0u8; len.max(0) as usize + 1];
    WideCharToMultiByte(CP_ACP, 0, text.as_ptr(), text.len() as i32, ansi.as_mut_ptr(), len, core::ptr::null(), null_mut());
    ansi
  }
}
