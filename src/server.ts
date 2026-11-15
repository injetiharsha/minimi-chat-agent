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
  agentService = new AgentService(db, searchService);
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

// Dynamic Provider & Available Models endpoint
app.get('/api/models', (c) => {
  const hasGoogle = Boolean(process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);

  const models = [
    {
      id: 'gemini-3.5-flash-lite',
      provider: 'google',
      name: 'Gemini 3.5 Flash Lite',
      badge: 'Fast & Active',
      available: hasGoogle,
      isDefault: true,
    },
    {
      id: 'gemini-flash-lite-latest',
      provider: 'google',
      name: 'Gemini Flash Lite Latest',
      badge: 'Active',
      available: hasGoogle,
      isDefault: false,
    },
    {
      id: 'gemini-3-flash-preview',
      provider: 'google',
      name: 'Gemini 3 Flash Preview',
      badge: 'Active',
      available: hasGoogle,
      isDefault: false,
    },
    {
      id: 'gemini-3.8-flash',
      provider: 'google',
      name: 'Gemini 3.8 Flash',
      badge: 'High Demand',
      available: hasGoogle,
      isDefault: false,
    },
    {
      id: 'gpt-4o',
      provider: 'openai',
      name: 'OpenAI GPT-4o',
      badge: hasOpenAI ? 'Ready' : 'Needs API Key',
      available: hasOpenAI,
      isDefault: false,
    },
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      name: 'OpenAI GPT-4o Mini',
      badge: hasOpenAI ? 'Fast' : 'Needs API Key',
      available: hasOpenAI,
      isDefault: false,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      badge: hasAnthropic ? 'Ready' : 'Needs API Key',
      available: hasAnthropic,
      isDefault: false,
    },
  ];

  return c.json({
    providers: {
      google: hasGoogle,
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      tavily: hasTavily,
    },
    models,
  });
});

// Database Inspection endpoint
app.get('/api/db', (c) => {
  const threads = db.exportRows('SELECT id, title, created_at FROM threads ORDER BY created_at DESC');
  const turns = db.exportRows('SELECT id, thread_id, role, content, created_at FROM turns ORDER BY created_at DESC LIMIT 50');
  const observations = db.exportRows('SELECT * FROM observations ORDER BY as_of DESC LIMIT 50');
  const cacheStats = db.exportRows('SELECT count(*) as total_cached FROM search_cache');
  return c.json({ threads, turns, observations, cacheStats });
});

// History endpoint (supports both /api/history/:threadId and /api/threads/:threadId/turns)
app.get('/api/history/:threadId', (c) => {
  const threadId = c.req.param('threadId');
  const turns = db.getThreadTurns(threadId, 50);
  return c.json({ threadId, turns });
});

