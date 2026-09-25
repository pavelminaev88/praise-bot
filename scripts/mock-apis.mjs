// Fake Telegram, Anthropic and OpenAI APIs for local end-to-end tests.
// Records every call so the test can check what the bot sent.

import http from "node:http";

export function startMock(port = 8788) {
  const calls = [];
  let messageId = 1000;
  let failClaude = 0;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, `http://localhost:${port}`);
    const json = (obj, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    // Telegram Bot API
    let m = url.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
    if (m) {
      const method = m[2];
      const body = raw.length ? JSON.parse(raw.toString()) : {};
      calls.push({ api: "telegram", method, body });
      if (method === "getMe") return json({ ok: true, result: { id: 999, is_bot: true, first_name: "Похвала", username: "PohvalaChatBot" } });
      if (method === "sendMessage") return json({ ok: true, result: { message_id: ++messageId, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text } });
      if (method === "getFile") return json({ ok: true, result: { file_id: body.file_id, file_path: "voice/file_1.oga" } });
      return json({ ok: true, result: true });
    }
    if (url.pathname.startsWith("/file/bot")) {
      calls.push({ api: "telegram-file", path: url.pathname });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(Buffer.from("OggS-fake-audio"));
    }

    // Anthropic
    if (url.pathname === "/v1/messages") {
      const body = JSON.parse(raw.toString());
      calls.push({ api: "anthropic", body, headers: req.headers });
      const last = body.messages.at(-1).content;
      if (failClaude > 0 || last.includes("FAIL_ALWAYS")) {
        failClaude = Math.max(0, failClaude - 1);
        return json({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529);
      }
      const text = last.split("\n").at(-1);
      const mode = text === "/start" ? "START" : text === "спасибо" ? "CLOSING" : "PRAISE";
      return json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu_1", name: "reply", input: { MODE: mode, ANSWER: `Ответ на: ${text}`, LANGUAGE: "RU" } }],
        stop_reason: "tool_use",
      });
    }

    // OpenAI transcription
    if (url.pathname === "/v1/audio/transcriptions") {
      calls.push({ api: "openai", contentType: req.headers["content-type"], size: raw.length, hasOgg: raw.includes("voice.ogg") });
      return json({ text: "Я сегодня пробежал пять километров" });
    }

    json({ error: "not found" }, 404);
  });

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        calls,
        reset: () => (calls.length = 0),
        failClaudeTimes: (n) => (failClaude = n),
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}
