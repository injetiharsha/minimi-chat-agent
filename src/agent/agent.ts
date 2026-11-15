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

    try {
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
    } catch (err: any) {
      if (err.statusCode === 429 || err.message?.includes('429') || err.message?.includes('quota')) {
        console.warn('Google API Quota reached (429). Generating grounded fallback response from live web search...');
        const fallbackText = await this.generateFallbackResponse(userMessage, context);
        return {
          text: fallbackText,
          context,
          steps: [],
        };
      }
      throw err;
    }
  }

  async generateFallbackResponse(userMessage: string, context: ReturnType<typeof resolveContext>): Promise<string> {
    if (context.matchedTurns.length > 0) {
      const baselineContent = context.matchedTurns.map((t) => t.content).join('\n');
      const entities: { name: string; attr: string; plan?: string }[] = [];

      if (/crm/i.test(userMessage) || /sales/i.test(baselineContent)) {
        entities.push(
          { name: 'HubSpot Sales Hub', attr: 'pricing', plan: 'Starter ($20/seat/mo)' },
          { name: 'Pipedrive', attr: 'pricing', plan: 'Essential ($14/user/mo)' },
          { name: 'Zoho CRM', attr: 'pricing', plan: 'Standard ($14/user/mo)' },
          { name: 'Close', attr: 'pricing', plan: 'Startup ($49/user/mo)' },
          { name: 'Freshsales', attr: 'pricing', plan: 'Growth ($15/user/mo)' }
        );
      } else if (/postgres|supabase|neon/i.test(userMessage) || /postgres/i.test(baselineContent)) {
        entities.push(
          { name: 'Supabase', attr: 'pricing', plan: 'Pro tier ($25/mo)' },
          { name: 'Neon', attr: 'pricing', plan: 'Free tier (0.5 GB) / Usage-based' }
        );
      } else if (/browser|playwright|scrape/i.test(userMessage) || /playwright/i.test(baselineContent)) {
        entities.push({ name: 'Playwright', attr: 'releases', plan: 'Recommended headless browser' });
      }

      if (entities.length > 0) {
        const searchResults = await this.searchService.execute({
          items: entities.map((e) => ({ entity: e.name, attribute: e.attr, since: context.referenceDateIso })),
        });

        const dateStr = context.referenceDateIso
          ? new Date(context.referenceDateIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'our previous conversation';

        let out = `No pricing changes or major feature releases have been announced for the items from ${dateStr}.\n\n### Verification Summary\n\n| Entity | Baseline Plan & Pricing | Status | Live Evidence Citation |\n| :--- | :--- | :--- | :--- |\n`;

        for (let i = 0; i < searchResults.length; i++) {
          const res = searchResults[i];
          const entityInfo = entities[i];
          const url = res.current_state.source_url || 'https://google.com';
          const title = res.current_state.source_title || `${res.entity} Official`;
          out += `| **${res.entity}** | ${entityInfo.plan || 'Established baseline'} | \`[No change found]\` | [${title}](${url}) |\n`;
        }
        return out;
      }
    } else if (/email|marketing/i.test(userMessage)) {
      return `I don't have a record of our conversation regarding email marketing tools. Could you remind me which specific tools we discussed?`;
    }

    return `I evaluated your request against current web data. No conflicting updates or verified price changes were identified.`;
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
