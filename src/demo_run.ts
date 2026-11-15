import dotenv from 'dotenv';
import dns from 'node:dns';
import path from 'node:path';
import { DatabaseClient } from './db/client.js';
import { AgentService } from './agent/agent.js';
import { SearchService } from './tools/search.js';

dotenv.config();
dns.setDefaultResultOrder('ipv4first');

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'minimi.db');
  const db = new DatabaseClient(dbPath);
  await db.init();

  const searchService = new SearchService(process.env.TAVILY_API_KEY, db);
  const agent = new AgentService(db, searchService, process.env.GEMINI_MODEL || 'gemini-3.5-flash');

  console.log('\n================================================================');
  console.log('       1. RUNNING SCENARIO 1: CRM SHORTLIST KNOWLEDGE DECAY     ');
  console.log('================================================================');
  db.createThread('crm-demo-thread', 'CRM Shortlist Review');
  db.saveTurn({
    id: 'turn-crm-1',
    thread_id: 'crm-demo-thread',
    role: 'user',
    content: 'We need to shortlist 5 CRM tools for our 20-person sales team.',
    created_at: '2026-11-09T09:30:00Z',
  });
  db.saveTurn({
    id: 'turn-crm-2',
    thread_id: 'crm-demo-thread',
    role: 'assistant',
    content: `Here are 5 shortlisted CRM tools for a 20-person sales team:
1. HubSpot Sales Hub - $20/seat/mo Starter plan
2. Pipedrive - $14/user/mo Essential plan
3. Zoho CRM - $14/user/mo Standard plan
4. Close - $49/user/mo Startup plan
5. Freshsales - $15/user/mo Growth plan`,
    created_at: '2026-11-09T09:31:00Z',
  });

  // Seed baseline observations
  db.saveObservation({ id: 'obs-hubspot-1', turn_id: 'turn-crm-2', entity: 'HubSpot', attribute: 'pricing', value: '20', currency: 'USD', period: 'month', unit: 'seat', plan: 'Starter', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
  db.saveObservation({ id: 'obs-pipedrive-1', turn_id: 'turn-crm-2', entity: 'Pipedrive', attribute: 'pricing', value: '14', currency: 'USD', period: 'month', unit: 'user', plan: 'Essential', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
  db.saveObservation({ id: 'obs-zoho-1', turn_id: 'turn-crm-2', entity: 'Zoho CRM', attribute: 'pricing', value: '14', currency: 'USD', period: 'month', unit: 'user', plan: 'Standard', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
  db.saveObservation({ id: 'obs-close-1', turn_id: 'turn-crm-2', entity: 'Close', attribute: 'pricing', value: '49', currency: 'USD', period: 'month', unit: 'user', plan: 'Startup', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
  db.saveObservation({ id: 'obs-freshsales-1', turn_id: 'turn-crm-2', entity: 'Freshsales', attribute: 'pricing', value: '15', currency: 'USD', period: 'month', unit: 'user', plan: 'Growth', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });

  const q1 = 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?';
  console.log(`\nUser Query: "${q1}"\n`);
  const res1 = await agent.run(q1, 'crm-demo-thread', { nowOverride: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-crm-3', thread_id: 'crm-demo-thread', role: 'user', content: q1, created_at: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-crm-4', thread_id: 'crm-demo-thread', role: 'assistant', content: res1.text, created_at: '2026-11-14T10:00:15Z' });
  console.log('AGENT OUTPUT:\n' + res1.text);

  console.log('\n================================================================');
  console.log('       2. RUNNING SCENARIO 2: POSTGRES HOSTING PRICING CHECK    ');
  console.log('================================================================');
  db.createThread('pg-demo-thread', 'Postgres Hosting Discussion');
  db.saveTurn({
    id: 'turn-pg-1',
    thread_id: 'pg-demo-thread',
    role: 'user',
    content: 'What are the top managed Postgres hosting providers and their pricing?',
    created_at: '2026-11-03T14:00:00Z',
  });
  db.saveTurn({
    id: 'turn-pg-2',
    thread_id: 'pg-demo-thread',
    role: 'assistant',
    content: `Top Postgres hosting options:
1. Supabase: Pro tier starts at $25/month with 8GB storage and automatic backups.
2. Neon: Serverless Postgres with autoscaling compute and a free tier with 0.5 GB storage.`,
    created_at: '2026-11-03T14:01:00Z',
  });

  db.saveObservation({ id: 'obs-supabase-1', turn_id: 'turn-pg-2', entity: 'Supabase', attribute: 'pricing', value: '25', currency: 'USD', period: 'month', unit: 'project', plan: 'Pro', as_of: '2026-11-03T14:00:00Z', volatility_tag: 'volatile' });
  db.saveObservation({ id: 'obs-neon-1', turn_id: 'turn-pg-2', entity: 'Neon', attribute: 'pricing', value: '0', currency: 'USD', period: 'month', unit: 'account', plan: 'Free', as_of: '2026-11-03T14:00:00Z', volatility_tag: 'volatile' });

  const q2 = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';
  console.log(`\nUser Query: "${q2}"\n`);
  const res2 = await agent.run(q2, 'pg-demo-thread', { nowOverride: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-pg-3', thread_id: 'pg-demo-thread', role: 'user', content: q2, created_at: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-pg-4', thread_id: 'pg-demo-thread', role: 'assistant', content: res2.text, created_at: '2026-11-14T10:00:15Z' });
  console.log('AGENT OUTPUT:\n' + res2.text);

  console.log('\n================================================================');
  console.log('       3. RUNNING SCENARIO 3: 3 NOVEMBER HISTORICAL QUESTION     ');
  console.log('================================================================');
  db.createThread('nov3-demo-thread', 'Headless Browser Advice');
  db.saveTurn({
    id: 'turn-nov3-1',
    thread_id: 'nov3-demo-thread',
    role: 'user',
    content: 'Can you recommend a fast headless browser for web scraping?',
    created_at: '2026-11-03T11:00:00Z',
  });
  db.saveTurn({
    id: 'turn-nov3-2',
    thread_id: 'nov3-demo-thread',
    role: 'assistant',
    content: 'I recommend Playwright. It has official support for Chromium, Firefox, and WebKit with fast async execution and auto-waiting.',
    created_at: '2026-11-03T11:01:00Z',
  });

  const q3 = 'What did I ask you on 3 November? Is your answer still correct today?';
  console.log(`\nUser Query: "${q3}"\n`);
  const res3 = await agent.run(q3, 'nov3-demo-thread', { nowOverride: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-nov3-3', thread_id: 'nov3-demo-thread', role: 'user', content: q3, created_at: '2026-11-14T10:00:00Z' });
  db.saveTurn({ id: 'turn-nov3-4', thread_id: 'nov3-demo-thread', role: 'assistant', content: res3.text, created_at: '2026-11-14T10:00:15Z' });
  console.log('AGENT OUTPUT:\n' + res3.text);

  console.log('\n================================================================');
  console.log('                 DATABASE DUMP & INSPECTION                     ');
  console.log('================================================================\n');

  // Dump threads
  const threads = db.exportRows('SELECT id, title, created_at FROM threads ORDER BY created_at ASC');
  console.log('TABLE: threads');
  console.table(threads);

  // Dump turns
  const turns = db.exportRows('SELECT id, thread_id, role, substr(content, 1, 60) as preview, created_at FROM turns ORDER BY created_at ASC');
  console.log('\nTABLE: turns (recent)');
  console.table(turns);

  // Dump cache
  const cacheCount = db.exportRows('SELECT count(*) as total_cached_queries FROM search_cache');
  console.log('\nTABLE: search_cache');
  console.table(cacheCount);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
