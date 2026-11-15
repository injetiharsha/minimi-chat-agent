# Minimi Temporal Chat Agent with Web Search

> Built for the **minimi Software Engineering Intern (Bengaluru)** hiring challenge: *"Build the best chat agent with web search you can."*

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002.svg?style=flat-square&logo=hono)](https://hono.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-sql.js_WASM-003B57.svg?style=flat-square&logo=sqlite)](https://sqlite.org/)

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js 20+**
- **Google Gemini API Key** (Default model: `gemini-3.5-flash-lite`, with instant fallback to `gemini-flash-lite-latest` and `gemini-3-flash-preview`)
- **Tavily API Key** (Live web grounding; if omitted, falls back to deterministic offline mock fixtures)

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
# Google Gemini API Key
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

To run the offline evaluation harness covering the challenge scenarios plus memory boundary checks:
```bash
npm run eval
```

This validates:
1. **Scenario 1 (CRM Shortlist Knowledge Decay):** Resolves historical shortlist from Monday, fans out parallel search across HubSpot, Pipedrive, Zoho, Close, and Freshsales, and formats structured status deltas.
2. **Scenario 2 (Postgres Hosting Pricing Check):** Recalls discussion from last Tuesday and evaluates Supabase ($25/mo) and Neon against live pricing pages.
3. **Scenario 3 (Zero Hallucination on Missing Memory):** Inquires about a non-existent past shortlist and asserts the agent honestly states no record exists rather than inventing past context.

---

## 🎯 Hiring Challenge Requirements Matrix

| Challenge Requirement | Implementation |
|---|---|
| **Language & Runtime** | TypeScript on Node.js (`package.json`, `tsconfig.json`) |
| **Strictly One Tool** | Exactly one tool registered with the LLM: `web_search({ items: [{ entity, attribute, since }] })`. Memory is **not** a tool; it is resolved deterministically before the model turn. |
| **Simple Run Contract** | `npm install` then `npm run dev` |
| **API Keys Documented** | Listed clearly in `.env.example` |
| **1-Page Architecture Document** | Fully documented in [`DESIGN.md`](./DESIGN.md) |
| **Temporal Knowledge Decay** | Two-Lane Search architecture separating official pricing from changelogs/announcements |
| **Multi-Model Resilience** | Automatic zero-retry failover cascade across Gemini 3.x models + optional OpenAI & Claude support |

---

## 🏛️ Architecture & Highlights

For a complete breakdown of design decisions, tradeoffs, and future work, read **[`DESIGN.md`](./DESIGN.md)**.
