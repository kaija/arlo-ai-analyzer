use crate::model::Session;

/// Per-token rates for a single model, in USD per million tokens.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rate {
    pub input: f64,
    pub output: f64,
    /// Cache write at the 5-minute TTL tier.
    pub cache_write_5m: f64,
    /// Cache write at the 1-hour TTL tier.
    pub cache_write_1h: f64,
    pub cache_read: f64,
}

impl Rate {
    /// Anthropic derives every cache rate from the input rate by a fixed
    /// multiplier: 5-minute write = 1.25x, 1-hour write = 2x, read = 0.1x.
    /// Deriving them beats transcribing five numbers per model — transcription
    /// is what made the old table wrong (opus 1h was priced at the 5m rate).
    fn anthropic(input: f64, output: f64) -> Self {
        Self {
            input,
            output,
            cache_write_5m: input * 1.25,
            cache_write_1h: input * 2.0,
            cache_read: input * 0.1,
        }
    }

    /// Providers that publish a single cache-write rate rather than separate
    /// 5-minute and 1-hour TTL tiers use that rate for both stored fields.
    fn api(input: f64, output: f64, cache_write: f64, cache_read: f64) -> Self {
        Self {
            input,
            output,
            cache_write_5m: cache_write,
            cache_write_1h: cache_write,
            cache_read,
        }
    }
}

// ---------------------------------------------------------------------------
// Rate table — Anthropic families plus exact, documented Codex model IDs.
//
// Exact rates for model IDs observed in Codex transcripts are listed below.
// Everything else returns None and is reported as "rate unknown" rather than
// being charged at a guessed rate — the previous table billed
// `nvidia-nemotron-nano-3-30b` at Sonnet rates, which is worse than admitting
// we don't know.
//
// The frontend also has an OpenRouter-derived fallback for non-observed IDs.
// Keep the exact entries in both layers aligned so backend scans and frontend
// fallback calculations agree.
// ---------------------------------------------------------------------------

/// Models that predate the price drop and still bill at the legacy Opus rate.
/// Closed set — everything newer is on the $5/$25 tier, so unknown Opus models
/// default to the current tier rather than the legacy one.
const LEGACY_OPUS: [&str; 5] = [
    "claude-3-opus",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4.1",
    "opus-4-1",
];

