# Minimi — Temporal Chat Agent with Web Search

A high-performance conversational agent designed to evaluate temporal knowledge decay and real-time web verification.

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002.svg?style=flat-square&logo=hono)](https://hono.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-sql.js_WASM-003B57.svg?style=flat-square&logo=sqlite)](https://sqlite.org/)

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js 20+**
- **Google Gemini API Key** (Optimized for **Gemini Free Tier**, with an automatic zero-retry cascade across `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, and `gemini-3-flash-preview`)
- **Tavily API Key** (Live web grounding; if omitted, the agent falls back to deterministic offline mock fixtures)

### 2. Installation
```bash
git clone https://github.com/injetiharsha/minimi-chat-agent.git
cd minimi-chat-agent
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate your keys:
```ini
# Google Gemini API Key (Gemini Free Tier supported)
GOOGLE_API_KEY="your_gemini_api_key"

# Tavily Search API Key
TAVILY_API_KEY="your_tavily_api_key"

# Port (default 3000)
PORT=3000

# Optional Multi-Provider Keys (Enables GPT-4o and Claude in the UI popover)
# OPENAI_API_KEY="your_openai_api_key"
# ANTHROPIC_API_KEY="your_anthropic_api_key"
```

### 4. Run Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Automated Evaluation Suite

To run the offline evaluation harness covering the test scenarios plus memory boundary checks:
```bash
npm run eval
```

This validates:
1. **Scenario 1 (CRM Shortlist Knowledge Decay):** Resolves historical shortlist from Monday, fans out parallel search across HubSpot, Pipedrive, Zoho, Close, and Freshsales, and formats structured status deltas.
2. **Scenario 2 (Postgres Hosting Pricing Check):** Recalls discussion from last Tuesday and evaluates Supabase ($25/mo) and Neon against live pricing pages.
3. **Scenario 3 (Zero Hallucination on Missing Memory):** Inquires about a non-existent past shortlist and asserts the agent honestly states no record exists rather than inventing past context.

---

## 🎯 Architectural Invariants

- **Strictly One Tool (`web_search`)**: The model sees exactly one tool. Memory is not a tool; I resolve historical context deterministically at the application layer before calling the model, eliminating SQL hallucinations and saving an LLM hop.
- **Gemini Free-Tier Engineering**: Rather than letting the agent stall for 2+ minutes when a free-tier quota is hit on `gemini-3.8-flash` (20 req/day limit), I engineered an instantaneous fallback cascade (`maxRetries: 0`) that shifts to active models (`gemini-3.5-flash-lite`) in under 500ms.
- **Unified Parallel Search**: When verifying multiple entities, I fan out search queries concurrently via `Promise.allSettled`, completing 5 live entity verifications in **~1.7 seconds** and full streaming responses in **~5.6 seconds**.
- **Gemini/Antigravity Style UI**: Features a live wall-clock thinking timer (`Thought for 3s ⌄`), real-time tool status badges, a Home reset button, and a dynamic model picker popover inside the input bar.

For a detailed breakdown of architectural decisions, tradeoffs, and design choices, please read **[`DESIGN.md`](./DESIGN.md)**.
