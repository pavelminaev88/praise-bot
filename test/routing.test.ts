import { describe, expect, it } from "vitest";
import { route, type Action } from "../src/routing";
import type { TgMessage, TgUpdate } from "../src/telegram";

const bot = { id: 999, username: "PohvalaChatBot" };
const opts = { bot, maxVoiceSeconds: 600 };
const anna = { id: 1, is_bot: false, first_name: "Anna", language_code: "ru" };
const boris = { id: 2, is_bot: false, first_name: "Boris", language_code: "es" };
const botUser = { id: 999, is_bot: true, first_name: "Похвала", username: "PohvalaChatBot" };

let nextId = 1;
function msg(partial: Partial<TgMessage>, chatType: "private" | "supergroup" = "private"): TgUpdate {
  return {
    update_id: nextId++,
    message: { message_id: nextId, date: 0, chat: { id: chatType === "private" ? 1 : -100, type: chatType }, from: anna, ...partial },
  };
}
const mention = (text: string, at: string) => ({ type: "mention", offset: text.indexOf(at), length: at.length });
const command = (text: string) => ({ type: "bot_command", offset: 0, length: text.split(" ")[0].length });

function job(a: Action) {
  expect(a.kind).toBe("reply");
  return (a as Extract<Action, { kind: "reply" }>).job;
}

describe("private chat", () => {
  it("replies to plain text", () => {
    const j = job(route(msg({ text: "Сегодня я наконец сходил в спортзал" }), opts));
    expect(j).toMatchObject({ chatKind: "private", name: "Anna", input: { type: "text", text: "Сегодня я наконец сходил в спортзал" } });
    expect(j.replyTo).toBeUndefined();
  });

  it("passes /start to the model", () => {
    const j = job(route(msg({ text: "/start", entities: [command("/start")] }), opts));
    expect(j.input).toEqual({ type: "text", text: "/start" });
  });

  it("handles service commands without the model", () => {
    for (const c of ["privacy", "forget", "mydata", "stats"]) {
      const a = route(msg({ text: `/${c}`, entities: [command(`/${c}`)] }), opts);
      expect(a).toMatchObject({ kind: "command", command: c, chatKind: "private" });
    }
  });

  it("takes voice messages", () => {
    const j = job(route(msg({ voice: { file_id: "F1", duration: 42 } }), opts));
    expect(j.input).toMatchObject({ type: "voice", fileId: "F1", duration: 42, filename: "voice.ogg" });
  });

  it("refuses voice longer than the limit", () => {
    const a = route(msg({ voice: { file_id: "F1", duration: 601 } }), opts);
    expect(a).toMatchObject({ kind: "tooLong", maxSeconds: 600 });
  });

  it("keeps the bot's previous message as context on reply", () => {
    const prev: TgMessage = { message_id: 5, date: 0, chat: { id: 1, type: "private" }, from: botUser, text: "Ты молодец." };
    const j = job(route(msg({ text: "А ещё?", reply_to_message: prev }), opts));
    expect(j.replyContext).toBe("Ты молодец.");
  });

  it("ignores stickers and empty messages", () => {
    expect(route(msg({}), opts).kind).toBe("ignore");
  });

  it("ignores messages from bots", () => {
    expect(route(msg({ text: "hi", from: botUser }), opts).kind).toBe("ignore");
  });
});

