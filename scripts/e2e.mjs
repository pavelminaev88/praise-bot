// End-to-end test: runs the Worker locally (wrangler dev, with local KV, D1 and Workflows)
// against fake Telegram / Anthropic / OpenAI APIs and checks what the bot does.
//
//   npm run e2e

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import { startMock } from "./mock-apis.mjs";

const TOKEN = "999:TEST_TOKEN";
const MOCK = "http://127.0.0.1:8788";
const WORKER = "http://127.0.0.1:8787";
const SECRET = createHash("sha256").update(`webhook:${TOKEN}`).digest("hex").slice(0, 48);

writeFileSync(
  ".dev.vars",
  [
    `TELEGRAM_BOT_TOKEN=${TOKEN}`,
    "ANTHROPIC_API_KEY=test-anthropic",
    "OPENAI_API_KEY=test-openai",
    `TELEGRAM_API_BASE=${MOCK}`,
    `ANTHROPIC_API_BASE=${MOCK}`,
    `OPENAI_API_BASE=${MOCK}`,
    "ADMIN_TELEGRAM_ID=1",
  ].join("\n"),
);
rmSync(".wrangler/state", { recursive: true, force: true });

const mock = await startMock(8788);
const env = { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
const dev = spawn("npx", ["wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1", "--local", "--test-scheduled"], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let devLog = "";
dev.stdout.on("data", (d) => (devLog += d));
dev.stderr.on("data", (d) => (devLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000, label = "condition") {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

let updateId = 1;
async function send(update, secret = SECRET) {
  const res = await fetch(`${WORKER}/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
  return res;
}

const anna = { id: 1, is_bot: false, first_name: "Anna", language_code: "ru" };
const boris = { id: 2, is_bot: false, first_name: "Boris", language_code: "es" };
const privateChat = { id: 1, type: "private" };
const group = { id: -100, type: "supergroup" };
let mid = 1;
const message = (fields, chat = privateChat, from = anna) => ({ message: { message_id: mid++, date: 0, chat, from, ...fields } });
const sent = () => mock.calls.filter((c) => c.api === "telegram" && c.method === "sendMessage");
const claude = () => mock.calls.filter((c) => c.api === "anthropic");

const results = [];
async function test(name, fn) {
  mock.reset();
  try {
    await fn();
    results.push(`✅ ${name}`);
  } catch (e) {
    results.push(`❌ ${name}: ${e.message}`);
  }
}

try {
  await waitFor(() => /Ready on/i.test(devLog), 90000, "wrangler dev");

  await test("rejects requests without the secret header", async () => {
    const res = await send(message({ text: "hi" }), "wrong");
    assert.equal(res.status, 403);
  });

  await test("/setup registers the webhook with the secret", async () => {
    const res = await fetch(`${WORKER}/setup`);
    const body = await res.json();
    assert.equal(body.ok, true, JSON.stringify(body));
    const hook = mock.calls.find((c) => c.method === "setWebhook");
    assert.equal(hook.body.secret_token, SECRET);
    assert.equal(hook.body.url, `${WORKER}/telegram`);
  });

  await test("private text → praise with rating buttons", async () => {
    await send(message({ text: "Я сегодня сходил в спортзал" }));
    const s = await waitFor(() => sent()[0], 20000, "reply");
    assert.equal(s.body.text, "Ответ на: Я сегодня сходил в спортзал");
    assert.equal(s.body.reply_markup.inline_keyboard[0].length, 3);
    const c = claude()[0].body;
    assert.match(c.messages.at(-1).content, /^\[chat: private\] \[name: Anna\] \[input: text\]/);
    assert.equal(c.tool_choice.name, "reply");
    assert.equal(c.messages.length, 1);
  });

  await test("second message sees memory", async () => {
    await send(message({ text: "И ещё почитал книгу" }));
    await waitFor(() => sent()[0], 20000, "reply");
    const c = claude()[0].body;
    assert.equal(c.messages.length, 3, JSON.stringify(c.messages.map((m) => m.role)));
    assert.equal(c.messages[0].content, "Я сегодня сходил в спортзал");
    assert.match(c.messages.at(-1).content, /\[previous mode: PRAISE\]/);
  });

  await test("/mydata shows what is remembered", async () => {
    await send(message({ text: "/mydata", entities: [{ type: "bot_command", offset: 0, length: 7 }] }));
    const s = await waitFor(() => sent()[0], 10000, "mydata");
    assert.match(s.body.text, /помню 4 сообщ/);
    assert.equal(claude().length, 0);
  });

  await test("/forget clears memory", async () => {
    await send(message({ text: "/forget", entities: [{ type: "bot_command", offset: 0, length: 7 }] }));
    await waitFor(() => sent()[0], 10000, "forget");
    mock.reset();
    await send(message({ text: "/mydata", entities: [{ type: "bot_command", offset: 0, length: 7 }] }));
    const s = await waitFor(() => sent()[0], 10000, "mydata after forget");
    assert.match(s.body.text, /ничего не сохранено/);
  });

  await test("rating button is recorded and keyboard removed", async () => {
    await send(message({ text: "Помог соседу" }));
    const s = await waitFor(() => sent()[0], 20000, "reply");
    const data = s.body.reply_markup.inline_keyboard[0][0].callback_data;
    mock.reset();
    await send({ callback_query: { id: "cb1", from: anna, data, message: { message_id: 1001, date: 0, chat: privateChat } } });
    await waitFor(() => mock.calls.find((c) => c.method === "answerCallbackQuery"), 10000, "answerCallbackQuery");
    await waitFor(() => mock.calls.find((c) => c.method === "editMessageReplyMarkup"), 10000, "editMessageReplyMarkup");
  });

  await test("/stats works for the admin and shows the rating", async () => {
    await send(message({ text: "/stats", entities: [{ type: "bot_command", offset: 0, length: 6 }] }));
    const s = await waitFor(() => sent()[0], 10000, "stats");
    assert.match(s.body.text, /🔥1/);
    assert.match(s.body.text, /3 отв\./);
  });

  await test("/stats is silent for other users", async () => {
    await send(message({ text: "/stats", entities: [{ type: "bot_command", offset: 0, length: 6 }] }, { id: 2, type: "private" }, boris));
    await sleep(1500);
    assert.equal(sent().length, 0);
  });

  await test("/selftest sends a health report to the admin", async () => {
    await send(message({ text: "/selftest", entities: [{ type: "bot_command", offset: 0, length: 9 }] }));
    const s = await waitFor(() => sent()[0], 15000, "selftest report");
    assert.match(s.body.text, /проверка: 4\/4/, s.body.text);
    assert.match(s.body.text, /Тестовый ответ: «Слышу/);
    assert.match(s.body.text, /За 7 дней: \d+ ответов/);
  });

  await test("weekly cron sends the report", async () => {
    await fetch(`${WORKER}/cdn-cgi/handler/scheduled?cron=0+7+*+*+1`);
    const s = await waitFor(() => sent()[0], 15000, "cron report");
    assert.equal(s.body.chat_id, 1);
    assert.match(s.body.text, /проверка: 4\/4/);
  });

  await test("voice message is transcribed and praised", async () => {
    await send(message({ voice: { file_id: "VOICE1", duration: 30 } }));
    const s = await waitFor(() => sent()[0], 20000, "voice reply");
    assert.equal(s.body.text, "Ответ на: Я сегодня пробежал пять километров");
    const t = mock.calls.find((c) => c.api === "openai");
    assert.ok(t && t.hasOgg, "transcription called with voice.ogg");
    assert.match(claude()[0].body.messages.at(-1).content, /\[input: voice transcript\]/);
  });

  await test("long voice gets a 'listening' note first", async () => {
    await send(message({ voice: { file_id: "VOICE2", duration: 240 } }));
    await waitFor(() => sent().length >= 2, 20000, "two messages");
    assert.equal(sent()[0].body.text, "Слушаю, дай мне немного времени.");
  });

  await test("voice over the limit is refused without calling any API", async () => {
    await send(message({ voice: { file_id: "VOICE3", duration: 900 } }));
    const s = await waitFor(() => sent()[0], 10000, "too long");
    assert.match(s.body.text, /до 10 минут/);
    assert.equal(claude().length, 0);
    assert.equal(mock.calls.filter((c) => c.api === "openai").length, 0);
  });

  await test("group: ignores messages that do not call the bot", async () => {
    await send(message({ text: "всем привет" }, group));
    await sleep(1500);
    assert.equal(sent().length, 0);
    assert.equal(claude().length, 0);
  });

  await test("group: tag in reply praises the other person, no buttons, no memory", async () => {
    const target = { message_id: 500, date: 0, chat: group, from: boris, text: "Закрыл квартальный отчёт" };
    const text = "@PohvalaChatBot смотрите";
    await send(message({ text, entities: [{ type: "mention", offset: 0, length: 15 }], reply_to_message: target }, group));
    const s = await waitFor(() => sent()[0], 20000, "group reply");
    assert.equal(s.body.reply_parameters.message_id, mid - 1);
    assert.equal(s.body.reply_markup, undefined);
    const c = claude()[0].body;
    assert.equal(c.messages.length, 1);
    assert.match(c.messages[0].content, /\[chat: group\] \[praise for: Boris\] \[asked by: Anna\]/);
  });

  await test("duplicate update is answered once", async () => {
    const u = { update_id: 777777, ...message({ text: "Дубль" }) };
    for (let i = 0; i < 2; i++) {
      await fetch(`${WORKER}/telegram`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
        body: JSON.stringify(u),
      });
    }
    await waitFor(() => sent()[0], 20000, "reply");
    await sleep(2000);
    assert.equal(sent().length, 1);
  });

  await test("Claude hiccup is retried", async () => {
    mock.failClaudeTimes(1);
    await send(message({ text: "Попробуй ещё раз" }));
    const s = await waitFor(() => sent()[0], 30000, "reply after retry");
    assert.equal(s.body.text, "Ответ на: Попробуй ещё раз");
    assert.equal(claude().length, 2);
  });

  await test("persistent failure → apology to the user", async () => {
    await send(message({ text: "FAIL_ALWAYS" }));
    const s = await waitFor(() => sent()[0], 60000, "failure message");
    assert.match(s.body.text, /Не получилось ответить/);
    assert.equal(claude().length, 3);
  });

  await test("no message text is logged", async () => {
    for (const secret of ["спортзал", "пять километров", "квартальный", "FAIL_ALWAYS"]) {
      assert.ok(!devLog.includes(secret), `log contains "${secret}"`);
    }
  });
} catch (e) {
  results.push(`❌ setup: ${e.message}`);
  console.log(devLog.slice(-3000));
} finally {
  try {
    process.kill(-dev.pid, "SIGTERM"); // stop wrangler and its workerd child
    await sleep(1500);
    process.kill(-dev.pid, "SIGKILL");
  } catch {}
  await mock.close();
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("❌")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
