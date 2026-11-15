import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseClient } from './db/client.js';

/**
 * Universal Dataset Adapter for minimi Hiring Challenge
 * Automatically detects and parses:
 * 1. Array of turns: [{ role, content, timestamp / createdAt / date / time }]
 * 2. Multi-conversation bundle: [{ threadId / id, turns / messages: [...] }]
 * 3. OpenAI / Claude format: { messages: [...] }
 */
async function importDataset(filePath: string) {
  if (!filePath) {
    console.error('Usage: npm run import <path-to-dataset.json>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e: any) {
    console.error(`Invalid JSON file: ${e.message}`);
    process.exit(1);
  }

  const db = new DatabaseClient();
  await db.init();

  let importedCount = 0;
  let threadsCount = 0;

  // Case 1: Array of threads
  if (Array.isArray(data) && data.length > 0 && (data[0].turns || data[0].messages)) {
    for (const item of data) {
      const threadId = item.threadId || item.id || `import-${Date.now()}-${Math.random()}`;
      const title = item.title || 'Imported Thread';
      db.createThread(threadId, title);
      threadsCount++;

      const turns = item.turns || item.messages || [];
      for (const t of turns) {
        db.saveTurn({
          id: t.id || crypto.randomUUID(),
          thread_id: threadId,
          role: t.role || 'user',
          content: t.content || '',
          created_at: t.createdAt || t.timestamp || t.date || t.time || new Date().toISOString(),
        });
        importedCount++;
      }
    }
  }
  // Case 2: Object with messages or turns
  else if (data.messages || data.turns) {
    const threadId = data.threadId || 'imported-session';
    const title = data.title || 'Imported Dataset';
    db.createThread(threadId, title);
    threadsCount++;

    const turns = data.messages || data.turns;
    for (const t of turns) {
      db.saveTurn({
        id: t.id || crypto.randomUUID(),
        thread_id: threadId,
        role: t.role || 'user',
        content: t.content || '',
        created_at: t.createdAt || t.timestamp || t.date || t.time || new Date().toISOString(),
      });
      importedCount++;
    }
  }
  // Case 3: Flat array of turns
  else if (Array.isArray(data)) {
    const threadId = 'imported-flat-session';
    db.createThread(threadId, 'Imported Flat Turns');
    threadsCount++;

    for (const t of data) {
      db.saveTurn({
        id: t.id || crypto.randomUUID(),
        thread_id: t.thread_id || t.threadId || threadId,
        role: t.role || 'user',
        content: t.content || '',
        created_at: t.createdAt || t.timestamp || t.date || t.time || new Date().toISOString(),
      });
      importedCount++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`   DATASET IMPORT SUCCESSFUL: ${importedCount} TURNS, ${threadsCount} THREADS`);
  console.log(`======================================================\n`);
  console.log(`All past conversations are now stored in data/minimi.db and available for temporal search.\n`);
}

const targetFile = process.argv[2];
importDataset(targetFile).catch((e) => {
  console.error('Fatal import error:', e);
  process.exit(1);
});
