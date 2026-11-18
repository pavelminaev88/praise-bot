// Short-term memory for private chats, stored in Workers KV.
// One record per chat, keyed by a hash of the chat ID. The record is encrypted (AES-GCM) and
// Cloudflare deletes it automatically MEMORY_TTL_HOURS after its OLDEST message was written,
// so no message outlives the TTL. /forget deletes it immediately.

import { chatKey, open, seal } from "./crypto";

export type Mode = "START" | "PRAISE" | "CLOSING" | "SAFETY";

export interface Turn {
  /** u = user, a = assistant */
  r: "u" | "a";
  t: string;
  m?: Mode;
  /** When the message was written, ms since epoch. Older than MEMORY_TTL_HOURS → forgotten. */
  ts?: number;
}

/** What is written to KV: only ciphertext. Records from older versions held `turns` in plain JSON. */
interface Stored {
  sealed?: string;
  turns?: Turn[];
}

interface Meta {
  /** Expiry time, ms since epoch. */
  exp: number;
}

export interface MemoryConfig {
  botToken: string;
  maxTurns: number;
  ttlHours: number;
}

export class Memory {
  constructor(
    private kv: KVNamespace,
    private cfg: MemoryConfig,
  ) {}

  get enabled() {
    return this.cfg.maxTurns > 0;
  }

  private key(chatId: number) {
    return chatKey(this.cfg.botToken, chatId).then((k) => `mem:${k}`);
  }

  async load(chatId: number): Promise<{ turns: Turn[]; expiresAt?: number }> {
    if (!this.enabled) return { turns: [] };
    const { value, metadata } = await this.kv.getWithMetadata<Stored, Meta>(await this.key(chatId), "json");
    let turns: Turn[] = [];
    if (value?.sealed) {
      turns = await open<Turn[]>(this.cfg.botToken, value.sealed).catch(() => []);
    } else if (value?.turns) {
      turns = value.turns; // legacy plain record, rewritten encrypted on the next append
    }
    return { turns: this.fresh(turns), expiresAt: metadata?.exp };
  }

  /** Each message is forgotten MEMORY_TTL_HOURS after it was written. */
  private fresh(turns: Turn[]): Turn[] {
    const cutoff = Date.now() - this.cfg.ttlHours * 3600_000;
    return trimTurns(turns.filter((t) => (t.ts ?? Date.now()) > cutoff), this.cfg.maxTurns);
  }

  async append(chatId: number, previous: Turn[], added: Turn[]): Promise<void> {
    if (!this.enabled) return;
    const now = Date.now();
    const turns = this.fresh([...previous, ...added.map((t) => ({ ...t, ts: t.ts ?? now }))]);
    if (!turns.length) return void (await this.forget(chatId));
    const ttlMs = this.cfg.ttlHours * 3600_000;
    const oldest = Math.min(...turns.map((t) => t.ts ?? now));
    // KV needs an expiration at least 60 s in the future.
    const expMs = Math.max(oldest + ttlMs, now + 61_000);
    const sealed = await seal(this.cfg.botToken, turns);
    await this.kv.put(await this.key(chatId), JSON.stringify({ sealed } satisfies Stored), {
      expiration: Math.ceil(expMs / 1000),
      metadata: { exp: expMs } satisfies Meta,
    });
  }

  async forget(chatId: number): Promise<void> {
    await this.kv.delete(await this.key(chatId));
  }
}

/** Keeps the last `max` turns and makes sure history starts with a user turn. */
export function trimTurns(turns: Turn[], max: number): Turn[] {
  if (max <= 0) return [];
  let out = turns.slice(-max);
  while (out.length && out[0].r !== "u") out = out.slice(1);
  return out;
}
