# General rules (everyone)

1. **Scope lock:** Blinkit + Delhi + Mumbai only. If a task needs another platform/city/brand, stop and log a decision in `decisions.md` first.
2. **Contract first:** field names and API shapes live in `rules/data-contract.md`. Change it by PR + note in `decisions.md`; never silently on one side.
3. **Sheet is scope:** features come from *Scope & Functionalities → Part A* (16 items). Nothing from Part B.
4. **Estimates are labelled** as estimates in UI, API docs and code names (`est_`).
5. **Every number is traceable:** each figure on screen or in an assistant answer must map to a real query/record; show capture timestamp.
6. **No secrets in git:** `.env` files ignored; commit `.env.example` only. No proxy/credentials in code.
7. **Respect the platform:** polite rate limits, no CAPTCHA bypass, no abusive request volume.
8. **Git:** branches `backend/<topic>`, `frontend/<topic>`, `ai-layer/<topic>`; small PRs, one reviewer from another area; squash-merge to `main`. Commit style: `area: imperative summary`.
9. **Definition of done:** works on real backend API data, handles empty/error cases, documented in the PR, no unrelated changes.
10. **Dates/time:** store UTC (`scraped_at` ISO-8601), display in IST.
11. **Decisions:** anything that changes scope, stack, schema or API goes in `decisions.md`.
