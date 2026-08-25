/**
 * Durable state for the Windows self-hosted runtime.
 *
 * The public preview can run in a Worker-like environment where Node's local
 * filesystem is intentionally unavailable. In that environment this module
 * uses memory only. The 4070 deployment runs under Node and automatically
 * uses a private SQLite file instead.
 *
 * No secret is stored here: administrator tokens and device private keys stay
 * outside the application database. Device public keys, hashed pairing codes
 * and audit data are safe to persist as application state.
 */

const STATE_TABLE = 'murmur_state';
const DEFAULT_STATE_PATH = 'data/murmur.sqlite';

type SqliteDatabase = InstanceType<(typeof import('node:sqlite'))['DatabaseSync']>;

type StateBackend = {
  kind: 'memory' | 'sqlite';
  read(key: string): unknown | undefined;
  write(key: string, value: unknown): void;
};

type RuntimeGlobal = typeof globalThis & { __murmurMemoryStateV1?: Map<string, unknown> };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function memoryBackend(): StateBackend {
  const runtime = globalThis as RuntimeGlobal;
  runtime.__murmurMemoryStateV1 ??= new Map<string, unknown>();
  const state = runtime.__murmurMemoryStateV1;
  return {
    kind: 'memory',
    read: (key) => state.get(key),
    write: (key, value) => state.set(key, clone(value)),
  };
}

async function importNodeModule<T>(specifier: string): Promise<T> {
  // Keep the Worker build free of Node-only modules. This branch only runs in
  // the self-hosted Node runtime, where Node resolves the built-in modules.
  return import(/* @vite-ignore */ specifier) as Promise<T>;
}

async function sqliteBackend(): Promise<StateBackend | null> {
  const runningInNode = typeof process !== 'undefined'
    && process.release?.name === 'node'
    && Boolean(process.versions?.node);
  if (!runningInNode) return null;

  try {
    const [{ DatabaseSync }, fs, path] = await Promise.all([
      importNodeModule<typeof import('node:sqlite')>('node:sqlite'),
      importNodeModule<typeof import('node:fs')>('node:fs'),
      importNodeModule<typeof import('node:path')>('node:path'),
    ]);
    const configuredPath = process.env.MURMUR_STATE_PATH?.trim();
    const databasePath = configuredPath || path.resolve(process.cwd(), DEFAULT_STATE_PATH);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    const database: SqliteDatabase = new DatabaseSync(databasePath, { timeout: 5_000 });
    database.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
      state_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT`);
    database.exec('PRAGMA journal_mode = WAL');
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA optimize');

    return {
      kind: 'sqlite',
      read: (key) => {
        // Keep the database itself strongly referenced by these closures. Node
        // may finalize prepared statements whose only remaining reference is a
        // native handle, so statements are intentionally short-lived here.
        const row = database.prepare(`SELECT value_json FROM ${STATE_TABLE} WHERE state_key = ?`)
          .get(key) as { value_json?: unknown } | undefined;
        if (!row) return undefined;
        if (typeof row.value_json !== 'string') throw new Error('Murmur 持久化状态格式无效');
        try {
          return JSON.parse(row.value_json);
        } catch {
          // Refuse to overwrite an unreadable state file. Re-pairing every
          // device after silent data loss would be a security regression.
          throw new Error('Murmur 持久化状态无法读取；请先从备份恢复');
        }
      },
      write: (key, value) => {
        database.prepare(`
          INSERT INTO ${STATE_TABLE} (state_key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(state_key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `).run(key, JSON.stringify(value), new Date().toISOString());
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('持久化状态')) throw error;
    // A self-hosted Node service must never silently fall back to volatile
    // memory because its durable database could not be opened.
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error(`无法初始化 Murmur SQLite 状态库：${detail}`);
  }
}

const backend = (await sqliteBackend()) ?? memoryBackend();

export function loadState<T>(key: string, fallback: () => T): T {
  const stored = backend.read(key);
  return stored === undefined ? fallback() : clone(stored as T);
}

export function saveState<T>(key: string, value: T) {
  backend.write(key, clone(value));
}

export function persistenceKind() {
  return backend.kind;
}
