# AI layer rules — Gajendra Sharma

Scope: sheet items 13 (AI assistant), 14 (Recommendation engine), 15 (Recommendation explanations), and the AI inputs to 16 (Outcome report). Dir: `ai-layer/`. Python 3.13, async, FastAPI service (or router mounted in backend — decide with Jeetpal, log in `decisions.md`).

## Principles
1. **Answer from data, not memory.** The assistant uses **function calling** against the backend data API / a **read-only DB role**. No vector DB (data is structured).
2. **Every figure is traceable.** Each tool call is logged with a `query_id`; answers cite it; frontend opens it via `GET /query/{id}` (SQL/params + rows).
3. **Scope lock:** Blinkit, Delhi, Mumbai, Paper Boat only. If asked about other platforms/brands/sales/ad spend, say it is not in the pilot.
4. **Label estimates** ("estimated sell-out") and **flag untrusted data** when `/quality/issues` reports a problem for the range asked.
5. **Suggestions only** — nothing is executed or submitted; no approval workflow (Part B).
6. No PII; no secrets in prompts or logs; API key via env.

## Assistant (item 13)
- Model: Claude via the Anthropic API (model ID in config, default a current Sonnet; Haiku for cheap classification). Check the `claude-api` skill for current IDs/params.
- Tools (all read-only, typed, whitelisted): `get_summary`, `get_availability`, `get_sellout_estimate`, `get_price_discount`, `get_search_rank`, `compare_cities`, `get_quality_issues`, `list_products`, `list_locations`. Each takes `city/store/product/keyword/from/to`.
- If raw SQL is needed: SELECT-only, allow-listed tables/views, row limit, statement timeout, parsed/validated before execution.
- Endpoint: `POST /assistant/chat` (streaming SSE) → `{ answer, citations:[{query_id,label}], used_estimate:boolean, data_warnings:[] }`.
- Conversation memory: session-scoped, last N turns; stored with `session_id`.
- System prompt kept in `ai-layer/prompts/`, versioned; changes reviewed like code.
- Refuse/redirect gracefully when data is missing; never invent numbers.

## Recommendation engine (item 14)
- **Rule-based** from agreed rules (file `ai-layer/rules/recommendations.yaml`), evaluated on captured data per product × location × city:
  - OOS ≥ N consecutive captures → "restock / escalate" (free)
  - Selling price above MRP or discount depth fell vs previous period → "review price" (free)
  - Rank dropped on keyword while organic → "consider sponsored boost" (**paid**)
  - Delhi vs Mumbai gap in availability/price → "align city" (free)
  - Estimated sell-out spike/drop → "watch/investigate"
- Output per recommendation: `id, city, location, product, action, type (free|paid), priority score, evidence[] (query_ids), created_at, rule_id`.
- Priority = expected impact × urgency × confidence (data-quality-adjusted). Document the formula in the file.
- Endpoint: `GET /recommendations?city=&product=&type=`. Runs after each capture batch and nightly.

## Explanations (item 15)
- `GET /recommendations/{id}/explanation` → plain-language why, using the rule + evidence rows; LLM only phrases it, never decides.
- Follow-up question supported via the assistant with the recommendation as context.
- Nightly batch pre-generates explanations; cache by (rule_id, evidence hash) to save cost.

## Outcome report inputs (item 16)
Provide narrative of what the pilot showed, actual capture volumes vs planning assumption, and what scaling would involve — generated from stored metrics, reviewed by humans.

## Evaluation & tests
- Golden set of ≥30 questions with expected tool calls and numeric answers checked against SQL ground truth; run in CI.
- Tests: tool-arg validation, SQL guard, refusal cases, "no hallucinated numbers" check (every number in answer must appear in a cited result).
- Track latency, tokens/cost per answer; budget alert.
