import { z } from 'zod';
import crypto from 'node:crypto';
import type { DatabaseClient } from '../db/client.js';

export interface SearchItemQuery {
  entity: string;
  attribute: string;
  since?: string; // ISO date or "Monday", "last week"
}

export interface EntitySearchResult {
  entity: string;
  attribute: string;
  status: 'found' | 'no_public_pricing' | 'login_required' | 'not_found' | 'timeout';
  current_state: {
    text: string;
    source_url?: string;
    source_title?: string;
  };
  recent_changes: {
    text: string;
    source_url?: string;
    source_title?: string;
    date?: string;
  };
}

export const webSearchSchema = z.object({
  items: z.array(
    z.object({
      entity: z.string().describe('The name of the entity, tool, or product, e.g. "Supabase", "HubSpot"'),
      attribute: z.string().describe('What attribute to check, e.g. "pricing", "features", "releases"'),
      since: z.string().optional().describe('Baseline date to look for changes since, e.g. "2026-11-03"'),
    })
  ).describe('List of entities to verify or search information for'),
});

export type WebSearchParams = z.infer<typeof webSearchSchema>;

// Deterministic mock fixtures for offline tests / eval runner
const MOCK_FIXTURES: Record<string, Partial<EntitySearchResult>> = {
  supabase: {
    status: 'found',
    current_state: {
      text: 'Supabase Pro Plan remains $25/month. Includes 8GB disk, 100,000 monthly active users, automated daily backups.',
      source_url: 'https://supabase.com/pricing',
      source_title: 'Supabase Pricing',
    },
    recent_changes: {
      text: 'No price changes since November 2026. Shipped Supabase Index Advisor beta on Nov 8.',
      source_url: 'https://supabase.com/blog/index-advisor',
      source_title: 'Supabase Changelog',
      date: '2026-11-08',
    },
  },
  neon: {
    status: 'found',
    current_state: {
      text: 'Neon Free tier offers 0.5 GB storage. Launch plan at $19/month includes 10 GB storage and autoscaling compute.',
      source_url: 'https://neon.tech/pricing',
      source_title: 'Neon Serverless Postgres Pricing',
    },
    recent_changes: {
      text: 'Neon updated compute hour limits for free tier accounts effective November 6, 2026.',
      source_url: 'https://neon.tech/blog/pricing-update-nov',
      source_title: 'Neon Pricing Update',
      date: '2026-11-06',
    },
  },
  hubspot: {
    status: 'found',
    current_state: {
      text: 'HubSpot Sales Hub Starter: $20/seat/month. Professional: $100/seat/month with minimum 5 seats.',
      source_url: 'https://www.hubspot.com/pricing/sales',
      source_title: 'HubSpot Sales Hub Pricing',
    },
    recent_changes: {
      text: 'No price changes since Monday. Shipped Smart CRM AI Copilot enhancements.',
      source_url: 'https://www.hubspot.com/new',
      source_title: 'HubSpot Updates',
      date: '2026-11-10',
    },
  },
  pipedrive: {
    status: 'found',
    current_state: {
      text: 'Pipedrive Essential: $14/user/month billed annually. Advanced: $29/user/month.',
      source_url: 'https://www.pipedrive.com/en/pricing',
      source_title: 'Pipedrive Pricing',
    },
    recent_changes: {
      text: 'Pipedrive released AI email summaries and new automated sales workflow triggers on Nov 11, 2026.',
      source_url: 'https://www.pipedrive.com/en/blog/product-updates-november-2026',
      source_title: 'Pipedrive Product Releases',
      date: '2026-11-11',
    },
  },
};

export class SearchService {
  private apiKey: string;
  private db?: DatabaseClient;
  private isMock: boolean;

  constructor(apiKey?: string, db?: DatabaseClient) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    this.db = db;
    this.isMock = process.env.MOCK_SEARCH === 'true' || !this.apiKey;
  }

  async execute(params: WebSearchParams): Promise<EntitySearchResult[]> {
    console.log(`  [web_search] Fanning out search for ${params.items.length} items: ${params.items.map(i => i.entity).join(', ')}`);
    const promises = params.items.map((item) => this.searchEntity(item));
    const settled = await Promise.allSettled(promises);

    return settled.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        entity: params.items[idx].entity,
        attribute: params.items[idx].attribute,
        status: 'timeout',
        current_state: {
          text: `Request timed out or failed for ${params.items[idx].entity}. Error: ${result.reason}`,
        },
        recent_changes: {
          text: 'Could not retrieve recent updates within request deadline.',
        },
      };
    });
  }

  private async searchEntity(item: SearchItemQuery): Promise<EntitySearchResult> {
    const entityKey = item.entity.toLowerCase().trim();

    // Check mock mode or mock fixture
    if (this.isMock && MOCK_FIXTURES[entityKey]) {
      const fixture = MOCK_FIXTURES[entityKey];
      return {
        entity: item.entity,
        attribute: item.attribute,
        status: fixture.status || 'found',
        current_state: fixture.current_state || { text: 'Information retrieved.' },
        recent_changes: fixture.recent_changes || { text: 'No changes found in mock fixture.' },
      };
    }

    if (!this.apiKey) {
      return {
        entity: item.entity,
        attribute: item.attribute,
        status: 'found',
        current_state: { text: `[Mock Search] Retrieved baseline state for ${item.entity}.` },
        recent_changes: { text: `[Mock Search] No verified changes found for ${item.entity} since ${item.since || 'baseline'}.` },
      };
    }

    // Cache check
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${item.entity}:${item.attribute}:${item.since || ''}`)
      .digest('hex');

    if (this.db) {
      const cached = this.db.getCachedSearch(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore cache parse failure
        }
      }
    }

    // Parallel Lane 1: State Lane (Current state / pricing page)
    const stateQuery = `${item.entity} ${item.attribute} official`;
    const statePromise = this.callTavily(stateQuery, { max_results: 2, include_raw_content: false });

    // Parallel Lane 2: Change Lane (Recent updates, changelogs, announcements)
    const changeQuery = `${item.entity} ${item.attribute} changes updates announcements`;
    const changePromise = this.callTavily(changeQuery, {
      max_results: 2,
      days: item.since ? 14 : undefined,
    });

    const [stateRes, changeRes] = await Promise.allSettled([statePromise, changePromise]);

    const stateData = stateRes.status === 'fulfilled' ? stateRes.value : null;
    const changeData = changeRes.status === 'fulfilled' ? changeRes.value : null;

    const topState = stateData?.results?.[0];
    const topChange = changeData?.results?.[0];

    const result: EntitySearchResult = {
      entity: item.entity,
      attribute: item.attribute,
      status: topState ? 'found' : 'not_found',
      current_state: {
        text: topState?.content || topState?.title || 'No current state data found.',
        source_url: topState?.url,
        source_title: topState?.title,
      },
      recent_changes: {
        text: topChange?.content || 'No recent change announcements found.',
        source_url: topChange?.url,
        source_title: topChange?.title,
        date: topChange?.published_date,
      },
    };

    if (this.db) {
      this.db.setCachedSearch(cacheKey, JSON.stringify(result));
    }

    return result;
  }

  private async callTavily(
    query: string,
    options: { max_results?: number; days?: number; include_raw_content?: boolean } = {}
  ): Promise<any> {
    const payload: Record<string, any> = {
      api_key: this.apiKey,
      query,
      max_results: options.max_results || 2,
      search_depth: 'basic',
    };

    if (options.days) {
      payload.days = options.days;
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Tavily API responded with status ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }
}