pub fn rate_for(model: &str) -> Option<Rate> {
    let m = model.to_lowercase();
    let m = m.trim_end_matches(":batch").trim_end_matches(":free");

    // Placeholder used by Claude Code for locally generated messages; always
    // zero tokens, never billed.
    if m == "<synthetic>" {
        return None;
    }

    // Exact IDs observed in Codex transcripts, verified against their
    // providers' official price sheets on 2026-09-17. `codex-auto-review` is
    // a rate-card alias for GPT-5.4; bare `gemma-4` is zero only for its
    // documented Gemini API Free Tier/local interpretation. See
    // notes/research/2026-09-17-observed-model-pricing.md for sources.
    let documented = match m {
        "gpt-5.5" => Some(Rate::api(5.0, 30.0, 0.0, 0.5)),
        "gpt-5.6-luna" => Some(Rate::api(0.2, 1.2, 0.25, 0.02)),
        "gpt-5.6-terra" => Some(Rate::api(2.0, 12.0, 2.5, 0.2)),
        "gpt-5.6-sol" => Some(Rate::api(4.0, 20.0, 5.0, 0.4)),
        "gpt-6-astra" => Some(Rate::api(10.0, 50.0, 12.5, 1.0)),
        "codex-auto-review" => Some(Rate::api(2.5, 15.0, 0.0, 0.25)),
        "gemma-4" => Some(Rate::api(0.0, 0.0, 0.0, 0.0)),
        _ => None,
    };
    if documented.is_some() {
        return documented;
    }

    // Model ids appear in several shapes: "claude-opus-5", "claude-opus-4-8",
    // and reversed vendor forms like "claude-5-sonnet-anthropic". Family
    // keyword matching handles all of them.

    // Newer generations break the 0.1x cache-read rule, so they're matched by
    // version before their family. Verified against Anthropic's published
    // rates on 2026-09-23. Mythos 5.1 stays on the family rate: whether it
    // shares Fable 5.1's cache-read price is unannounced.
    if m.contains("fable-5-1") || m.contains("fable-5.1") {
        return Some(Rate { cache_read: 0.25, ..Rate::anthropic(10.0, 50.0) });
    }
    if m.contains("opus-5-5") || m.contains("opus-5.5") {
        return Some(Rate { cache_read: 0.2, ..Rate::anthropic(4.0, 20.0) });
    }

    if m.contains("fable") || m.contains("mythos") {
        return Some(Rate::anthropic(10.0, 50.0));
    }

    if m.contains("opus") {
        if LEGACY_OPUS.iter().any(|legacy| m.contains(legacy)) || m == "claude-opus-4" {
            return Some(Rate::anthropic(15.0, 75.0));
        }
        return Some(Rate::anthropic(5.0, 25.0));
    }

    if m.contains("haiku") {
        if m.contains("claude-3-haiku") || m.ends_with("/claude-3-haiku") {
            return Some(Rate::anthropic(0.25, 1.25));
        }
        if m.contains("3-5-haiku") || m.contains("3.5-haiku") {
            return Some(Rate::anthropic(0.8, 4.0));
        }
        // Haiku 4.5 and later.
        return Some(Rate::anthropic(1.0, 5.0));
    }

    if m.contains("sonnet") || m.contains("claude-3-5") || m.contains("claude-3-7") {
        // Every Sonnet from 3.5 through 5 has shipped at $3/$15. Must come
        // after haiku: "claude-3-5-haiku" also contains "claude-3-5".
        return Some(Rate::anthropic(3.0, 15.0));
    }

    None
}

/// Estimated cost in USD for a single API request.
///
/// Returns `None` when the model has no known rate — callers should surface
/// that as "unknown", not as $0.
pub fn estimate_request_cost(
    model: &str,
    input: u64,
    output: u64,
    cache_write_5m: u64,
    cache_write_1h: u64,
    cache_read: u64,
) -> Option<f64> {
    let rate = rate_for(model)?;
    let m = 1_000_000.0;
    Some(
        input as f64 / m * rate.input
            + output as f64 / m * rate.output
            + cache_write_5m as f64 / m * rate.cache_write_5m
            + cache_write_1h as f64 / m * rate.cache_write_1h
            + cache_read as f64 / m * rate.cache_read,
    )
}

