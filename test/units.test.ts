import { describe, expect, it } from "vitest";
import { chatKey, open, seal, webhookSecret } from "../src/crypto";
import { buildUserContent, parseAnswer } from "../src/llm";
import { trimTurns } from "../src/memory";
import { errorName, UserFacingError } from "../src/reply";
import type { ReplyJob } from "../src/routing";
import { pickLang, T } from "../src/texts";

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
  it("states the memory lifetime in /privacy", () => {
    expect(T.privacy(24, true).ru).toContain("24 ч");
    expect(T.privacy(24, false).ru).toContain("не храню");
  });
});
