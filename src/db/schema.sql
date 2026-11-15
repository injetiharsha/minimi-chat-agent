-- minimi universal database schema

CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,               -- 'user' | 'assistant'
    content TEXT NOT NULL,            -- full rendered prose
    sources TEXT,                     -- JSON array: [{"title": "...", "url": "..."}]
    created_at DATETIME NOT NULL,     -- ISO-8601 UTC timestamp
    FOREIGN KEY(thread_id) REFERENCES threads(id)
);

CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    entity TEXT NOT NULL,             -- e.g. "Supabase", "HubSpot"
    attribute TEXT NOT NULL,          -- e.g. "pricing", "feature"
    value TEXT NOT NULL,              -- e.g. "$25/mo Pro tier"
    currency TEXT,                    -- e.g. "USD", "INR"
    period TEXT,                      -- e.g. "month", "year"
    unit TEXT,                        -- e.g. "seat", "instance"
    plan TEXT,                        -- e.g. "Starter", "Pro"
    as_of DATETIME NOT NULL,
    source_url TEXT,
    supersedes_id TEXT,
    volatility_tag TEXT DEFAULT 'volatile', -- 'volatile' | 'stable'
    FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS search_cache (
    query_hash TEXT PRIMARY KEY,
    results_json TEXT NOT NULL,
    cached_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_time ON turns(created_at);
CREATE INDEX IF NOT EXISTS idx_turns_thread ON turns(thread_id);
CREATE INDEX IF NOT EXISTS idx_obs_entity ON observations(entity);
