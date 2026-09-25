// Weekly health check (Cloudflare Cron) and /selftest for the owner.
// One real Claude call with a fixed test message, plus cheap checks of Telegram, KV, D1 and the OpenAI key.
// Nothing is sent to users; the report goes to ADMIN_TELEGRAM_ID only. Nothing is recorded in the stats.

import type { Env } from "./env";
import { settings } from "./env";
import { askClaude } from "./llm";
import { Metrics } from "./metrics";
import { usd } from "./pricing";
import { Telegram } from "./telegram";

const TEST_MESSAGE =
  "[chat: private] [name: Тест] [input: text]\n\nСегодня впервые за месяц вышел на пробежку, хотя очень не хотелось.";

interface Check {
  ok: boolean;
  text: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const r = await fn();
  return [r, Date.now() - t];
}

function secs(ms: number) {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} с`;
}

async function checkTelegram(tg: Telegram): Promise<Check> {
  const info = await tg.call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo");
  if (!info.url.endsWith("/telegram")) return { ok: false, text: "Telegram: вебхук не подключён — открой /setup" };
  const weekAgo = Date.now() / 1000 - 7 * 86400;
  const recentError = info.last_error_date && info.last_error_date > weekAgo ? ` Последняя ошибка: ${info.last_error_message}` : "";
  const ok = info.pending_update_count < 5 && !recentError;
  return { ok, text: `Telegram: подключён, в очереди ${info.pending_update_count}.${recentError}` };
}

async function checkStorage(env: Env): Promise<Check> {
  const key = `selftest:${Date.now()}`;
  await env.KV.put(key, "1", { expirationTtl: 60 });
  const kvOk = (await env.KV.get(key)) === "1";
  await env.KV.delete(key);
  const row = await env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  const ok = kvOk && row?.one === 1;
  return { ok, text: ok ? "Память и статистика: работают" : `Память: ${kvOk ? "ок" : "сбой"}, статистика: ${row?.one === 1 ? "ок" : "сбой"}` };
}

/** Returns the check and the test answer, so the owner can see it is sensible. */
async function checkClaude(env: Env): Promise<[Check, string]> {
  const s = settings(env);
  const [a, ms] = await timed(() => askClaude({ apiKey: env.ANTHROPIC_API_KEY, apiBase: s.anthropicApi, model: s.model, history: [], userContent: TEST_MESSAGE }));
  const sentences = a.answer.split(/[.?…]+/).filter((x) => x.trim().length > 3).length;
  const problems = [
    a.mode !== "PRAISE" && `режим ${a.mode} вместо PRAISE`,
    a.language !== "ru" && `язык ${a.language}`,
    a.answer.includes("!") && "есть восклицательный знак",
    /\p{Extended_Pictographic}/u.test(a.answer) && "есть эмодзи",
    (sentences < 2 || sentences > 6) && `${sentences} предложений`,
  ].filter(Boolean);
  const ok = problems.length === 0;
  const cost = a.cost !== undefined ? `, стоимость проверки ${usd(a.cost)}` : "";
  return [{ ok, text: `Claude (${s.model}): ответ за ${secs(ms)}${cost}${ok ? "" : ` — ${problems.join(", ")}`}` }, a.answer];
}

async function checkOpenAI(env: Env): Promise<Check> {
  if (!env.OPENAI_API_KEY) return { ok: false, text: "OpenAI: ключ не задан, голосовые выключены" };
  const res = await fetch(`${settings(env).openaiApi}/v1/models`, {
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: res.ok, text: res.ok ? "OpenAI: ключ действителен" : `OpenAI: ключ не работает (${res.status})` };
}

async function safe(name: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, text: `${name}: ошибка — ${e instanceof Error ? e.message.slice(0, 120) : "неизвестно"}` };
  }
}

export async function buildReport(env: Env): Promise<string> {
  const tg = new Telegram(env.TELEGRAM_BOT_TOKEN, settings(env).telegramApi);
  let sample = "";
  const checks = await Promise.all([
    safe("Telegram", () => checkTelegram(tg)),
    safe("Хранилище", () => checkStorage(env)),
    safe("Claude", async () => {
      const [c, answer] = await checkClaude(env);
      sample = answer;
      return c;
    }),
    safe("OpenAI", () => checkOpenAI(env)),
  ]);
  const passed = checks.filter((c) => c.ok).length;
  const stats = await new Metrics(env.DB, env.KV).weekSummary().catch(() => "Статистика: не удалось прочитать");

  return [
    `${passed === checks.length ? "🟢" : "🔴"} Похвала — проверка: ${passed}/${checks.length}`,
    ...checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.text}`),
    sample ? `\nТестовый ответ: «${sample}»` : "",
    `\n${stats}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendReport(env: Env): Promise<void> {
  const s = settings(env);
  if (!s.adminId) return;
  const report = await buildReport(env);
  await new Telegram(env.TELEGRAM_BOT_TOKEN, s.telegramApi).sendMessage(s.adminId, report);
}
