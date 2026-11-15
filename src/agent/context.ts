import * as chrono from 'chrono-node';
import type { DatabaseClient, Turn } from '../db/client.js';

export interface ResolvedContext {
  nowIso: string;
  nowFormatted: string;
  timezone: string;
  intent: 'TEMPORAL_DIFF' | 'FRESH_SEARCH' | 'CHIT_CHAT';
  preamble?: string;
  matchedTurns: Turn[];
  referenceDateIso?: string;
  recentTurns: Turn[];
}

export function resolveContext(
  userMessage: string,
  threadId: string,
  db: DatabaseClient,
  options: { nowOverride?: string; timezone?: string } = {}
): ResolvedContext {
  const now = options.nowOverride ? new Date(options.nowOverride) : new Date();
  const timezone = options.timezone || 'Asia/Kolkata';
  const nowIso = now.toISOString();
  const nowFormatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  // Pull recent thread history (active buffer)
  const recentTurns = db.getThreadTurns(threadId, 6);

  // Parse temporal cues
  const parsedDates = chrono.parse(userMessage, now, { forwardDate: false });
  let referenceDateIso: string | undefined;
  let matchedTurns: Turn[] = [];

  // Check temporal diff keywords
  const isDiffQuery =
    /changed|change|still correct|still true|since|updates|updated|shipped|pricing/i.test(
      userMessage
    );

  if (parsedDates.length > 0) {
    let targetDate = parsedDates[0].start.date();
    // In conversational context ("we shortlisted", "I asked you"), future dates are inverted to the past occurrence
    if (targetDate > now) {
      targetDate = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    referenceDateIso = targetDate.toISOString();

    // Create a search window around target date (start of day to end of day)
    const startWindow = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const endWindow = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Extract clean topic tokens (excluding common conversational and temporal filler)
    const stopWords = /\b(on|last|what|did|i|ask|asked|you|your|has|any|of|them|changed|pricing|since|then|today|still|correct|answer|we|discussed|about|was|my|question|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|tools|tool|team|shortlist|shortlisted|recommend|recommendation|options|best|top|five|for|our|a|the|in|is|it)\b/gi;
    const cleanTokens = userMessage
      .replace(stopWords, '')
      .split(/\s+/)
      .map((t) => t.trim().replace(/[^a-zA-Z0-9]/g, ''))
      .filter((t) => t.length > 2);

    // If explicit topic keywords exist, enforce topic match on that date window
    if (cleanTokens.length > 0) {
      matchedTurns = db.findTurnsInWindow(startWindow, endWindow, cleanTokens);

      // Handle "Last <Weekday>" ambiguity (e.g. "Last Tuesday" referring to prior week's Tuesday 7 days earlier)
      if (matchedTurns.length === 0) {
        const priorWeekStart = new Date(targetDate.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
        const priorWeekEnd = new Date(targetDate.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
        const priorTurns = db.findTurnsInWindow(priorWeekStart, priorWeekEnd, cleanTokens);
        if (priorTurns.length > 0) {
          matchedTurns = priorTurns;
          referenceDateIso = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      }
    } else {
      // Pure date recall without topic keywords (e.g. "What did I ask you on 3 November?")
      matchedTurns = db.findTurnsInWindow(startWindow, endWindow);
    }
  } else if (isDiffQuery) {
    // No explicit date, but asks about diff (e.g. "Has pricing changed since our last chat?")
    const cleanTokens = userMessage
      .replace(/has|any|of|them|changed|pricing|since|our|last|chat|discussion/gi, '')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2);

    matchedTurns = db.findTurnsInWindow('1970-01-01', nowIso, cleanTokens.length > 0 ? cleanTokens : undefined);
  }

  // Determine intent & instant preamble
  let intent: ResolvedContext['intent'] = 'CHIT_CHAT';
  let preamble: string | undefined;

  if (isDiffQuery && matchedTurns.length > 0) {
    intent = 'TEMPORAL_DIFF';
    const firstMatch = matchedTurns[0];
    const matchDate = new Date(firstMatch.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    preamble = `Found your prior conversation from ${matchDate}. Verifying current real-world updates...`;
  } else if (/search|who|what|when|where|which|compare|price|pricing|latest|news|weather/i.test(userMessage)) {
    intent = 'FRESH_SEARCH';
    preamble = 'Searching the web for current information...';
  }

  return {
    nowIso,
    nowFormatted,
    timezone,
    intent,
    preamble,
    matchedTurns,
    referenceDateIso,
    recentTurns,
  };
}
