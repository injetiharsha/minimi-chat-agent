# DESIGN.md

## The problem, reframed

The example questions ("has any of them changed pricing since Monday?", "is your answer still correct today?", "has any pricing changed since last Tuesday?") are not ordinary search questions. They are **diff questions between two evidence sets**: what was said and cited at baseline time T0, and what the web says now. 

This agent serves as a bridge between those two evidence sets. Search is the instrument, not the product.

Core architectural principle: **the LLM proposes, code verifies.** The model is assigned only tasks requiring semantic judgment (intent disambiguation, entity extraction from past prose, synthesis). Everything knowable by code—timestamps, database lookups, verbatim numeric matching, domain validation, and retries—is strictly deterministic.

---

## Core tradeoff

**Verified-but-possibly-incomplete beats complete-but-unverified.** 

A response that explicitly states *"Could not verify in time; last known $25/mo as of 3 Nov"* is far superior to an unverified hallucination. Speed and accuracy are budgeted per request type rather than globally:
- **The Fast Path (chit-chat, general coding, static facts):** Bypasses search and answers immediately.
- **The Bridge Path (temporal diffs, "since", "still correct", "changed"):** Allocates its latency budget to multi-source verification. Searches run in a single batched parallel fan-out by default; a second round is triggered only if time remains and only for entities that returned empty.

---

## Request pipeline

```
message + now + tz
  ├──► [1. Cue Detector]        (recall | revalidate | fresh | chit-chat)      [Code]
  ├──► [2. Time Resolver]       (chrono-node + rules -> absolute windows)      [Code]
  ├──► [3. Memory Matcher]      (SQLite window + FTS -> baseline packet)       [Code]
  ├──► [4. Instant Preamble]    (Streamed over SSE: "Found 3 Nov chat...")     [Code]
  ├──► [5. Plan Call]           (One batched web_search for all entities)      [LLM]
  ├──► [6. Per-Entity Fan-Out]  (State lane + Change lane, retries)            [Code]
  ├──► [7. Synthesis]           (JSON shape: previous vs current, status)      [LLM]
  ├──► [8. Validator & Repair]  (Verbatim numbers, citation checks)            [Code]
  └──► [9. Render & Persist]    (Streamed delta table + SQLite commit)         [Code]
```

**Memory is context assembly, not an external tool.** The model sees strictly one tool—`web_search`—as required by the hiring brief. Historical retrieval occurs deterministically at the application layer before the model executes, eliminating SQL hallucination and saving an LLM inference round-trip.

---

## Time awareness

The clock (`now`, timezone) is injected into every turn and can be overridden via `NOW_OVERRIDE` to make tests 100% deterministic.

Natural language timestamps are resolved via `chrono-node` paired with deterministic rule constraints:
- A bare weekday ("Monday") means the most recent past occurrence.
- "3 November" without a specified year means the most recent past occurrence.
- "Last week" resolves to a bounded date window.
- "Since then" means $T_{\text{baseline}}$ to $T_{\text{now}}$.

Ambiguous phrases ("last Tuesday") produce candidate dates, which are matched against conversation history by topic. The final answer explicitly cites the exact conversation timestamp it matched. If no historical turn matches, the agent admits it has no record and asks the user for the specifics, rather than inventing past history. The model only ever operates on absolute ISO dates.

---

## Storage & Data Model (SQLite, WAL Mode)

The database schema is universal and avoid domain-specific hardcoding:
- `threads`: Conversation sessions (`id`, `title`, `created_at`).
- `turns`: Raw message text, UTC timestamps, roles, and FTS5 full-text indexing.
- `sources`: Canonical URLs, retrieval timestamps, content hashes, provider metadata, and HTTP status.
- `observations`: Generic Entity-Attribute-Value (EAV) records:
  - Columns: `entity`, `attribute`, `value`, `currency`, `period`, `unit`, `plan`, `billing`, `as_of`, `source_id`, `supersedes_id`, `volatility_tag`.
  - One unified schema accommodates CRM pricing tiers, Postgres hosting plans, and general factual claims. Rechecks insert a new observation row referencing `supersedes_id`, providing audit history.
- `entities`: Canonical entity names, aliases, verified official domains.
- `cache`: Short-TTL HTTP search cache to avoid duplicate queries.

Our structured answers write observation rows automatically. Historical free-text imports are parsed lazily only when matched by a query, then cached. `POST /api/import` accepts timestamped history payloads for grader evaluation.

---

## The Single Search Tool (`web_search`)

The model is exposed to exactly one tool:
```typescript
web_search({ items: [{ entity: string, attribute: string, since?: string }] })
```
All entities (e.g. all 5 CRMs) are requested in a single batched call. Under the hood, code fans out execution using `Promise.allSettled` across two distinct lanes per entity:

1. **The State Lane (Undated Official Extract):** Fetches the official pricing or product page directly with no date filter. (Pricing pages are evergreen and lack publication dates; applying a date filter here would silently drop them).
2. **The Change Lane (Date-Filtered Search):** Executes Tavily search with `start_date = T_baseline` targeting changelogs, release notes, and announcement posts published after the baseline.

