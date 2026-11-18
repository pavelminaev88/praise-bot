// Short-term memory for private chats, stored in Workers KV.
// One record per chat, keyed by a hash of the chat ID. The record is encrypted (AES-GCM) and
// Cloudflare deletes it automatically MEMORY_TTL_HOURS after its OLDEST message was written,
// so no message outlives the TTL. /forget deletes it immediately.

import { chatKey, memoryRecordName, open, seal } from "./crypto";

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
  /** Dedicated secret for memory (MEMORY_KEY). When set, records are named and encrypted with it, not the bot token. */
  memoryKey?: string;
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

  /** Secret used to encrypt records: MEMORY_KEY if set, else the bot token (older setups). */
  private get secret() {
    return this.cfg.memoryKey || this.cfg.botToken;
  }

  private async key(chatId: number) {
    return this.cfg.memoryKey ? `m2:${await memoryRecordName(this.cfg.memoryKey, chatId)}` : this.legacyKey(chatId);
  }

  /** Record name used before MEMORY_KEY existed (derived from the bot token). */
  private legacyKey(chatId: number) {
    return chatKey(this.cfg.botToken, chatId).then((k) => `mem:${k}`);
  }

  private async read(name: string, secret: string): Promise<{ turns: Turn[]; exp?: number } | null> {
    const { value, metadata } = await this.kv.getWithMetadata<Stored, Meta>(name, "json");
    if (!value) return null;
    if (value.sealed) return { turns: await open<Turn[]>(secret, value.sealed).catch(() => []), exp: metadata?.exp };
    return { turns: value.turns ?? [], exp: metadata?.exp }; // plain record from an older version
  }

  async load(chatId: number): Promise<{ turns: Turn[]; expiresAt?: number }> {
    if (!this.enabled) return { turns: [] };
    let rec = await this.read(await this.key(chatId), this.secret);
    // After MEMORY_KEY is added, pick up the record written under the old scheme (it is moved on the next append).
    if (!rec && this.cfg.memoryKey) rec = await this.read(await this.legacyKey(chatId), this.cfg.botToken);
    return { turns: this.fresh(rec?.turns ?? []), expiresAt: rec?.exp };
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
    const sealed = await seal(this.secret, turns);
    await this.kv.put(await this.key(chatId), JSON.stringify({ sealed } satisfies Stored), {
      expiration: Math.ceil(expMs / 1000),
      metadata: { exp: expMs } satisfies Meta,
    });
    if (this.cfg.memoryKey) await this.kv.delete(await this.legacyKey(chatId)).catch(() => {});
  }

  async forget(chatId: number): Promise<void> {
    await this.kv.delete(await this.key(chatId));
    if (this.cfg.memoryKey) await this.kv.delete(await this.legacyKey(chatId));
  }
}

/** Keeps the last `max` turns and makes sure history starts with a user turn. */
export function trimTurns(turns: Turn[], max: number): Turn[] {
  if (max <= 0) return [];
  let out = turns.slice(-max);
  while (out.length && out[0].r !== "u") out = out.slice(1);
  return out;
}
