export interface Env {
  // Secrets (Settings → Variables and Secrets → type "Secret")
  TELEGRAM_BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  /** Optional. Without it the bot answers text only. */
  OPENAI_API_KEY?: string;

  // Settings (plain variables)
  MODEL?: string;
  TRANSCRIBE_MODEL?: string;
  MAX_VOICE_SECONDS?: string;
  MEMORY_MESSAGES?: string;
  MEMORY_TTL_HOURS?: string;
  /** Your Telegram user ID. Enables /stats for you only. */
  ADMIN_TELEGRAM_ID?: string;

  // Only for local testing: point API calls to a mock server.
  TELEGRAM_API_BASE?: string;
  ANTHROPIC_API_BASE?: string;
  OPENAI_API_BASE?: string;

  // Bindings
  KV: KVNamespace;
  DB: D1Database;
  REPLY_WORKFLOW: Workflow;
  /** Static files from ./public (the avatar). */
  ASSETS: Fetcher;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function settings(env: Env) {
  return {
    model: env.MODEL || "claude-sonnet-5",
    transcribeModel: env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    maxVoiceSeconds: int(env.MAX_VOICE_SECONDS, 600),
    memoryMessages: int(env.MEMORY_MESSAGES, 20),
    memoryTtlHours: Math.max(1, int(env.MEMORY_TTL_HOURS, 24)),
    adminId: env.ADMIN_TELEGRAM_ID ? Number(env.ADMIN_TELEGRAM_ID) : undefined,
    telegramApi: env.TELEGRAM_API_BASE || "https://api.telegram.org",
    anthropicApi: env.ANTHROPIC_API_BASE || "https://api.anthropic.com",
    openaiApi: env.OPENAI_API_BASE || "https://api.openai.com",
  };
}

export type Settings = ReturnType<typeof settings>;
