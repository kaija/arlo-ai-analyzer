//! The macOS login keychain, read through `/usr/bin/security`.
//!
//! Claude Code stores its sign-in with that same tool (`security
//! add-generic-password`), so the item's access list already trusts it and
//! reading it back raises no prompt. Elsewhere there is no keychain to read:
//! the tools keep their sign-in in a file instead.

/// A refusal (Deny in the access prompt, a locked keychain) is remembered for
/// the rest of the run, so the user isn't asked again at every re-check.
#[cfg(target_os = "macos")]
static REFUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The secret of the generic-password item named `service`: `Ok(None)` when
/// there is no such item, `Err` when it exists but can't be read.
#[cfg(target_os = "macos")]
pub fn read_generic_password(service: &str) -> Result<Option<String>, String> {
    use std::sync::atomic::Ordering;
    // errSecItemNotFound, as `security`'s exit status (the OSStatus's low byte).
    const NOT_FOUND: i32 = 44;
    if REFUSED.load(Ordering::Relaxed) {
        return Err("keychain access was refused earlier".into());
    }
    let output = std::process::Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service, "-w"])
        .output()
        .map_err(|e| e.to_string())?;
    match output.status.code() {
        Some(0) => Ok(Some(String::from_utf8_lossy(&output.stdout).trim().to_string())),
        Some(NOT_FOUND) => Ok(None),
        _ => {
            REFUSED.store(true, Ordering::Relaxed);
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn read_generic_password(_service: &str) -> Result<Option<String>, String> {
    Ok(None)
}
