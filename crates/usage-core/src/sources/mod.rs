pub mod claude_code;
pub mod codex_cli;
pub mod cursor;
pub mod gemini_cli;

/// Read a transcript as text, replacing invalid UTF-8 instead of failing.
///
/// The tools append to a transcript while it is being read, so the tail can
/// end halfway through a multi-byte character (any CJK text in a prompt). A
/// strict read would reject the whole file until the next write completes it;
/// lossy decoding only spoils that last, incomplete line, which fails to parse
/// as JSON and is skipped like any other.
pub(crate) fn read_lossy(path: &std::path::Path) -> std::io::Result<String> {
    let bytes = std::fs::read(path)?;
    Ok(match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
    })
}
