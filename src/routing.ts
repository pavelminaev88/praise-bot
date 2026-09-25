// Decides what to do with an incoming Telegram update. Pure functions, no I/O.

import type { BotInfo, TgEntity, TgMessage, TgUpdate } from "./telegram";

export type ChatKind = "private" | "group";

export type Input =
  | { type: "text"; text: string }
  | { type: "voice"; fileId: string; duration: number; fileSize?: number; filename: string };

/** Everything the reply job needs. Contains message text, so it is encrypted before it is queued. */
export interface ReplyJob {
  chatId: number;
  chatKind: ChatKind;
  /** Message to reply to (groups only). */
  replyTo?: number;
  userId: number;
  userLang?: string;
  /** Name of the person being praised. */
  name: string;
  /** Group: who asked for the praise, if it is someone else. */
  askedBy?: string;
  /** Group: text written by the person who tagged the bot, when praising someone else's message. */
  note?: string;
  /** Text of the bot's own message the user replied to. */
  replyContext?: string;
  input: Input;
}

export type Command = "start" | "privacy" | "forget" | "mydata" | "stats" | "selftest";

export type Action =
  | { kind: "ignore" }
  | { kind: "reply"; job: ReplyJob }
  | { kind: "command"; command: Command; chatId: number; chatKind: ChatKind; userId: number; userLang?: string; replyTo?: number }
  | { kind: "tooLong"; chatId: number; replyTo?: number; userLang?: string; maxSeconds: number }
  | { kind: "rate"; callbackId: string; rating: Rating; eventId: string; chatId?: number; messageId?: number };

export type Rating = "good" | "neutral" | "bad";
const RATING_CODES: Record<string, Rating> = { g: "good", n: "neutral", b: "bad" };

export function ratingCallbackData(code: "g" | "n" | "b", eventId: string) {
  return `r:${code}:${eventId}`;
}

const COMMANDS: Record<string, Command | "praise"> = {
  start: "start",
  help: "start",
  praise: "praise",
  privacy: "privacy",
  forget: "forget",
  mydata: "mydata",
  stats: "stats",
  selftest: "selftest",
};

interface ParsedCommand {
  name: string;
  /** true when the command is addressed to another bot (/cmd@other_bot). */
  foreign: boolean;
  /** true when the command names this bot explicitly (/cmd@this_bot). */
  addressed: boolean;
  entity: TgEntity;
}

function textOf(m: TgMessage): string {
  return m.text ?? m.caption ?? "";
}

function entitiesOf(m: TgMessage): TgEntity[] {
  return m.entities ?? m.caption_entities ?? [];
}

/** Telegram offsets are in UTF-16 code units, which matches JS string indexing. */
function slice(text: string, e: TgEntity) {
  return text.slice(e.offset, e.offset + e.length);
}

function parseCommand(m: TgMessage, botUsername?: string): ParsedCommand | undefined {
  const text = textOf(m);
  const e = entitiesOf(m).find((x) => x.type === "bot_command" && x.offset === 0);
  if (!e) return undefined;
  const raw = slice(text, e).slice(1); // drop "/"
  const [name, target] = raw.split("@");
  const foreign = !!target && !!botUsername && target.toLowerCase() !== botUsername.toLowerCase();
  return { name: name.toLowerCase(), foreign, addressed: !!target && !foreign, entity: e };
}

function mentionsBot(m: TgMessage, bot: BotInfo): TgEntity[] {
  const text = textOf(m);
  return entitiesOf(m).filter(
    (e) =>
      (e.type === "mention" && slice(text, e).toLowerCase() === `@${bot.username.toLowerCase()}`) ||
      (e.type === "text_mention" && e.user?.id === bot.id),
  );
}

/** Removes the given entities (mentions / command) from the text. */
function stripEntities(text: string, remove: TgEntity[]): string {
  const sorted = [...remove].sort((a, b) => b.offset - a.offset);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.offset) + out.slice(e.offset + e.length);
  return out.replace(/\s+/g, " ").trim();
}

function mediaOf(m: TgMessage): Input | undefined {
  if (m.voice) return { type: "voice", fileId: m.voice.file_id, duration: m.voice.duration, fileSize: m.voice.file_size, filename: "voice.ogg" };
  if (m.video_note) return { type: "voice", fileId: m.video_note.file_id, duration: m.video_note.duration, fileSize: m.video_note.file_size, filename: "video.mp4" };
  if (m.audio) return { type: "voice", fileId: m.audio.file_id, duration: m.audio.duration, fileSize: m.audio.file_size, filename: "audio.mp3" };
  return undefined;
}

export interface RouteOptions {
  bot: BotInfo;
  maxVoiceSeconds: number;
}

export function route(update: TgUpdate, opts: RouteOptions): Action {
  if (update.callback_query) return routeCallback(update);
  const m = update.message;
  if (!m || !m.from || m.from.is_bot) return { kind: "ignore" };

  if (m.chat.type === "private") return routePrivate(m, opts);
  if (m.chat.type === "group" || m.chat.type === "supergroup") return routeGroup(m, opts);
  return { kind: "ignore" };
}

