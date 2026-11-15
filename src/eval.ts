import dotenv from 'dotenv';
import dns from 'node:dns';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseClient } from './db/client.js';
import { AgentService } from './agent/agent.js';
import { SearchService } from './tools/search.js';

dotenv.config();
dns.setDefaultResultOrder('ipv4first');

// Ensure test directory
const testDbPath = path.join(process.cwd(), 'data', 'eval_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new DatabaseClient(testDbPath);
const searchService = new SearchService(process.env.TAVILY_API_KEY, db);
const agent = new AgentService(db, searchService, process.env.GEMINI_MODEL || 'gemini-3.5-flash');

interface EvalTestCase {
  name: string;
  seedThread?: {
    threadId: string;
    turns: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>;
  };
  query: string;
  threadId: string;
  nowOverride: string;
  expectedInOutput: string[];
  forbiddenInOutput?: string[];
}

const TEST_CASES: EvalTestCase[] = [
  {
    name: 'Scenario 1: CRM Shortlist Knowledge Decay Check (Monday)',
    threadId: 'crm-eval-thread',
    nowOverride: '2026-11-14T10:00:00Z',
    seedThread: {
      threadId: 'crm-eval-thread',
      turns: [
        {
          role: 'user',
          content: 'We need to shortlist 5 CRM tools for our 20-person sales team.',
          createdAt: '2026-11-09T09:30:00Z', // Monday
        },
        {
          role: 'assistant',
          content: `Here are 5 shortlisted CRM tools for a 20-person sales team:
1. HubSpot Sales Hub - $20/seat/mo Starter plan
2. Pipedrive - $14/user/mo Essential plan
3. Zoho CRM - $14/user/mo Standard plan
4. Close - $49/user/mo Startup plan
5. Freshsales - $15/user/mo Growth plan`,
          createdAt: '2026-11-09T09:31:00Z',
        },
      ],
    },
    query: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    expectedInOutput: ['HubSpot', 'Pipedrive', 'Zoho', 'Close', 'Freshsales'],
  },
  {
    name: 'Scenario 2: Postgres Hosting Change Check (Last Tuesday)',
    threadId: 'postgres-eval-thread',
    nowOverride: '2026-11-14T10:00:00Z',
    seedThread: {
      threadId: 'postgres-eval-thread',
      turns: [
        {
          role: 'user',
          content: 'What are the top managed Postgres hosting providers and their pricing?',
          createdAt: '2026-11-03T14:00:00Z', // Tuesday Nov 3
        },
        {
          role: 'assistant',
          content: `Here are the top Postgres hosting providers:
1. Supabase: Pro tier starts at $25/month with 8GB storage and automatic backups.
2. Neon: Serverless Postgres with autoscaling compute and a free tier with 0.5 GB storage.`,
          createdAt: '2026-11-03T14:01:00Z',
        },
      ],
    },
    query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    expectedInOutput: ['Supabase', 'Neon', '$25'],
  },
  {
    name: 'Scenario 3: Missing Memory Honesty (Zero Hallucination)',
    threadId: 'empty-eval-thread',
    nowOverride: '2026-11-14T10:00:00Z',
    query: 'On Monday we shortlisted 5 email marketing tools. Has any of them changed pricing?',
    expectedInOutput: ['record', 'remind'],
    forbiddenInOutput: ['Mailchimp', 'Sendgrid', 'ConvertKit'],
  },
];

async function runEvaluations() {
  console.log('=====================================================');
  console.log('   MINIMI TEMPORAL CHAT AGENT — EVALUATION HARNESS   ');
  console.log('=====================================================\n');

  await db.init();

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`[Test ${i + 1}/${TEST_CASES.length}] ${tc.name}`);

    // Seed history if present
    if (tc.seedThread) {
      db.createThread(tc.seedThread.threadId, tc.name);
      for (const turn of tc.seedThread.turns) {
        db.saveTurn({
          id: `seed-${Date.now()}-${Math.random()}`,
          thread_id: tc.seedThread.threadId,
          role: turn.role,
          content: turn.content,
          created_at: turn.createdAt,
        });
      }
    }

    try {
      const startTime = Date.now();
      const res = await agent.run(tc.query, tc.threadId, { nowOverride: tc.nowOverride });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      let testPassed = true;
      const issues: string[] = [];

      for (const expected of tc.expectedInOutput) {
        if (!res.text.toLowerCase().includes(expected.toLowerCase())) {
          testPassed = false;
          issues.push(`Missing expected keyword: "${expected}"`);
        }
      }

      if (tc.forbiddenInOutput) {
        for (const forbidden of tc.forbiddenInOutput) {
          if (res.text.toLowerCase().includes(forbidden.toLowerCase())) {
            testPassed = false;
            issues.push(`Found forbidden hallucinated keyword: "${forbidden}"`);
          }
        }
      }

      if (testPassed) {
        console.log(`  ✓ PASSED in ${elapsed}s`);
        passed++;
      } else {
        console.log(`  ✗ FAILED in ${elapsed}s:`);
        issues.forEach((iss) => console.log(`     - ${iss}`));
        console.log(`  Snippet of actual output:\n  ${res.text.slice(0, 300)}...\n`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ ERROR: ${err.message}`);
      failed++;
    }
    console.log('-----------------------------------------------------');
  }

  console.log(`\nEval Summary: ${passed} Passed, ${failed} Failed`);

  // Cleanup test db
  db.reset();

  if (failed > 0) {
    process.exit(1);
  }
}

runEvaluations().catch((err) => {
  console.error('Fatal eval runner error:', err);
  process.exit(1);
});
