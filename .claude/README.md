# Paper Boat Quick-Commerce Intelligence — POC (Part A, 4 weeks)

Source of truth for scope: Google Sheet "PaperBoat – Quick Commerce Marketing Intelligence – Development Plan & Estimation", tabs *Scope & Functionalities* (Part A), *Dev Plan – POC*, *Tech Stack*.
Reference product to imitate (layout only): https://paperboat.assistents.ai/

## POC boundary (do not exceed)
- ONE platform: **Blinkit**
- TWO cities: **Delhi** (New Delhi) and **Mumbai**
- 10–15 priority Paper Boat products (priority list signed off in P0.2)
- Capture 3×/day, raw response kept so parsing can be re-run
- Out of scope: other 8 platforms, other brands, sales/ad-spend data, approval workflow, incrementality, content health, ratings & reviews, catalogue matching, value ledger

## Index
| File | What it holds |
|---|---|
| `plan.md` | 4-week plan, per-developer task lists, milestones |
| `decisions.md` | Decision log (ADR style) — append, never rewrite history |
| `rules/general.md` | Rules for everyone |
| `rules/backend.md` | Jeetpal's rules (capture, DB, API) |
| `rules/frontend.md` | Himanshu's rules (Next.js + TS + Ant Design, Gen Z theme) |
| `rules/ai.md` | Gajendra's rules (assistant, recommendations) |
| `rules/data-contract.md` | Field list + API shape both sides build against |

## Team
| Developer | Area | Owns |
|---|---|---|
| Jeetpal | Backend / data | Blinkit capture (all delivery locations in Delhi + Mumbai), DB, FastAPI |
| Himanshu Singh | Frontend | App shell (sidebar, header, footer), all dashboard screens |
| Gajendra Sharma | AI layer | Assistant chat, recommendation engine + explanations, outcome-report text |

Repo layout (target):
```
backend/   # Jeetpal
frontend/  # Himanshu
ai-layer/  # Gajendra
.claude/   # this folder
```