app.get('/api/threads/:threadId/turns', (c) => {
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
  const { message, threadId = 'default', nowOverride, timezone, provider, model } = body;

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
    const startTime = Date.now();
    let firstTokenReceived = false;
    let currentToolId = '';
    let currentToolLabel = '';
    let toolStartTime = Date.now();

    try {
      const targetProvider = provider || process.env.LLM_PROVIDER || 'google';
      const primaryModel =
        model ||
        process.env.LLM_MODEL ||
        (targetProvider === 'google' ? 'gemini-3.5-flash-lite' : targetProvider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022');

      const { GEMINI_CASCADE_MODELS } = await import('./agent/agent.js');
      const candidateModels =
        targetProvider === 'google'
          ? Array.from(new Set([primaryModel, ...GEMINI_CASCADE_MODELS]))
          : [primaryModel];

      let fullResponseText = '';
      let successfulModel = '';

      for (const candidate of candidateModels) {
        try {
          console.log(`[Stream] Attempting model: ${candidate} (${targetProvider})`);
          const { streamResult } = agentService.stream(message, threadId, {
            nowOverride,
            timezone,
            provider: targetProvider,
            model: candidate,
            userTurnId,
          });

          // Stream tokens and live tool events
          for await (const part of streamResult.fullStream) {
            if (part.type === 'text-delta') {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                const totalSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                await stream.writeSSE({
                  event: 'telemetry',
                  data: JSON.stringify({
                    id: 'thinking',
                    status: 'done',
                    title: `Thought for ${totalSec}s`,
                  }),
                });
              }

              fullResponseText += part.textDelta;
              await stream.writeSSE({
                event: 'token',
                data: JSON.stringify({ delta: part.textDelta }),
              });
            } else if (part.type === 'tool-call') {
              const calledEntities = (part as any).args?.items?.map((i: any) => i.entity).filter(Boolean) || [];
              const label = calledEntities.length > 0 ? calledEntities.join(', ') : 'live web sources';
              currentToolId = 'tool-' + Date.now();
              currentToolLabel = label;
              toolStartTime = Date.now();
              await stream.writeSSE({
                event: 'telemetry',
                data: JSON.stringify({
                  id: currentToolId,
                  status: 'running',
                  title: `Ran web_search for ${label}`,
                }),
              });
              await stream.writeSSE({
                event: 'status',
                data: JSON.stringify({
                  status: `Searching live web for ${label}...`,
                }),
              });
            } else if (part.type === 'tool-result') {
              const durSec = Math.max(0.1, Math.round((Date.now() - toolStartTime) / 100) / 10);
              await stream.writeSSE({
                event: 'telemetry',
                data: JSON.stringify({
                  id: currentToolId || ('tool-' + Date.now()),
                  status: 'done',
                  title: `Ran web_search for ${currentToolLabel || 'live web sources'}`,
                  time: `${durSec}s`,
                }),
              });
            } else if (part.type === 'error') {
              console.warn(`[Stream] Error part in ${candidate}:`, (part as any).error);
              throw new Error((part as any).error?.message || 'Model stream error');
            }
          }

          if (fullResponseText.trim()) {
            successfulModel = candidate;
            break; // Successfully streamed entire response
          }
        } catch (candidateErr: any) {
          console.warn(`[Stream] Model ${candidate} failed:`, candidateErr.message);
          // If tokens already started flowing to the user, we cannot restart
          if (firstTokenReceived) {
            break;
          }
          // Otherwise, continue cascade to next available model
        }
      }

      if (!fullResponseText.trim()) {
        console.warn('All candidate models exhausted or empty, falling back to grounded synthesis...');
        throw new Error('All candidate models exhausted');
      }

      // Persist assistant turn to SQLite
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
        data: JSON.stringify({ success: true, model: successfulModel }),
      });
    } catch (err: any) {
      console.warn('Streaming error, falling back to grounded synthesis:', err.message);
      try {
        const { resolveContext } = await import('./agent/context.js');
        const context = resolveContext(message, threadId, db, { nowOverride, timezone });

        if (!firstTokenReceived) {
          firstTokenReceived = true;
          const totalSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
          await stream.writeSSE({
            event: 'telemetry',
            data: JSON.stringify({
              id: 'thinking',
              status: 'done',
              title: `Thought for ${totalSec}s`,
            }),
          });
        }

        const fallbackText = await agentService.generateFallbackResponse(message, context);

        const tokens = fallbackText.match(/\S+|\s+/g) || [fallbackText];
        for (const token of tokens) {
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ delta: token }),
          });
          await new Promise((res) => setTimeout(res, 12));
        }

        const assistantTurnId = crypto.randomUUID();
        db.saveTurn({
          id: assistantTurnId,
          thread_id: threadId,
          role: 'assistant',
          content: fallbackText,
          created_at: nowOverride || new Date().toISOString(),
        });

        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ success: true }),
        });
      } catch (innerErr: any) {
        console.error('Fatal fallback error:', innerErr);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: innerErr.message || 'Stream processing failed' }),
        });
      }
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

async function main() {
  await bootstrap();
  const port = Number(process.env.PORT) || 3000;
  console.log(`🚀 minimi-chat-agent running at http://localhost:${port}`);
  serve({
    fetch: app.fetch,
    port,
  });
}

main();
