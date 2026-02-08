import initSqlJs, { Database } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

// Use /tmp on Vercel (serverless), local data dir otherwise
const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? '/tmp' : join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'agent.db');

export async function getDb(): Promise<Database> {
  if (db) return db;

  let wasmBinary: Buffer | undefined;

  // Try to load WASM from node_modules (works locally and on Vercel)
  try {
    const wasmPath = join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    wasmBinary = readFileSync(wasmPath);
  } catch {
    // Fallback to public directory or CDN
    console.log('WASM not found in node_modules, trying without explicit path');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SQL = await initSqlJs(wasmBinary ? { wasmBinary } as any : undefined);

  // Ensure data directory exists (on Vercel, /tmp exists but may need subdirs)
  if (!existsSync(DATA_DIR)) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.log('Could not create data dir, using in-memory database:', err);
    }
  }

  // Load existing database or create new one
  if (existsSync(DB_PATH)) {
    try {
      const buffer = readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } catch {
      db = new SQL.Database();
      initializeSchema(db);
    }
  } else {
    db = new SQL.Database();
    initializeSchema(db);
  }

  return db;
}

function initializeSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      role TEXT,
      content TEXT,
      tool_calls TEXT,
      tool_results TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      key TEXT,
      value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      filename TEXT,
      mimetype TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  saveDb(database);
}

export function saveDb(database?: Database) {
  const dbToSave = database || db;
  if (dbToSave) {
    const data = dbToSave.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  }
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: string;
  tool_results?: string;
  created_at: string;
}

export interface Memory {
  id: string;
  conversation_id: string;
  key: string;
  value: string;
  created_at: string;
}

export interface FileRecord {
  id: string;
  conversation_id: string;
  filename: string;
  mimetype: string;
  content: string;
  created_at: string;
}
