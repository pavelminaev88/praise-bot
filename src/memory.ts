// Short-term memory for private chats, stored in Workers KV.
// One record per chat, keyed by a hash of the chat ID. Cloudflare deletes it automatically
// MEMORY_TTL_HOURS after the last message. /forget deletes it immediately.

import { chatKey } from "./crypto";

export type Mode = "START" | "PRAISE" | "CLOSING" | "SAFETY";

export interface Turn {
  /** u = user, a = assistant */
  r: "u" | "a";
  t: string;
  m?: Mode;
}

interface Stored {
  turns: Turn[];
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
    return { turns: value?.turns ?? [], expiresAt: metadata?.exp };
  }

  async append(chatId: number, previous: Turn[], added: Turn[]): Promise<void> {
    if (!this.enabled) return;
    const turns = trimTurns([...previous, ...added], this.cfg.maxTurns);
    const ttl = this.cfg.ttlHours * 3600;
    await this.kv.put(await this.key(chatId), JSON.stringify({ turns } satisfies Stored), {
      expirationTtl: ttl,
      metadata: { exp: Date.now() + ttl * 1000 } satisfies Meta,
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
