// Quick actions handled right away (no Claude call): commands and rating buttons.

import type { Env } from "./env";
import { settings } from "./env";
import { Memory } from "./memory";
import { Metrics } from "./metrics";
import type { Action } from "./routing";
import { Telegram } from "./telegram";
import { buildReport } from "./selftest";
import { pickLang, T } from "./texts";

type CommandAction = Extract<Action, { kind: "command" }>;
type RateAction = Extract<Action, { kind: "rate" }>;
type TooLongAction = Extract<Action, { kind: "tooLong" }>;

export async function runCommand(env: Env, a: CommandAction): Promise<void> {
  const s = settings(env);
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, s.telegramApi);
  const lang = pickLang(a.userLang);
  const memory = new Memory(env.KV, { botToken: env.TELEGRAM_BOT_TOKEN, maxTurns: s.memoryMessages, ttlHours: s.memoryTtlHours });
  const reply = (text: string, html = false) => tg.sendMessage(a.chatId, text, { replyTo: a.replyTo, html });

  switch (a.command) {
    case "start": {
      const text = T.start[lang];
      await reply(text);
      // Remember the greeting, so the next answer knows the question it follows.
      if (a.chatKind === "private" && memory.enabled) {
        const { turns } = await memory.load(a.chatId);
        await memory.append(a.chatId, turns, [{ r: "u", t: "/start" }, { r: "a", t: text, m: "START" }]).catch(() => {});
      }
      return;
    }

    case "privacy":
      await reply(T.privacy(Math.floor(s.memoryMessages / 2), s.memoryTtlHours)[lang], true);
      return;

    case "forget":
      if (a.chatKind !== "private") return void (await reply(T.privateOnly[lang]));
      await memory.forget(a.chatId);
      await reply(T.forgot[lang]);
      return;

    case "mydata": {
      if (a.chatKind !== "private") return void (await reply(T.privateOnly[lang]));
      const mine = (await memory.load(a.chatId)).turns.filter((t) => t.r === "u" && t.t !== "/start");
      const list = mine.map((t) => `— ${t.t}`).join("\n").slice(0, 3500);
      await reply(T.myData(mine.length, s.memoryTtlHours, list)[lang]);
      return;
    }

    case "stats":
      // Only for the owner. Everyone else gets no answer, so the command stays invisible.
      if (a.chatKind !== "private" || !s.adminId || a.userId !== s.adminId) return;
      await reply(await new Metrics(env.DB, env.KV).report(7));
      return;

    case "selftest":
      if (a.chatKind !== "private" || !s.adminId || a.userId !== s.adminId) return;
      await reply(await buildReport(env));
      return;
  }
}

export async function runRate(env: Env, a: RateAction): Promise<void> {
  const s = settings(env);
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, s.telegramApi);
  await Promise.allSettled([
    new Metrics(env.DB, env.KV).rate(a.eventId, a.rating),
    tg.answerCallback(a.callbackId, "❤️"),
    a.chatId && a.messageId ? tg.removeKeyboard(a.chatId, a.messageId) : Promise.resolve(),
  ]);
}

export async function runTooLong(env: Env, a: TooLongAction): Promise<void> {
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, settings(env).telegramApi);
  await tg.sendMessage(a.chatId, T.tooLong(a.maxSeconds)[pickLang(a.userLang)], { replyTo: a.replyTo });
}
