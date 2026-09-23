# Pricing research: models observed in Codex records

**Verified:** 2026-09-17 (Asia/Taipei)  
**Scope:** This note intentionally records only distinct `model` identifiers extracted from
`~/.codex/sessions` and `~/.codex/archived_sessions`. It does not retain transcript content,
prompts, paths, or other session metadata.

## Observed model IDs and current API rates

All listed OpenAI amounts are USD per one million text tokens (USD/MTok). “Cache write” is
the price documented by OpenAI; OpenAI’s current documentation says it is 1.25 times the
uncached-input rate for GPT-5.6 and GPT-6 Astra. It does not publish the app’s Anthropic-style
5-minute versus 1-hour cache-write tiers, so an estimator must use the single documented
cache-write rate for both fields if its schema requires both.

| Model ID | Input | Cached input / cache read | Cache write | Output | Pricing status and source |
| --- | ---: | ---: | ---: | ---: | --- |
| `gpt-5.5` | $5.00 | $0.50 | — | $30.00 | Published by [OpenAI’s GPT-5.5 model page](https://developers.openai.com/api/docs/models/gpt-5.5). No separate cache-write price is published there. |
| `gpt-5.6-luna` | $0.20 | $0.02 | $0.25 | $1.20 | Published by [OpenAI’s GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna). |
| `gpt-5.6-terra` | $2.00 | $0.20 | $2.50 | $12.00 | Published by [OpenAI’s GPT-5.6 Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra). |
| `gpt-5.6-sol` | $4.00 | $0.40 | $5.00 | $20.00 | Published by [OpenAI’s GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol). The page calls these promotional rates and says they are available at least through 2026-11-21. |
| `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 | Published by [OpenAI’s GPT-6 Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra). |
| `codex-auto-review` | $2.50 | $0.25 | $0.00 | $15.00 | Not a standalone API SKU. The official [ChatGPT Rate Card](https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing) says auto review uses GPT-5.4 and gives these Codex/Work rates; it also states that Codex does not charge cache writes. This is an explicit product-model alias, not an inferred API price. |
| `gemma-4` | $0.00 | $0.00 | $0.00 | $0.00 | The bare identifier is still not a concrete hosted model ID (see below), but Google’s official [Gemini API pricing table](https://ai.google.dev/gemini-api/docs/pricing) lists Gemma 4 as free of charge in its Free Tier and unavailable in Paid Tier. This zero rate is appropriate only for this no-charge/API-free or local-open-weights interpretation. |

The official OpenAI pages do not provide a price-effective start date for these entries. The
rates above are therefore **current as verified on 2026-09-17**, rather than backdated rates.
They also state that requests over 272K input tokens use a long-context multiplier (2× input
and cache rates, 1.5× output) for the GPT-5.6 family and GPT-6 Astra. The table above is the
standard-rate schedule, not an attempt to apply that per-request condition.

## IDs that need an explicit alias or source interpretation

| Model ID | Why no safe price can be assigned |
| --- | --- |
| `codex-auto-review` | This exact identifier is not a standalone public API model ID. The rate-card alias above establishes its Codex/Work price; do not present it as a model with an independently published API price. |
| `gemma-4` | This is a family label, not a complete hosted API model ID or provider endpoint. Google’s [Gemma API guide](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) names `gemma-4-31b-it` and `gemma-4-26b-a4b-it` as supported hosted IDs; Google’s [Gemma overview](https://ai.google.dev/gemma/docs/core) also describes multiple distinct Gemma 4 sizes. The free rate above must not be reused for a paid third-party/Vertex endpoint. |

For reference only: Google publishes a Vertex/Agent Platform rate for **Gemma 4 26B** of
$0.15 input, $0.60 output, and $0.015 cache-hit per MTok in its
[official pricing table](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing).
That does **not** justify applying those amounts to the ambiguous `gemma-4` identifier.

## Implementation implications

1. The IDs that are currently unresolved by the app’s exact/non-Anthropic lookup are
   `gpt-6-astra`, `codex-auto-review`, and `gemma-4`. All three now have safe, documented
   handling: Astra’s exact API rate, the rate-card-backed auto-review alias, and the Gemma
   Free Tier zero rate (with a note that it is not valid for paid third-party hosting).
2. Existing `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.5` entries resolve in the generated
   fallback table. `gpt-5.6-sol` also resolves, but its generated $2.50/$15.00 schedule is
   stale against OpenAI’s currently published $4.00/$20.00 standard rate. Refresh or correct
   that source separately.
3. Do not label an arbitrary unknown model as free. The zero rate is limited to this specific
   `gemma-4` identifier because Google’s official Gemini API table explicitly marks its Gemma 4
   Free Tier as no charge.

## Update 2026-09-23: GPT-6 Sol and Luna

Verified against OpenAI's model pages on 2026-09-23 (Asia/Taipei). Same long-context terms as
the rest of the family (>272K input tokens: 2× input and cache, 1.5× output); cache writes are
1.25× input.

| Model ID | Input | Cached input / cache read | Cache write | Output | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| `gpt-6-sol` | $2.00 | $0.20 | $2.50 | $10.00 | [GPT-6 Sol model page](https://developers.openai.com/api/docs/models/gpt-6-sol) |
| `gpt-6-luna` | $0.10 | $0.01 | $0.125 | $0.50 | [GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) |

Re-checked unchanged: `gpt-6-astra` ($10 / $1 / $12.50 / $50) and `gpt-5.6-sol` ($4 / $0.40 /
$5 / $20, promotional through at least 2026-11-21).

Not added: OpenRouter lists `-pro` variants of GPT-5.6 and GPT-6 at the base rates, but OpenAI
has no page for them (`gpt-6-sol-pro` → 404), and there is no `gpt-6-terra`. They stay priced
from the downloaded catalog. OpenRouter's `openai/gpt-5.6-sol` now shows $2/$10 — GPT-6 Sol's
rate, not OpenAI's published GPT-5.6 Sol rate — which is why the documented entry must keep
priority over the catalog.
