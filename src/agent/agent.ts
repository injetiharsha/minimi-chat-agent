import dns from 'node:dns';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, tool, type CoreMessage } from 'ai';
import { SearchService, webSearchSchema, type WebSearchParams } from '../tools/search.js';
import { buildSystemPrompt } from './prompt.js';
import { resolveContext } from './context.js';
import type { DatabaseClient } from '../db/client.js';

dns.setDefaultResultOrder('ipv4first');

export class AgentService {
  private db: DatabaseClient;
  private searchService: SearchService;
  private modelName: string;
  private googleProvider: ReturnType<typeof createGoogleGenerativeAI>;
  private lastThoughtSignature: string | null = null;

  constructor(db: DatabaseClient, searchService?: SearchService, modelName: string = 'gemini-3.5-flash') {
    this.db = db;
    this.searchService = searchService || new SearchService(process.env.TAVILY_API_KEY, db);
    this.modelName = modelName;
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

    // Custom fetch to seamlessly handle Google's thoughtSignature contract across multi-step turns
    const customFetch: typeof fetch = async (url, init) => {
      if (init?.body && typeof init.body === 'string') {
        try {
          const parsed = JSON.parse(init.body);
          if (parsed.contents && Array.isArray(parsed.contents)) {
            let modified = false;
            for (const c of parsed.contents) {
              if (c.parts && Array.isArray(c.parts)) {
                for (const p of c.parts) {
                  if (p.functionCall && !p.thoughtSignature && this.lastThoughtSignature) {
                    p.thoughtSignature = this.lastThoughtSignature;
                    modified = true;
                  }
                }
              }
            }
            if (modified) {
              init = { ...init, body: JSON.stringify(parsed) };
            }
          }
        } catch {
          // non-json body, ignore
        }
      }

      const response = await fetch(url, init);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            if (data?.candidates?.[0]?.content?.parts) {
              for (const p of data.candidates[0].content.parts) {
                if (p.thoughtSignature) {
                  this.lastThoughtSignature = p.thoughtSignature;
                }
              }
            }
          })
          .catch(() => {});
      } else if (response.body) {
        // Intercept SSE stream chunks for streaming mode
        const [streamForConsumer, streamForInspector] = response.body.tee();
        const reader = streamForInspector.getReader();
        const decoder = new TextDecoder();

        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value);
              const match = text.match(/"thoughtSignature":\s*"([^"]+)"/);
              if (match) {
                this.lastThoughtSignature = match[1];
              }
            }
          } catch {
            // stream reading finished or aborted
          }
        })();

        return new Response(streamForConsumer, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      return response;
    };

    this.googleProvider = createGoogleGenerativeAI({
      apiKey,
      fetch: customFetch,
    });
  }

  async run(
    userMessage: string,
    threadId: string,
    options: { nowOverride?: string; timezone?: string } = {}
  ) {
    const context = resolveContext(userMessage, threadId, this.db, options);
    const systemPrompt = buildSystemPrompt(context);

    // Prepare message history
    const historyMessages: CoreMessage[] = context.recentTurns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    const messages: CoreMessage[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    const searchToolInstance = tool({
      description: 'Search the live web for recent information, documentation, announcements, or pricing changes.',
      parameters: webSearchSchema,
      execute: async (params: WebSearchParams) => {
        return await this.searchService.execute(params);
      },
    });

    const result = await generateText({
      model: this.googleProvider(this.modelName),
      system: systemPrompt,
      messages,
      tools: {
        web_search: searchToolInstance,
      },
      maxSteps: 5,
    });

    return {
      text: result.text,
      context,
      steps: result.steps,
    };
  }

  stream(
    userMessage: string,
    threadId: string,
    options: { nowOverride?: string; timezone?: string } = {}
  ) {
    const context = resolveContext(userMessage, threadId, this.db, options);
    const systemPrompt = buildSystemPrompt(context);

    const historyMessages: CoreMessage[] = context.recentTurns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    const messages: CoreMessage[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    const searchToolInstance = tool({
      description: 'Search the live web for recent information, documentation, announcements, or pricing changes.',
      parameters: webSearchSchema,
      execute: async (params: WebSearchParams) => {
        return await this.searchService.execute(params);
      },
    });

    const streamResult = streamText({
      model: this.googleProvider(this.modelName),
      system: systemPrompt,
      messages,
      tools: {
        web_search: searchToolInstance,
      },
      maxSteps: 5,
    });

    return {
      streamResult,
      context,
    };
  }
}
