import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import dotenv from 'dotenv';
import dns from 'node:dns';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseClient } from './db/client.js';
import { AgentService } from './agent/agent.js';
import { SearchService } from './tools/search.js';

dotenv.config();
dns.setDefaultResultOrder('ipv4first');

const app = new Hono();
app.use('*', cors());

const db = new DatabaseClient();
let agentService: AgentService;

async function bootstrap() {
  await db.init();
  const searchService = new SearchService(process.env.TAVILY_API_KEY, db);
  agentService = new AgentService(db, searchService, process.env.GEMINI_MODEL || 'gemini-3.5-flash');
  console.log('✓ Database initialized and AgentService ready');
}

// Health Check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    llm: process.env.GOOGLE_API_KEY ? 'configured' : 'missing_key',
    search: process.env.TAVILY_API_KEY ? 'configured' : 'mock_mode',
    time: new Date().toISOString(),
  });
});

// History endpoint
app.get('/api/history/:threadId', (c) => {
  const threadId = c.req.param('threadId');
  const turns = db.getThreadTurns(threadId, 50);
  return c.json({ threadId, turns });
});

// Import historical context (used by evaluation harness and UI preset seed buttons)
app.post('/api/import', async (c) => {
  const body = await c.req.json();
  const { threadId, title, turns } = body;

  if (!threadId || !Array.isArray(turns)) {
    return c.json({ error: 'Invalid payload. Requires threadId and turns array.' }, 400);
  }

  db.createThread(threadId, title || 'Imported Thread');

  for (const t of turns) {
    db.saveTurn({
      id: t.id || crypto.randomUUID(),
      thread_id: threadId,
      role: t.role,
      content: t.content,
      created_at: t.createdAt || new Date().toISOString(),
      sources: t.sources ? JSON.stringify(t.sources) : '[]',
    });
  }

  return c.json({ success: true, count: turns.length, threadId });
});

// Chat SSE Streaming Endpoint
app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const { message, threadId = 'default', nowOverride, timezone } = body;

  if (!message) {
    return c.json({ error: 'Message is required' }, 400);
  }

  // Ensure thread exists
  db.createThread(threadId, 'Chat Session');

  // Record user message
  const userTurnId = crypto.randomUUID();
  const userCreatedAt = nowOverride || new Date().toISOString();
  db.saveTurn({
    id: userTurnId,
    thread_id: threadId,
    role: 'user',
    content: message,
    created_at: userCreatedAt,
  });

  return streamSSE(c, async (stream) => {
    try {
      const { streamResult, context } = agentService.stream(message, threadId, {
        nowOverride,
        timezone,
      });

      // 1. Emit instant preamble if temporal match detected
      if (context.preamble) {
        await stream.writeSSE({
          event: 'preamble',
          data: JSON.stringify({ text: context.preamble }),
        });
      }

      let fullResponseText = '';

      // 2. Stream tokens and tool call events
      for await (const part of streamResult.fullStream) {
        if (part.type === 'text-delta') {
          fullResponseText += part.textDelta;
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ delta: part.textDelta }),
          });
        } else if (part.type === 'tool-call') {
          await stream.writeSSE({
            event: 'status',
            data: JSON.stringify({
              status: `Searching live web for ${part.args?.items?.map((i: any) => i.entity).join(', ') || 'information'}...`,
            }),
          });
        }
      }

      // 3. Persist assistant turn to SQLite
      const assistantTurnId = crypto.randomUUID();
      db.saveTurn({
        id: assistantTurnId,
        thread_id: threadId,
        role: 'assistant',
        content: fullResponseText,
        created_at: nowOverride || new Date().toISOString(),
      });

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ success: true }),
      });
    } catch (err: any) {
      console.error('Streaming error:', err);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: err.message || 'Stream processing failed' }),
      });
    }
  });
});

// Serve static frontend UI
app.get('*', (c) => {
  const reqPath = c.req.path;
  const filePath = reqPath === '/' ? 'index.html' : reqPath.slice(1);
  const fullPath = path.join(process.cwd(), 'public', filePath);

  if (fs.existsSync(fullPath)) {
    const ext = path.extname(fullPath);
    let contentType = 'text/plain';
    if (ext === '.html') contentType = 'text/html';
    else if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.json') contentType = 'application/json';

    const content = fs.readFileSync(fullPath, 'utf-8');
    return c.body(content, 200, { 'Content-Type': contentType });
  }

  return c.text('Not found', 404);
});

const port = Number(process.env.PORT) || 3000;

bootstrap().then(() => {
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`🚀 minimi-chat-agent running at http://localhost:${port}`);
});
