use std::path::PathBuf;

/// The user's real home directory.
///
/// Not `$HOME`: inside the Mac App Sandbox `$HOME` is the app's container
/// (`~/Library/Containers/<bundle id>/Data`), so `~/.claude` resolved from it
/// never exists. The password database still reports the real one. That path
/// is only readable once the user grants access to it (see the security-scoped
/// bookmarks in `src-tauri`), but it is the right place to point the folder
/// picker at, and outside the sandbox it is readable as-is.
#[cfg(unix)]
pub fn real_home_dir() -> Option<PathBuf> {
    use std::ffi::{CStr, OsStr};
    use std::os::unix::ffi::OsStrExt;

    let mut buf = vec![0 as libc::c_char; 4096];
    let mut pwd: libc::passwd = unsafe { std::mem::zeroed() };
    let mut result: *mut libc::passwd = std::ptr::null_mut();
    // SAFETY: every pointer is to a live local buffer of the stated size;
    // `pw_dir` is only read when the call succeeded and filled `result`.
    let rc = unsafe {
        libc::getpwuid_r(libc::getuid(), &mut pwd, buf.as_mut_ptr(), buf.len(), &mut result)
    };
    if rc == 0 && !result.is_null() && !pwd.pw_dir.is_null() {
        let dir = unsafe { CStr::from_ptr(pwd.pw_dir) };
        if !dir.to_bytes().is_empty() {
            return Some(PathBuf::from(OsStr::from_bytes(dir.to_bytes())));
        }
    }
    dirs::home_dir()
}

#[cfg(not(unix))]
pub fn real_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_home_dir_is_absolute() {
        let home = real_home_dir().expect("a home directory");
        assert!(home.is_absolute());
    }
}