describe("group chat", () => {
  it("ignores messages that do not call the bot", () => {
    expect(route(msg({ text: "всем привет" }, "supergroup"), opts).kind).toBe("ignore");
    expect(route(msg({ text: "/start", entities: [command("/start")] }, "supergroup"), opts).kind).toBe("ignore");
  });

  it("answers an @mention and strips it from the text", () => {
    const text = "@PohvalaChatBot я сдал экзамен";
    const j = job(route(msg({ text, entities: [mention(text, "@PohvalaChatBot")] }, "supergroup"), opts));
    expect(j).toMatchObject({ chatKind: "group", name: "Anna", input: { type: "text", text: "я сдал экзамен" } });
    expect(j.replyTo).toBeDefined();
  });

  it("matches the mention case-insensitively", () => {
    const text = "@pohvalachatbot привет";
    expect(route(msg({ text, entities: [mention(text, "@pohvalachatbot")] }, "supergroup"), opts).kind).toBe("reply");
  });

  it("ignores mentions of other bots", () => {
    const text = "@OtherBot привет";
    expect(route(msg({ text, entities: [mention(text, "@OtherBot")] }, "supergroup"), opts).kind).toBe("ignore");
  });

  it("praises the author of the message the tag replies to", () => {
    const target: TgMessage = { message_id: 7, date: 0, chat: { id: -100, type: "supergroup" }, from: boris, text: "Закрыл квартальный отчёт" };
    const text = "@PohvalaChatBot он молодец";
    const j = job(route(msg({ text, entities: [mention(text, "@PohvalaChatBot")], reply_to_message: target }, "supergroup"), opts));
    expect(j).toMatchObject({ name: "Boris", askedBy: "Anna", note: "он молодец", input: { type: "text", text: "Закрыл квартальный отчёт" } });
  });

  it("praises a replied voice message", () => {
    const target: TgMessage = { message_id: 7, date: 0, chat: { id: -100, type: "supergroup" }, from: boris, voice: { file_id: "V", duration: 30 } };
    const j = job(route(msg({ text: "/praise", entities: [command("/praise")], reply_to_message: target }, "supergroup"), opts));
    expect(j).toMatchObject({ name: "Boris", askedBy: "Anna", input: { type: "voice", fileId: "V" } });
    expect(j.note).toBeUndefined();
  });

  it("answers /praise@thisbot and ignores /praise@otherbot", () => {
    expect(route(msg({ text: "/praise@PohvalaChatBot", entities: [command("/praise@PohvalaChatBot")] }, "supergroup"), opts).kind).toBe("reply");
    expect(route(msg({ text: "/praise@OtherBot", entities: [command("/praise@OtherBot")] }, "supergroup"), opts).kind).toBe("ignore");
  });

  it("continues when someone replies to the bot", () => {
    const prev: TgMessage = { message_id: 5, date: 0, chat: { id: -100, type: "supergroup" }, from: botUser, text: "Отличная работа." };
    const j = job(route(msg({ text: "спасибо", reply_to_message: prev }, "supergroup"), opts));
    expect(j).toMatchObject({ name: "Anna", replyContext: "Отличная работа.", input: { text: "спасибо" } });
  });

  it("treats a bare tag as a start", () => {
    const text = "@PohvalaChatBot";
    const j = job(route(msg({ text, entities: [mention(text, text)] }, "supergroup"), opts));
    expect(j.input).toEqual({ type: "text", text: "/start" });
  });

  it("routes /forget@thisbot as a command", () => {
    const a = route(msg({ text: "/forget@PohvalaChatBot", entities: [command("/forget@PohvalaChatBot")] }, "supergroup"), opts);
    expect(a).toMatchObject({ kind: "command", command: "forget", chatKind: "group" });
  });
});

describe("rating buttons", () => {
  it("parses callback data", () => {
    const u: TgUpdate = {
      update_id: 1,
      callback_query: { id: "cb", from: anna, data: "r:g:abc123", message: { message_id: 9, date: 0, chat: { id: 1, type: "private" } } },
    };
    expect(route(u, opts)).toEqual({ kind: "rate", callbackId: "cb", rating: "good", eventId: "abc123", chatId: 1, messageId: 9 });
  });

  it("ignores unknown callback data", () => {
    const u: TgUpdate = { update_id: 1, callback_query: { id: "cb", from: anna, data: "zzz" } };
    expect(route(u, opts).kind).toBe("ignore");
  });
});