### Escalation Ladder & Page Classification
Each entity attempts retrieval through a progressive escalation ladder:
`Official Domain Page` ──► `Domain-Scoped Search` ──► `Open Web (Labeled Third-Party)` ──► `Direct Fetch Fallback`

Page outcomes are classified deterministically in code:
`found` | `no_public_pricing` | `login_required` | `blocked` | `not_found` | `timeout` | `ambiguous_entity`

### Money Handling
Currencies are stored as the page displays them (`₹`, `$`, `EUR`, `USD`), never converted. An item is marked `changed` only when currency, billing period, unit, and plan match the baseline; otherwise, it is classified as `not_comparable`, with both raw values presented side-by-side.

---

## Answering, Synthesis & Output Validation

The synthesizer returns structured JSON with an assigned shape (`brief | table | report | chat`):
- Each item records: `entity`, `previous_value`, `current_value`, `dates`, `source`, and a verified status:
  - `verified`: Confirmed with fresh source evidence.
  - `changed`: Proved change after baseline date with citation.
  - `no_change_found`: Verified current sources show no price increase or major update (never claim absolute "unchanged").
  - `not_comparable`: Baseline and current metrics use mismatched units/currencies.
  - `unverified`: Scrapers blocked, login required, or timed out (reason explicitly stated).
  - `stale`: Returned from cache due to network degradation.

### Post-Model Deterministic Validation
Before streaming to the UI, deterministic code enforces 3 invariant checks:
1. **Verbatim Number Verification:** Every numeric value in the output must exist verbatim in the scraped source text. If an LLM invents a number, the item is downgraded to `unverified`.
2. **Citation Integrity:** Every citation link must exist in the retrieved sources set.
3. **Prompt Injection Defense:** Scraped web page text is treated strictly as quoted data, never as executable model instructions.

---

## Resilience & Latency Targets

### Resilience Policy (`withResilience`)
All operations (LLM, Tavily, SQLite, Network) are wrapped in a shared resilience policy:
- Up to 3 attempts, each changing strategy (e.g., direct extract ──► domain search ──► open web).
- Per-entity isolation: A failure on 1 CRM tool never fails the remaining 4.
- Hard request deadline (12 seconds max). If the deadline approaches, in-flight searches are aborted and existing evidence is synthesized immediately.
- UI degradation transparency: Degraded rows are visually distinguished in the UI with status pills (e.g., *"Neon: login required, showing last known $0/mo as of 3 Nov"*).

### Latency Profile
- **Time to First Visible Token (Preamble):** 500ms – 1s (Generated deterministically in code before the LLM runs).
- **Fast Path Complete:** 1.5s – 3s.
- **Bridge Path Complete:** 8s – 11s (Parallel search fan-out across all entities).

---

## Considered and Rejected

1. **Agent Frameworks (LangChain, LangGraph, CrewAI):** Rejected due to heavy dependency bloat, high startup latency, and loss of granular control over tool execution and streaming.
2. **Vector Databases (Pinecone, ChromaDB, pgvector):** Rejected because date-window indexing and SQLite FTS5 are 100x faster, local, zero-setup, and provide exact time-bounded retrieval.
3. **Multi-Agent Swarms:** Rejected because sequential multi-agent handoffs add 5–8 seconds of roundtrip latency with zero accuracy gain for single-turn diff verification.
4. **Memory as an LLM Tool:** Rejected because it violates the strict "one tool: web search" rule and wastes an LLM inference roundtrip.
5. **LLM Claim-Extraction at Write Time:** Rejected as fragile and slow. Structured response schemas write observations for free; past text is parsed lazily on match.
6. **Currency Conversion:** Rejected because converting currencies introduces synthetic exchange-rate noise. We report raw figures verbatim.
7. **Proving "Unchanged":** Rejected as an epistemic impossibility from search alone. We use `no_change_found_in_sources_checked`.

---

## Automated Evaluation Harness (`npm run eval`)

The evaluation harness executes offline without spending live API credits:
- Seeds a local SQLite database with known historical scenarios (e.g. Monday CRM shortlist, Nov 3 Postgres query).
- Injects a mock search provider returning deterministic fixtures and overrides the clock via `NOW_OVERRIDE`.
- Runs structural assertions:
  - Correct detection of volatile vs stable claims.
  - Verification that all 5 entities are evaluated with zero dropped items.
  - "No record found" behavior when querying missing history.
  - Proper assignment of `changed` vs `no_change_found` vs `not_comparable`.
  - Request completion within the 12-second deadline.

---

## Assumptions

- Past conversation history is delivered either through active session threads or via `POST /api/import`.
- Web pages may localize pricing by server geography; the agent records the exact currency symbol observed.

---

## With Another Week (The minimi Product Fit)

Minimi's vision is an AI that lives on your Mac and pings you at the right moment. With another week, we would build:
1. **Background Revalidation Daemon:** A low-power background worker that periodically polls stored `observations` every 24 hours. When a verified price revision or breaking feature ships, it triggers a native macOS desktop notification ("Nudge"), keeping promises alive without user intervention.
2. **Hybrid Semantic Memory:** Augmenting FTS5 with local lightweight embeddings (`transformers.js` running locally on-device) for fuzzy conversational recall.
3. **LLM-as-a-Judge Eval Canary:** An automated evaluation runner testing against live company pricing pages weekly to catch real-world drift.
