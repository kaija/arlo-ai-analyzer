//! Reading claims out of a JWT the tool saved — never verifying one. The
//! signature doesn't matter here: the token came from the user's own disk,
//! and nothing is authorised on the strength of what it says.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::Value;

/// The payload of `header.payload.signature`, or None if it isn't one.
pub fn claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    serde_json::from_slice(&bytes).ok()
}

#[cfg(test)]
pub fn encode(claims: &Value) -> String {
    format!("e30.{}.sig", URL_SAFE_NO_PAD.encode(claims.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_a_payload() {
        let payload = json!({"email": "dev@example.com", "exp": 1_900_000_000});
        assert_eq!(claims(&encode(&payload)), Some(payload));
    }

    #[test]
    fn rejects_things_that_are_not_jwts() {
        assert_eq!(claims("not-a-jwt"), None);
        assert_eq!(claims("a.!!!.c"), None);
    }
}