function routeCallback(update: TgUpdate): Action {
  const q = update.callback_query!;
  const [prefix, code, eventId] = (q.data ?? "").split(":");
  const rating = RATING_CODES[code];
  if (prefix !== "r" || !rating || !eventId) return { kind: "ignore" };
  return {
    kind: "rate",
    callbackId: q.id,
    rating,
    eventId,
    chatId: q.message?.chat.id,
    messageId: q.message?.message_id,
  };
}

function withVoiceLimit(action: Action, m: TgMessage, maxSeconds: number, replyTo?: number): Action {
  if (action.kind === "reply" && action.job.input.type === "voice" && action.job.input.duration > maxSeconds) {
    return { kind: "tooLong", chatId: m.chat.id, replyTo, userLang: m.from?.language_code, maxSeconds };
  }
  return action;
}

function routePrivate(m: TgMessage, opts: RouteOptions): Action {
  const from = m.from!;
  const cmd = parseCommand(m, opts.bot.username);
  if (cmd && !cmd.foreign) {
    const known = COMMANDS[cmd.name];
    if (known && known !== "praise") {
      return { kind: "command", command: known, chatId: m.chat.id, chatKind: "private", userId: from.id, userLang: from.language_code };
    }
  }

  let input: Input | undefined = mediaOf(m);
  if (!input) {
    let text = textOf(m);
    // "/praise something" → "something"; a bare "/praise" is the same as /start.
    if (cmd && COMMANDS[cmd.name] === "praise") {
      text = stripEntities(text, [cmd.entity]);
      if (!text) return { kind: "command", command: "start", chatId: m.chat.id, chatKind: "private", userId: from.id, userLang: from.language_code };
    }
    if (!text.trim()) return { kind: "ignore" };
    input = { type: "text", text };
  }

  const reply = m.reply_to_message;
  const replyContext = reply && reply.from?.id === opts.bot.id ? textOf(reply) || undefined : undefined;

  return withVoiceLimit(
    {
      kind: "reply",
      job: {
        chatId: m.chat.id,
        chatKind: "private",
        userId: from.id,
        userLang: from.language_code,
        name: from.first_name,
        replyContext,
        input,
      },
    },
    m,
    opts.maxVoiceSeconds,
  );
}

function routeGroup(m: TgMessage, opts: RouteOptions): Action {
  const { bot } = opts;
  const from = m.from!;
  const cmd = parseCommand(m, bot.username);
  const mentions = mentionsBot(m, bot);
  const reply = m.reply_to_message;
  const replyToBot = reply?.from?.id === bot.id;

  // In groups, commands must be addressed to this bot explicitly (/cmd@this_bot),
  // or be a bare /praise (other bots rarely use that name).
  const cmdForUs = !!cmd && !cmd.foreign && COMMANDS[cmd.name] !== undefined && (cmd.name === "praise" || cmd.addressed);
  const triggered = mentions.length > 0 || replyToBot || cmdForUs;
  if (!triggered) return { kind: "ignore" };

  if (cmdForUs) {
    const known = COMMANDS[cmd!.name];
    if (known && known !== "praise") {
      return { kind: "command", command: known, chatId: m.chat.id, chatKind: "group", userId: from.id, userLang: from.language_code, replyTo: m.message_id };
    }
  }

  const strip = [...mentions, ...(cmdForUs ? [cmd!.entity] : [])];
  const ownText = stripEntities(textOf(m), strip);
  const ownMedia = mediaOf(m);

  const base = {
    chatId: m.chat.id,
    chatKind: "group" as const,
    replyTo: m.message_id,
    userId: from.id,
    userLang: from.language_code,
  };

  // Tagged the bot in a reply to someone else's message → praise that person for that message.
  if (reply && !replyToBot && reply.from && !reply.from.is_bot) {
    const target = mediaOf(reply) ?? (textOf(reply) ? { type: "text" as const, text: textOf(reply) } : undefined);
    if (target) {
      const sameUser = reply.from.id === from.id;
      return withVoiceLimit(
        {
          kind: "reply",
          job: {
            ...base,
            name: reply.from.first_name,
            askedBy: sameUser ? undefined : from.first_name,
            note: ownText || undefined,
            input: target,
          },
        },
        m,
        opts.maxVoiceSeconds,
        m.message_id,
      );
    }
  }

  if (!ownMedia && !ownText && !replyToBot) {
    return { kind: "command", command: "start", chatId: m.chat.id, chatKind: "group", userId: from.id, userLang: from.language_code, replyTo: m.message_id };
  }
  const input: Input = ownMedia ?? { type: "text", text: ownText || "…" };
  return withVoiceLimit(
    {
      kind: "reply",
      job: {
        ...base,
        name: from.first_name,
        replyContext: replyToBot ? textOf(reply!) || undefined : undefined,
        input,
      },
    },
    m,
    opts.maxVoiceSeconds,
    m.message_id,
  );
}
