// Anonymous trace of the last group updates the bot received, for answering "why is the bot silent in my group?".
// Stored in KV for 7 days: time, kind of message and what the bot decided. No text, no chat or user IDs.

import type { Action } from "./routing";
import type { BotInfo, TgMessage } from "./telegram";

const KEY = "diag:groups";
const KEEP = 10;

export interface GroupTrace {
  ts: number;
  /** What made the message look addressed to a bot. */
  via: string;
  outcome: string;
}

/** Describes why a group message might concern the bot, or undefined when it clearly does not. */
export function addressedVia(m: TgMessage, bot: BotInfo): string | undefined {
  const text = m.text ?? m.caption ?? "";
  const entities = m.entities ?? m.caption_entities ?? [];
  const parts: string[] = [];
  const mentions = entities.filter((e) => e.type === "mention");
  if (mentions.length) {
    const own = mentions.some((e) => text.slice(e.offset, e.offset + e.length).toLowerCase() === `@${bot.username.toLowerCase()}`);
    parts.push(own ? "упоминание бота" : "упоминание другого аккаунта");
  }
  if (entities.some((e) => e.type === "text_mention")) parts.push("упоминание по имени");
  if (entities.some((e) => e.type === "bot_command")) parts.push("команда");
  if (m.reply_to_message?.from?.id === bot.id) parts.push("ответ боту");
  return parts.length ? parts.join(" + ") : undefined;
}

const OUTCOMES: Record<Action["kind"], string> = {
  ignore: "пропущено",
  reply: "отвечаю",
  command: "команда выполнена",
  rate: "оценка",
  tooLong: "слишком длинное голосовое",
};

export async function traceGroup(kv: KVNamespace, m: TgMessage, bot: BotInfo, outcome: Action["kind"] | "error"): Promise<void> {
  const via = addressedVia(m, bot);
  // Ordinary group chatter is not recorded at all.
  if (!via && outcome === "ignore") return;
  const list = (await kv.get<GroupTrace[]>(KEY, "json")) ?? [];
  list.push({ ts: Date.now(), via: via ?? "без обращения", outcome: outcome === "error" ? "ошибка" : OUTCOMES[outcome] });
  await kv.put(KEY, JSON.stringify(list.slice(-KEEP)), { expirationTtl: 7 * 86400 });
}

export async function recentGroupTraces(kv: KVNamespace): Promise<GroupTrace[]> {
  return (await kv.get<GroupTrace[]>(KEY, "json")) ?? [];
}
