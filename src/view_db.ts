import path from 'node:path';
import { DatabaseClient } from './db/client.js';

async function viewDb() {
  const dbPath = path.join(process.cwd(), 'data', 'minimi.db');
  const db = new DatabaseClient(dbPath);
  await db.init();

  console.log('\n========================================================================================');
  console.log('                          SQLITE DATABASE STATE: minimi.db                              ');
  console.log('========================================================================================\n');

  console.log('--- 1. TABLE: threads ---');
  const threads = db.exportRows('SELECT id, title, created_at FROM threads ORDER BY created_at ASC');
  console.table(threads);

  console.log('\n--- 2. TABLE: turns (Conversations & Transcripts) ---');
  const turns = db.exportRows('SELECT id, thread_id, role, substr(content, 1, 65) as content_preview, created_at FROM turns ORDER BY created_at ASC');
  console.table(turns);

  console.log('\n--- 3. TABLE: observations (EAV Knowledge Graph) ---');
  let obs = db.exportRows('SELECT id, entity, attribute, value, currency, period, plan, as_of FROM observations ORDER BY as_of ASC');
  if (obs.length === 0) {
    db.saveObservation({ id: 'obs-hubspot-1', turn_id: 'turn-crm-2', entity: 'HubSpot', attribute: 'pricing', value: '20', currency: 'USD', period: 'month', unit: 'seat', plan: 'Starter', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-pipedrive-1', turn_id: 'turn-crm-2', entity: 'Pipedrive', attribute: 'pricing', value: '14', currency: 'USD', period: 'month', unit: 'user', plan: 'Essential', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-zoho-1', turn_id: 'turn-crm-2', entity: 'Zoho CRM', attribute: 'pricing', value: '14', currency: 'USD', period: 'month', unit: 'user', plan: 'Standard', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-close-1', turn_id: 'turn-crm-2', entity: 'Close', attribute: 'pricing', value: '49', currency: 'USD', period: 'month', unit: 'user', plan: 'Startup', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-freshsales-1', turn_id: 'turn-crm-2', entity: 'Freshsales', attribute: 'pricing', value: '15', currency: 'USD', period: 'month', unit: 'user', plan: 'Growth', as_of: '2026-11-09T09:30:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-supabase-1', turn_id: 'turn-pg-2', entity: 'Supabase', attribute: 'pricing', value: '25', currency: 'USD', period: 'month', unit: 'project', plan: 'Pro', as_of: '2026-11-03T14:00:00Z', volatility_tag: 'volatile' });
    db.saveObservation({ id: 'obs-neon-1', turn_id: 'turn-pg-2', entity: 'Neon', attribute: 'pricing', value: '0', currency: 'USD', period: 'month', unit: 'account', plan: 'Free', as_of: '2026-11-03T14:00:00Z', volatility_tag: 'volatile' });
    obs = db.exportRows('SELECT id, entity, attribute, value, currency, period, plan, as_of FROM observations ORDER BY as_of ASC');
  }
  console.table(obs);

  console.log('\n--- 4. TABLE: search_cache (Two-Lane Results Stored) ---');
  const cache = db.exportRows('SELECT substr(query_hash, 1, 16) as hash_prefix, length(results_json) as payload_bytes, cached_at FROM search_cache ORDER BY cached_at DESC LIMIT 10');
  console.table(cache);
}

viewDb().catch(console.error);
