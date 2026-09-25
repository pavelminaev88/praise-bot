import { describe, expect, it } from "vitest";
import { chatKey, open, seal, webhookSecret } from "../src/crypto";
import { buildUserContent, parseAnswer } from "../src/llm";
import { trimTurns } from "../src/memory";
import { errorName, UserFacingError } from "../src/reply";
import type { ReplyJob } from "../src/routing";
import { pickLang, plural, T } from "../src/texts";
import { claudeCost } from "../src/pricing";
import { Memory } from "../src/memory";

const token = "123456:ABC-test-token";

describe("crypto", () => {
  it("round-trips a sealed job and hides the text", async () => {
    const job = { chatId: 1, text: "секретное сообщение" };
    const sealed = await seal(token, job);
    expect(sealed).not.toContain("секрет");
    expect(await open(token, sealed)).toEqual(job);
  });

  it("cannot be opened with another token", async () => {
    const sealed = await seal(token, { a: 1 });
    await expect(open("999:other", sealed)).rejects.toThrow();
  });

  it("derives stable secrets without exposing the chat id", async () => {
    expect(await webhookSecret(token)).toMatch(/^[0-9a-f]{48}$/);
    const k = await chatKey(token, 12345);
    expect(k).toBe(await chatKey(token, 12345));
    expect(k).not.toContain("12345");
  });
});

describe("buildUserContent", () => {
  const base: ReplyJob = { chatId: 1, chatKind: "private", userId: 1, name: "Anna", input: { type: "text", text: "x" } };

  it("adds a header with chat type and name", () => {
    expect(buildUserContent(base, "Я сделала зарядку")).toBe("[chat: private] [name: Anna] [input: text]\n\nЯ сделала зарядку");
  });

  it("marks group praise for someone else", () => {
    const c = buildUserContent({ ...base, chatKind: "group", name: "Boris", askedBy: "Anna", note: "он молодец", input: { type: "voice", fileId: "f", duration: 3, filename: "voice.ogg" } }, "Закрыл отчёт", "START");
    expect(c).toContain("[chat: group] [praise for: Boris] [asked by: Anna] [input: voice transcript] [previous mode: START]");
    expect(c).toContain('(Comment from Anna: "он молодец")');
    expect(c.endsWith("Закрыл отчёт")).toBe(true);
  });

  it("includes the bot message being replied to", () => {
    expect(buildUserContent({ ...base, replyContext: "Ты молодец." }, "ещё")).toContain('(Replying to your earlier message: "Ты молодец.")');
  });
});

describe("parseAnswer", () => {
  it("normalizes mode and language", () => {
    expect(parseAnswer({ MODE: "praise", ANSWER: " Хорошо. ", LANGUAGE: "RU" })).toEqual({ mode: "PRAISE", answer: "Хорошо.", language: "ru" });
  });
  it("falls back to PRAISE for an unknown mode", () => {
    expect(parseAnswer({ MODE: "??", ANSWER: "ok", LANGUAGE: "en" }).mode).toBe("PRAISE");
  });
  it("throws on an empty answer", () => {
    expect(() => parseAnswer({ MODE: "PRAISE", ANSWER: "" })).toThrow();
    expect(() => parseAnswer(undefined)).toThrow();
  });
});

describe("trimTurns", () => {
  it("keeps the last N and starts with a user turn", () => {
    const turns = [
      { r: "u" as const, t: "1" },
      { r: "a" as const, t: "2" },
      { r: "u" as const, t: "3" },
      { r: "a" as const, t: "4" },
    ];
    expect(trimTurns(turns, 3)).toEqual([{ r: "u", t: "3" }, { r: "a", t: "4" }]);
    expect(trimTurns(turns, 4)).toHaveLength(4);
    expect(trimTurns(turns, 0)).toEqual([]);
  });
});

describe("errorName never leaks content", () => {
  it("keeps only the error kind", () => {
    expect(errorName(new Error("Anthropic API 529: overloaded, user said: секрет"))).toBe("Anthropic API 529");
    expect(errorName(new Error("Telegram sendMessage failed: 400 Bad Request"))).toBe("Telegram sendMessage");
    expect(errorName(new UserFacingError("длинное"))).toBe("user_facing");
    expect(errorName(new Error("some text with секрет"))).toBe("Error");
  });
});

describe("texts", () => {
  it("picks a language", () => {
    expect(pickLang("ru")).toBe("ru");
    expect(pickLang("uk")).toBe("ru");
    expect(pickLang("ca")).toBe("es");
    expect(pickLang("de")).toBe("en");
    expect(pickLang(undefined)).toBe("en");
  });
  it("/privacy states memory size and lifetime, links the code", () => {
    expect(T.privacy(10, 24).ru).toContain("Помню последние 10 твоих сообщений и удаляю их через 24 часа");
    expect(T.privacy(10, 24).ru).toContain('<a href="https://github.com/pavelminaev88/praise-bot">');
    expect(T.privacy(0, 24).ru).toContain("Ничего не запоминаю");
  });
  it("/start is one short line without a name", () => {
    expect(T.start.ru).toBe("Привет. За что можешь себя сегодня похвалить?");
  });
  it("Russian plurals", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "a", "b", "c")).join("")).toBe("abccabc");
  });
});

describe("claudeCost", () => {
  it("prices Sonnet 5 at $2 / $10 per million, cache reads at 10%", () => {
    expect(claudeCost("claude-sonnet-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
    expect(claudeCost("claude-sonnet-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
    expect(claudeCost("some-other-model", { input_tokens: 10 })).toBeUndefined();
  });
});

describe("memory forgets each message after the TTL", () => {
  function fakeKV() {
    const store = new Map<string, { value: string; metadata: unknown }>();
    return {
      async getWithMetadata(k: string) {
        const v = store.get(k);
        return { value: v ? JSON.parse(v.value) : null, metadata: v?.metadata ?? null };
      },
      async put(k: string, value: string, o: { metadata?: unknown }) {
        store.set(k, { value, metadata: o.metadata });
      },
      async delete(k: string) {
        store.delete(k);
      },
    } as unknown as KVNamespace;
  }
  it("drops messages older than 24 h, keeps newer ones", async () => {
    const mem = new Memory(fakeKV(), { botToken: token, maxTurns: 20, ttlHours: 24 });
    const old = Date.now() - 25 * 3600_000;
    await mem.append(1, [], [
      { r: "u", t: "old", ts: old },
      { r: "a", t: "old answer", ts: old },
      { r: "u", t: "new" },
      { r: "a", t: "new answer" },
    ]);
    const { turns } = await mem.load(1);
    expect(turns.map((t) => t.t)).toEqual(["new", "new answer"]);
  });
});
