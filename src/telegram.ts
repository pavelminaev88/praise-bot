// Minimal Telegram Bot API types and client. Only what this bot uses.

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  user?: TgUser;
}

export interface TgMedia {
  file_id: string;
  duration: number;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  voice?: TgMedia;
  audio?: TgMedia;
  video_note?: TgMedia;
  reply_to_message?: TgMessage;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface BotInfo {
  id: number;
  username: string;
}

export type InlineKeyboard = { text: string; callback_data: string }[][];

export class Telegram {
  constructor(
    private token: string,
    private apiBase = "https://api.telegram.org",
  ) {}

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram ${method} failed: ${res.status} ${data.description ?? ""}`.trim());
    }
    return data.result as T;
  }

  getMe() {
    return this.call<TgUser>("getMe");
  }

  sendMessage(
    chatId: number,
    text: string,
    opts: { replyTo?: number; keyboard?: InlineKeyboard } = {},
  ) {
    const params: Record<string, unknown> = { chat_id: chatId, text };
    if (opts.replyTo) {
      params.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true };
    }
    if (opts.keyboard) params.reply_markup = { inline_keyboard: opts.keyboard };
    return this.call<TgMessage>("sendMessage", params);
  }

  sendTyping(chatId: number) {
    return this.call("sendChatAction", { chat_id: chatId, action: "typing" });
  }

  answerCallback(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, text });
  }

  removeKeyboard(chatId: number, messageId: number) {
    return this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  }

  /** Downloads a file by file_id. Bots can download files up to 20 MB. */
  async downloadFile(fileId: string): Promise<{ bytes: ArrayBuffer; path: string }> {
    const file = await this.call<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new Error("Telegram getFile returned no file_path");
    const res = await fetch(`${this.apiBase}/file/bot${this.token}/${file.file_path}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    return { bytes: await res.arrayBuffer(), path: file.file_path };
  }
}
