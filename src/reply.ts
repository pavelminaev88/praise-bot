// The main job: turn a message into a praise reply.
// Runs inside a Cloudflare Workflow step, so long voice messages are not limited by request time.

import { askClaude, buildUserContent } from "./llm";
import { Memory, type Turn } from "./memory";
import { Metrics } from "./metrics";
import { ratingCallbackData, type ReplyJob } from "./routing";
import { Telegram, type InlineKeyboard } from "./telegram";
import { pickLang, T } from "./texts";
import { transcribe } from "./transcribe";
import { settings, type Env } from "./env";
import { randomId } from "./crypto";

/** Thrown for problems a retry will not fix. The message is safe to show the user. */
export class UserFacingError extends Error {}

const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

function keyboard(eventId: string): InlineKeyboard {
  return [
    [
      { text: "🔥", callback_data: ratingCallbackData("g", eventId) },
      { text: "😐", callback_data: ratingCallbackData("n", eventId) },
      { text: "👎", callback_data: ratingCallbackData("b", eventId) },
    ],
  ];
}

/** Keeps "typing…" visible while we wait for slow APIs. */
function keepTyping(tg: Telegram, chatId: number): () => void {
  let stopped = false;
  let count = 0;
  const tick = () => {
    if (stopped || count++ >= 20) return; // Workers Free allows 50 outgoing requests per run
    tg.sendTyping(chatId).catch(() => {});
    setTimeout(tick, 4500);
  };
  tick();
  return () => {
    stopped = true;
  };
}

export async function handleReply(env: Env, job: ReplyJob): Promise<void> {
  const s = settings(env);
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, s.telegramApi);
  const lang = pickLang(job.userLang);
  const started = Date.now();
  const stopTyping = keepTyping(tg, job.chatId);

  try {
    // 1. Get the text: either the message itself or a transcript of the voice message.
    let text: string;
    if (job.input.type === "voice") {
      if (!env.OPENAI_API_KEY) throw new UserFacingError(T.voiceOff[lang]);
      if ((job.input.fileSize ?? 0) > TELEGRAM_DOWNLOAD_LIMIT) throw new UserFacingError(T.tooLong(s.maxVoiceSeconds)[lang]);
      const { bytes } = await tg.downloadFile(job.input.fileId);
      text = await transcribe({
        apiKey: env.OPENAI_API_KEY,
        apiBase: s.openaiApi,
        model: s.transcribeModel,
        audio: bytes,
        filename: job.input.filename,
      });
      if (!text) throw new UserFacingError(T.emptyVoice[lang]);
    } else {
      text = job.input.text;
    }

    // 2. Memory (private chats only).
    const memory = new Memory(env.KV, { botToken: env.TELEGRAM_BOT_TOKEN, maxTurns: s.memoryMessages, ttlHours: s.memoryTtlHours });
    const useMemory = job.chatKind === "private" && memory.enabled;
    const history: Turn[] = useMemory ? (await memory.load(job.chatId)).turns : [];
    const previousMode = [...history].reverse().find((t) => t.r === "a")?.m;

    // 3. Ask Claude.
    const answer = await askClaude({
      apiKey: env.ANTHROPIC_API_KEY,
      apiBase: s.anthropicApi,
      model: s.model,
      history,
      userContent: buildUserContent(job, text, previousMode),
    });

    // 4. Send. Everything after this point must not throw, or a retry would send the reply twice.
    const eventId = randomId();
    const withButtons = job.chatKind === "private" && answer.mode === "PRAISE";
    stopTyping();
    await tg.sendMessage(job.chatId, answer.answer, {
      replyTo: job.chatKind === "group" ? job.replyTo : undefined,
      keyboard: withButtons ? keyboard(eventId) : undefined,
    });

    // 5. Remember and count (best effort).
    if (useMemory) {
      await memory
        .append(job.chatId, history, [
          { r: "u", t: text },
          { r: "a", t: answer.answer, m: answer.mode },
        ])
        .catch((e) => console.error("memory write failed:", errorName(e)));
    }
    await new Metrics(env.DB, env.KV)
      .record(
        {
          chat: job.chatKind,
          input: job.input.type,
          mode: answer.mode,
          lang: answer.language,
          latencyMs: Date.now() - started,
          userId: job.userId,
        },
        eventId,
      )
      .catch((e) => console.error("metrics write failed:", errorName(e)));
  } catch (e) {
    // Problems a retry cannot fix (too long, no words, voice off): tell the user and finish.
    if (!(e instanceof UserFacingError)) throw e;
    stopTyping();
    await tg.sendMessage(job.chatId, e.message, { replyTo: job.chatKind === "group" ? job.replyTo : undefined });
    await new Metrics(env.DB, env.KV)
      .record({ chat: job.chatKind, input: job.input.type, error: "user_facing", userId: job.userId })
      .catch(() => {});
  } finally {
    stopTyping();
  }
}

/** Called when all retries failed. Tells the user and records an anonymous error event. */
export async function handleFailure(env: Env, job: ReplyJob, error: unknown): Promise<void> {
  const s = settings(env);
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, s.telegramApi);
  const lang = pickLang(job.userLang);
  await tg.sendMessage(job.chatId, T.failed[lang], { replyTo: job.chatKind === "group" ? job.replyTo : undefined }).catch(() => {});
  await new Metrics(env.DB, env.KV)
    .record({ chat: job.chatKind, input: job.input.type, error: errorName(error), userId: job.userId })
    .catch(() => {});
}

/** Error description without any user content: only the kind of failure. */
export function errorName(e: unknown): string {
  if (e instanceof UserFacingError) return "user_facing";
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/^(Telegram \w+|Anthropic API \d+|OpenAI transcription \d+|Claude returned no answer)/);
  if (m) return m[1];
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
  return e instanceof Error ? e.name : "unknown";
}
