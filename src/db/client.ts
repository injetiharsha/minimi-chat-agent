import initSqlJs, { Database } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';

export interface Turn {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string; // JSON string
  created_at: string; // ISO string
}

export interface Observation {
  id: string;
  turn_id: string;
  entity: string;
  attribute: string;
  value: string;
  currency?: string;
  period?: string;
  unit?: string;
  plan?: string;
  as_of: string;
  source_url?: string;
  supersedes_id?: string;
  volatility_tag?: 'volatile' | 'stable';
}

export class DatabaseClient {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = path.join(process.cwd(), 'data', 'minimi.db')) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const SQL = await initSqlJs();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.run(schema);
      this.save();
    }
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  createThread(id: string, title: string, createdAt: string = new Date().toISOString()): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      'INSERT OR IGNORE INTO threads (id, title, created_at) VALUES (?, ?, ?);',
      [id, title, createdAt]
    );
    this.save();
  }

  saveTurn(turn: Turn): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT OR REPLACE INTO turns (id, thread_id, role, content, sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [turn.id, turn.thread_id, turn.role, turn.content, turn.sources || '[]', turn.created_at]
    );
    this.save();
  }

  getThreadTurns(threadId: string, limit: number = 20): Turn[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(
      `SELECT id, thread_id, role, content, sources, created_at
       FROM turns
       WHERE thread_id = :threadId
       ORDER BY created_at ASC
       LIMIT :limit;`
    );
    stmt.bind({ ':threadId': threadId, ':limit': limit });
    const turns: Turn[] = [];
    while (stmt.step()) {
      turns.push(stmt.getAsObject() as unknown as Turn);
    }
    stmt.free();
    return turns;
  }

  findTurnsInWindow(startIso: string, endIso: string, keywords?: string[]): Turn[] {
    if (!this.db) throw new Error('Database not initialized');
    let query = `
      SELECT id, thread_id, role, content, sources, created_at
      FROM turns
      WHERE created_at >= :startIso AND created_at <= :endIso
    `;

    if (keywords && keywords.length > 0) {
      const keywordFilters = keywords
        .map((_, i) => `content LIKE :kwd${i}`)
        .join(' OR ');
      query += ` AND (${keywordFilters})`;
    }

    query += ' ORDER BY created_at ASC;';

    const stmt = this.db.prepare(query);
    const params: Record<string, string> = {
      ':startIso': startIso,
      ':endIso': endIso,
    };
    if (keywords) {
      keywords.forEach((kwd, i) => {
        params[`:kwd${i}`] = `%${kwd}%`;
      });
    }

    stmt.bind(params);
    const turns: Turn[] = [];
    while (stmt.step()) {
      turns.push(stmt.getAsObject() as unknown as Turn);
    }
    stmt.free();
    return turns;
  }

  saveObservation(obs: Observation): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT INTO observations (
        id, turn_id, entity, attribute, value, currency, period, unit, plan, as_of, source_url, supersedes_id, volatility_tag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        obs.id,
        obs.turn_id,
        obs.entity,
        obs.attribute,
        obs.value,
        obs.currency || null,
        obs.period || null,
        obs.unit || null,
        obs.plan || null,
        obs.as_of,
        obs.source_url || null,
        obs.supersedes_id || null,
        obs.volatility_tag || 'volatile',
      ]
    );
    this.save();
  }

  getObservationsForEntity(entity: string): Observation[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(
      `SELECT * FROM observations WHERE entity LIKE :entity ORDER BY as_of DESC;`
    );
    stmt.bind({ ':entity': `%${entity}%` });
    const rows: Observation[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as Observation);
    }
    stmt.free();
    return rows;
  }

  getCachedSearch(queryHash: string): string | null {
    if (!this.db) return null;
    const stmt = this.db.prepare('SELECT results_json FROM search_cache WHERE query_hash = :hash;');
    stmt.bind({ ':hash': queryHash });
    let result: string | null = null;
    if (stmt.step()) {
      result = (stmt.getAsObject() as { results_json: string }).results_json;
    }
    stmt.free();
    return result;
  }

  setCachedSearch(queryHash: string, resultsJson: string, cachedAt: string = new Date().toISOString()): void {
    if (!this.db) return;
    this.db.run(
      'INSERT OR REPLACE INTO search_cache (query_hash, results_json, cached_at) VALUES (?, ?, ?);',
      [queryHash, resultsJson, cachedAt]
    );
    this.save();
  }

  exportRows(sql: string, params: Record<string, any> = {}): any[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  reset(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }
  }
}
