//! Security-scoped bookmarks: how the sandboxed build keeps read access to a
//! folder the user picked once in the open panel.
//!
//! The open panel grants access only until the process exits. A bookmark
//! created while that grant is live can be resolved on a later launch to get
//! it back, which needs `com.apple.security.files.bookmarks.app-scope`.
//! Outside the sandbox the same calls work and are simply unnecessary.

use std::path::{Path, PathBuf};

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use objc2::runtime::Bool;
    use objc2_foundation::{
        NSData, NSString, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL,
    };

    pub fn create(path: &Path) -> Result<Vec<u8>, String> {
        let url = NSURL::fileURLWithPath_isDirectory(&NSString::from_str(&path.to_string_lossy()), true);
        let data = url
            .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
                NSURLBookmarkCreationOptions::WithSecurityScope
                    | NSURLBookmarkCreationOptions::SecurityScopeAllowOnlyReadAccess,
                None,
                None,
            )
            .map_err(|e| e.localizedDescription().to_string())?;
        Ok(data.to_vec())
    }

    pub fn resolve(bookmark: &[u8]) -> Result<Resolved, String> {
        let data = NSData::with_bytes(bookmark);
        let mut stale = Bool::NO;
        // SAFETY: `stale` outlives the call, which only writes a BOOL to it.
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::WithSecurityScope,
                None,
                &mut stale,
            )
        }
        .map_err(|e| e.localizedDescription().to_string())?;
        // Never balanced with stopAccessing…: the app reads these folders for
        // as long as it runs, and the grant ends with the process anyway.
        // SAFETY: plain Objective-C message on a valid NSURL.
        let _ = unsafe { url.startAccessingSecurityScopedResource() };
        let path = url.path().ok_or("bookmark resolved to a non-file URL")?;
        Ok(Resolved { path: PathBuf::from(path.to_string()), stale: stale.as_bool() })
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::*;

    pub fn create(_path: &Path) -> Result<Vec<u8>, String> {
        Ok(Vec::new())
    }

    pub fn resolve(_bookmark: &[u8]) -> Result<Resolved, String> {
        Err("security-scoped bookmarks are macOS-only".into())
    }
}

pub struct Resolved {
    pub path: PathBuf,
    /// The folder moved or the bookmark format aged; re-create it while access
    /// is live so the next launch still resolves.
    pub stale: bool,
}

pub use imp::{create, resolve};
