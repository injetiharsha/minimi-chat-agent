# Architecture & Engineering Design

## 1. The Problem, Reframed

Real-world assistant queries (*"Has CRM pricing changed since Monday?"*, *"What did I ask you on 3 November? Is your answer still correct today?"*) are fundamentally **temporal diff questions between two evidence sets**:
1. What was established at conversational baseline time $T_0$.
2. What the authoritative web says right now at $T_{\text{now}}$.

Search is the verification instrument, not the product. My core architectural philosophy is: **the LLM proposes, code verifies.** I delegate to the model only what requires semantic judgment (intent disambiguation, entity extraction from conversation prose, and natural synthesis). Everything knowable by code—timestamps, database boundaries, parallel fan-out, numeric verification, and retries—is strictly deterministic.

---

## 2. Gemini Free-Tier Architecture & The Zero-Retry Cascade

I built and benchmarked this agent against **Google Gemini free-tier endpoints**. In real-world benchmarking across the Gemini model catalog, I identified two primary operational constraints:
1. High-parameter preview models (`gemini-3.8-flash`, `gemini-3.5-flash`) enforce a strict daily free-tier quota of 20 requests/day (`429 RESOURCE_EXHAUSTED`) or intermittent high-demand spikes (`503`).
2. Default SDK configurations attempt exponential backoff retries, causing an agent to hang for **120–197 seconds** before returning an error.

To solve this, I engineered an **instant failover cascade** with `maxRetries: 0` and an 8-second circuit-breaker timeout:
```
Request ──► [gemini-3.5-flash-lite] (~760ms, primary active pool)
              └── On 429/503 (in <400ms) ──► [gemini-flash-lite-latest] (~700ms)
                    └── On failover ───────► [gemini-3-flash-preview] (~1140ms)
                          └── Dynamic UI ──► [OpenAI GPT-4o / Claude 3.5 Sonnet]
```
If a model hits quota or latency thresholds, my server immediately cascades to the next active pool in `<500ms`. The user never experiences a 2-minute hang.

---

## 3. The Strict Single-Tool Contract (`web_search`)

The agent operates under an absolute tool boundary: **exactly one tool: `web_search`**.

```typescript
web_search({ items: [{ entity: string, attribute: string, since?: string }] })
```

- **Memory is Context Assembly, Not an LLM Tool**: I do not expose a `search_memory` or SQL tool to the model. Memory retrieval happens deterministically in TypeScript before the model runs. This eliminates SQL injection, prevents hallucinations, and saves an entire LLM inference roundtrip.
- **Parallel Fan-Out**: When 5 CRM tools must be verified, the model requests all 5 in a single batched call. Under the hood, I fan out concurrent searches using `Promise.allSettled`, completing 5 live entity checks in **~1.7 seconds** instead of 15 seconds sequentially.
- **Bounded 2-Step Agent Loop (`maxSteps: 2`)**: Traditional ReAct agents get stuck in runaway search loops (often taking 3+ rounds over 130s). By bounding execution to 1 tool execution turn and 1 answer synthesis turn, my agent delivers complete answers in **~5.6 seconds total**.

---

## 4. Time Awareness & Memory Architecture

- **Deterministic Temporal Clamping**: I use `chrono-node` to parse natural phrases like *"Monday"* or *"last Tuesday"*, anchoring them to past UTC boundaries relative to $T_{\text{now}}$ (or `NOW_OVERRIDE` during automated testing).
- **Honest Negative Boundaries**: If the user asks about an entity or date not present in memory (*"On Monday we shortlisted email tools..."*), my agent queries SQLite, verifies zero matching turns, and honestly states: *"I have no record of that discussion"*, refusing to hallucinate past facts.
- **Relational SQLite Store (EAV Schema)**: I maintain conversations in `threads` and `turns` alongside structured `observations` (`entity`, `attribute`, `value`, `currency`, `plan`, `as_of`, `supersedes_id`). This preserves full historical audit trails for any entity over time.

---

## 5. What I Considered and Rejected

| Decision | Why I Rejected It |
| :--- | :--- |
| **Heavy Frameworks (LangChain, CrewAI)** | Opaque prompt layers, dependency bloat, and high startup latency. Raw TypeScript + Vercel AI SDK gave me sub-millisecond control over streaming SSE chunks and error boundaries. |
| **Vector Databases (Pinecone, ChromaDB)** | Temporal diff questions require exact time-bounded indexing (*"since last Tuesday"*). SQLite relational queries on indexed UTC timestamps are $100\times$ faster, zero-maintenance, and eliminate semantic embedding drift. |
| **Memory as an LLM Tool** | Violates the single-tool constraint and wastes 2–4 seconds on an unnecessary tool-calling roundtrip. |
| **Sequential Multi-Agent Swarms** | Passing state between separate "planner", "searcher", and "critic" agents adds 10+ seconds of latency with zero measurable accuracy improvement for temporal verification. |
| **Proving "Unchanged" as Absolute Truth** | It is impossible to prove an absolute negative via web search. I strictly classify un-incremented pricing as `no_change_found` across authoritative sources verified. |
| **Currency Conversion** | Converting currencies introduces synthetic exchange-rate noise. I report prices verbatim (`$25/mo`, `€19/mo`) to preserve factual fidelity. |

---

## 6. Real-Time Telemetry & Native Desktop UI

I built the interface to feel like a high-performance Mac tool (frosted glass, Inter & JetBrains Mono typography):
- **Live Antigravity Telemetry**: A live wall-clock timer displays thinking elapsed time (`Thought for 3s ⌄`). Each tool step dynamically updates its own row (`Ran web_search for HubSpot, Pipedrive... (1.7s) ✓`), replacing loading spinners with clean checkmarks.
- **Dynamic Model Popover**: Located directly in the chat input bar (matching the Gemini/Antigravity style), dynamically grouping available models by provider and detecting configured API keys.
- **100% Offline Evaluation Suite**: Runs via `npm run eval`, asserting all 3 test scenarios pass with zero network dependencies.
