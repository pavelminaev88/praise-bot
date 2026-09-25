// Entry point: receives Telegram updates and hands them to the right handler.
//
//   POST /telegram  — Telegram webhook (checked with a secret header)
//   GET  /setup     — connects this Worker to Telegram (open once after the first deploy)
//   GET  /          — health check

import { runCommand, runRate, runTooLong } from "./commands";
import { seal, webhookSecret } from "./crypto";
import { settings, type Env } from "./env";
import { route } from "./routing";
import { Telegram, type BotInfo, type TgUpdate } from "./telegram";

import { PROFILE } from "./profile";
import { sendReport } from "./selftest";

export { ReplyWorkflow } from "./workflow";

let botInfo: BotInfo | undefined;

async function getBot(env: Env): Promise<BotInfo> {
  if (!botInfo) {
    const me = await new Telegram(env.TELEGRAM_BOT_TOKEN, settings(env).telegramApi).getMe();
    botInfo = { id: me.id, username: me.username ?? "" };
  }
  return botInfo;
}

const COMMANDS = {
  ru: [
    { command: "start", description: "Начать" },
    { command: "privacy", description: "Что бот хранит" },
    { command: "mydata", description: "Что бот помнит обо мне" },
    { command: "forget", description: "Забыть наш разговор" },
  ],
  es: [
    { command: "start", description: "Empezar" },
    { command: "privacy", description: "Qué guarda el bot" },
    { command: "mydata", description: "Qué recuerda de mí" },
    { command: "forget", description: "Olvidar la conversación" },
  ],
  en: [
    { command: "start", description: "Start" },
    { command: "privacy", description: "What the bot stores" },
    { command: "mydata", description: "What the bot remembers about me" },
    { command: "forget", description: "Forget our conversation" },
  ],
};

/** Name, descriptions (default = Russian, plus English and Spanish) and, with ?avatar=1, the profile photo. */
async function setupProfile(env: Env, tg: Telegram, origin: string, withAvatar: boolean): Promise<string[]> {
  const done: string[] = [];
  for (const [lang, p] of Object.entries(PROFILE)) {
    const language_code = lang === "ru" ? "" : lang;
    await tg.call("setMyName", { name: p.name, language_code });
    await tg.call("setMyShortDescription", { short_description: p.short, language_code });
    await tg.call("setMyDescription", { description: p.description, language_code });
    done.push(`profile:${lang}`);
  }
  if (withAvatar) {
    const res = await env.ASSETS.fetch(new Request(`${origin}/avatar.jpg`));
    if (!res.ok) throw new Error(`avatar.jpg not found (${res.status})`);
    await tg.setProfilePhoto(await res.arrayBuffer());
    done.push("avatar");
  }
  return done;
}

async function setup(env: Env, origin: string, withAvatar: boolean): Promise<Response> {
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, settings(env).telegramApi);
  const url = `${origin}/telegram`;
  await tg.call("setWebhook", {
    url,
    secret_token: await webhookSecret(env.TELEGRAM_BOT_TOKEN),
    allowed_updates: ["message", "callback_query"],
  });
  await tg.call("setMyCommands", { commands: COMMANDS.en });
  await tg.call("setMyCommands", { commands: COMMANDS.ru, language_code: "ru" });
  await tg.call("setMyCommands", { commands: COMMANDS.es, language_code: "es" });
  await tg.call("setMyCommands", {
    commands: [{ command: "praise", description: "Похвалить (ответь на сообщение)" }],
    scope: { type: "all_group_chats" },
  });
  // Telegram limits how often a bot may change its name; a failure here must not break the webhook setup.
  const profile = await setupProfile(env, tg, origin, withAvatar).catch((e) => [`profile failed: ${e instanceof Error ? e.message : e}`]);
  const me = await getBot(env);
  return Response.json({ ok: true, bot: `@${me.username}`, webhook: url, profile, next: `Open https://t.me/${me.username} and say hi.` });
}

async function handleUpdate(env: Env, update: TgUpdate, ctx: ExecutionContext): Promise<void> {
  const s = settings(env);
  // Only group messages need the bot's username (to spot @mentions).
  const needsBot = update.message && update.message.chat.type !== "private";
  const bot = needsBot ? await getBot(env) : { id: Number(env.TELEGRAM_BOT_TOKEN.split(":")[0]), username: botInfo?.username ?? "" };
  const action = route(update, { bot, maxVoiceSeconds: s.maxVoiceSeconds });

  switch (action.kind) {
    case "ignore":
      return;
    case "reply": {
      const sealed = await seal(env.TELEGRAM_BOT_TOKEN, action.job);
      try {
        // The instance ID doubles as a guard against Telegram delivering the same update twice.
        await env.REPLY_WORKFLOW.create({ id: `b${bot.id}-u${update.update_id}`, params: { sealed } });
      } catch (e) {
        if (!/already exists/i.test(String(e))) throw e;
      }
      return;
    }
    case "command":
      ctx.waitUntil(runCommand(env, action).catch((e) => console.error("command failed:", e?.name ?? "error")));
      return;
    case "rate":
      ctx.waitUntil(runRate(env, action));
      return;
    case "tooLong":
      ctx.waitUntil(runTooLong(env, action).catch(() => {}));
      return;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");

    const missing = (["TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"] as const).filter((k) => !env[k]);
    if (missing.length) {
      return new Response(`Missing secrets: ${missing.join(", ")}. Add them in Settings → Variables and Secrets.`, { status: 500 });
    }

    if (request.method === "POST" && url.pathname === "/telegram") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== (await webhookSecret(env.TELEGRAM_BOT_TOKEN))) return new Response("Forbidden", { status: 403 });
      const update = (await request.json()) as TgUpdate;
      try {
        await handleUpdate(env, update, ctx);
      } catch (e) {
        // Answer 200 anyway: an error here would make Telegram resend the same update again and again.
        console.error("update failed:", e instanceof Error ? e.message.slice(0, 200) : "error");
      }
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/setup") {
      try {
        return await setup(env, url.origin, url.searchParams.get("avatar") === "1");
      } catch (e) {
        return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    }

    if (url.pathname === "/") {
      const optional = env.OPENAI_API_KEY ? "voice: on" : "voice: off (no OPENAI_API_KEY)";
      return new Response(`praise-bot is running. ${optional}. After the first deploy, open /setup once.`);
    }
    return new Response("Not found", { status: 404 });
  },

  /** Weekly health check (see "triggers" in wrangler.jsonc). Sends a report to ADMIN_TELEGRAM_ID. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendReport(env).catch((e) => console.error("weekly check failed:", e instanceof Error ? e.message.slice(0, 200) : "error")));
  },
} satisfies ExportedHandler<Env>;
