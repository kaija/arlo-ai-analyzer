use crate::model::Session;

struct Rate {
    input: f64,
    output: f64,
    cache_write: f64,
    cache_read: f64,
}

// ponytail: static table, not fetched from any vendor pricing API — update by hand when rates change
fn rate_for(model: &str) -> Rate {
    if model.contains("opus") {
        Rate { input: 15.0, output: 75.0, cache_write: 18.75, cache_read: 1.5 }
    } else if model.contains("haiku") {
        Rate { input: 0.8, output: 4.0, cache_write: 1.0, cache_read: 0.08 }
    } else {
        // sonnet and unknown models default to sonnet-tier pricing
        Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.3 }
    }
}

/// Estimated cost in USD from local token counts. Not authoritative billing data.
pub fn estimate_cost(session: &Session) -> f64 {
    let rate = rate_for(session.model.as_deref().unwrap_or(""));
    let per_million = 1_000_000.0;
    session.input_tokens as f64 / per_million * rate.input
        + session.output_tokens as f64 / per_million * rate.output
        + session.cache_creation_tokens as f64 / per_million * rate.cache_write
        + session.cache_read_tokens as f64 / per_million * rate.cache_read
}

/// Estimated cost in USD for a single API request by token counts and model name.
pub fn estimate_request_cost(
    model: &str,
    input: u64,
    output: u64,
    cache_write: u64,
    cache_read: u64,
) -> f64 {
    let rate = rate_for(model);
    let m = 1_000_000.0;
    input as f64 / m * rate.input
        + output as f64 / m * rate.output
        + cache_write as f64 / m * rate.cache_write
        + cache_read as f64 / m * rate.cache_read
}