/// Estimated cost in USD for a Session.
///
/// When `cost_usd` is already populated (set by per-request accumulation
/// during scanning), use it directly. Otherwise fall back to a single-rate
/// estimate from the session's aggregate tokens — useful for sessions from
/// sources that don't support per-request parsing.
pub fn estimate_cost(session: &Session) -> f64 {
    if session.cost_usd > 0.0 {
        return session.cost_usd;
    }
    // Fallback: single-rate estimate. The 5m/1h split isn't retained at
    // session level, so all cache creation is charged at the 1h tier.
    estimate_request_cost(
        session.model.as_deref().unwrap_or(""),
        session.input_tokens,
        session.output_tokens,
        0,
        session.cache_creation_tokens,
        session.cache_read_tokens,
    )
    .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The bug this table was rewritten to fix: `contains("opus")` used to
    /// return Claude 3 Opus rates for every Opus model, overcharging Opus 5
    /// and 4.8 by ~170%.
    #[test]
    fn current_opus_is_not_billed_at_legacy_opus_rates() {
        let opus5 = rate_for("claude-opus-5").unwrap();
        assert_eq!(opus5.input, 5.0);
        assert_eq!(opus5.output, 25.0);
        assert_eq!(rate_for("claude-opus-4-8").unwrap(), opus5);

        let legacy = rate_for("claude-3-opus").unwrap();
        assert_eq!(legacy.input, 15.0);
        assert_eq!(rate_for("claude-opus-4-1").unwrap(), legacy);
    }

    #[test]
    fn cache_rates_are_derived_from_input() {
        let r = rate_for("claude-sonnet-5").unwrap();
        assert_eq!(r.input, 3.0);
        assert_eq!(r.cache_write_5m, 3.75);
        assert_eq!(r.cache_write_1h, 6.0);
        assert!((r.cache_read - 0.3).abs() < 1e-12);
    }

    #[test]
    fn families_resolve_across_id_shapes() {
        assert_eq!(rate_for("claude-fable-5").unwrap().input, 10.0);
        // Reversed vendor form seen in real transcripts.
        assert_eq!(rate_for("claude-5-sonnet-anthropic").unwrap().input, 3.0);
        assert_eq!(rate_for("claude-4.5-haiku-anthropic").unwrap().input, 1.0);
        assert_eq!(rate_for("claude-haiku-4-5-20251001").unwrap().input, 1.0);
        assert_eq!(rate_for("claude-3-5-haiku").unwrap().input, 0.8);
        assert_eq!(rate_for("claude-3-haiku").unwrap().input, 0.25);
    }

    #[test]
    fn observed_codex_models_have_documented_rates() {
        let sol = rate_for("gpt-5.6-sol").unwrap();
        assert_eq!(sol.input, 4.0);
        assert_eq!(sol.output, 20.0);
        assert_eq!(sol.cache_write_5m, 5.0);
        assert_eq!(sol.cache_read, 0.4);

        let astra = rate_for("gpt-6-astra").unwrap();
        assert_eq!(astra.input, 10.0);
        assert_eq!(astra.output, 50.0);
        assert_eq!(astra.cache_write_1h, 12.5);
        assert_eq!(astra.cache_read, 1.0);

        let auto_review = rate_for("codex-auto-review").unwrap();
        assert_eq!(auto_review.input, 2.5);
        assert_eq!(auto_review.output, 15.0);
        assert_eq!(auto_review.cache_read, 0.25);

        assert_eq!(rate_for("gemma-4").unwrap(), Rate {
            input: 0.0,
            output: 0.0,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.0,
        });
    }

    #[test]
    fn newest_generations_use_their_own_cache_read_rate() {
        for id in ["claude-opus-5-5", "claude-opus-5.5", "anthropic/claude-opus-5.5"] {
            let r = rate_for(id).unwrap();
            assert_eq!((r.input, r.output, r.cache_read), (4.0, 20.0, 0.2), "{id}");
            assert_eq!((r.cache_write_5m, r.cache_write_1h), (5.0, 8.0), "{id}");
        }
        for id in ["claude-fable-5-1", "anthropic/claude-fable-5.1"] {
            let r = rate_for(id).unwrap();
            assert_eq!((r.input, r.output, r.cache_read), (10.0, 50.0, 0.25), "{id}");
        }
        // The previous generation is unchanged.
        assert_eq!(rate_for("claude-opus-5").unwrap().cache_read, 0.5);
        assert_eq!(rate_for("claude-fable-5").unwrap().cache_read, 1.0);
    }

    #[test]
    fn unknown_models_are_unpriced_rather_than_guessed() {
        for model in [
            "nvidia-nemotron-nano-3-30b-aws",
            "openrouter/auto",
            "z-ai/glm-5.2",
            "openai.gpt-5.6-terra",
            "<synthetic>",
            "",
        ] {
            assert!(rate_for(model).is_none(), "{model} should be unpriced");
            assert!(estimate_request_cost(model, 100, 100, 100, 100, 100).is_none());
        }
    }

    #[test]
    fn request_cost_charges_each_tier_at_its_own_rate() {
        // sonnet-5: in 3, out 15, cw5m 3.75, cw1h 6, cr 0.3
        let cost = estimate_request_cost("claude-sonnet-5", 1000, 1000, 1000, 1000, 1000).unwrap();
        let expected = (3.0 + 15.0 + 3.75 + 6.0 + 0.3) / 1000.0;
        assert!((cost - expected).abs() < 1e-12, "{cost} != {expected}");
    }
}
