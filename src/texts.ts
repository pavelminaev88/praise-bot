// Fixed bot messages (everything that does not come from Claude). Russian, Spanish, English.

export type Lang = "ru" | "es" | "en";

export function pickLang(code?: string): Lang {
  const c = (code ?? "").toLowerCase();
  if (/^(ru|uk|be|kk)/.test(c)) return "ru";
  if (/^(es|ca|gl|eu)/.test(c)) return "es";
  return "en";
}

function hours(ms: number) {
  return Math.max(1, Math.round(ms / 3600_000));
}

export const T = {
  listening: {
    ru: "Слушаю, дай мне немного времени.",
    es: "Te escucho, dame un momento.",
    en: "Listening, give me a moment.",
  },
  tooLong: (max: number) => ({
    ru: `Это длинное сообщение. Я слушаю до ${Math.round(max / 60)} минут. Можешь разбить на части или написать главное текстом.`,
    es: `Es un mensaje largo. Escucho hasta ${Math.round(max / 60)} minutos. Puedes dividirlo en partes o escribir lo principal.`,
    en: `That is a long message. I listen to up to ${Math.round(max / 60)} minutes. You can split it or write the main point as text.`,
  }),
  failed: {
    ru: "Не получилось ответить. Попробуй ещё раз чуть позже или напиши текстом.",
    es: "No he podido responder. Inténtalo de nuevo un poco más tarde o escríbelo.",
    en: "I could not reply. Please try again a bit later or send it as text.",
  },
  voiceOff: {
    ru: "Голосовые пока не подключены. Напиши, пожалуйста, текстом.",
    es: "Los mensajes de voz aún no están activados. Escríbelo, por favor.",
    en: "Voice messages are not enabled yet. Please send text.",
  },
  emptyVoice: {
    ru: "Не расслышал слов в сообщении. Попробуй ещё раз или напиши текстом.",
    es: "No he entendido palabras en el mensaje. Inténtalo de nuevo o escríbelo.",
    en: "I could not hear any words. Try again or send it as text.",
  },
  forgot: {
    ru: "Готово. Я забыл наш разговор.",
    es: "Hecho. He olvidado nuestra conversación.",
    en: "Done. I have forgotten our conversation.",
  },
  privateOnly: {
    ru: "Эта команда работает в личных сообщениях со мной.",
    es: "Este comando funciona en mensajes privados conmigo.",
    en: "This command works in a private chat with me.",
  },
  thanks: { ru: "Спасибо", es: "Gracias", en: "Thanks" },
  privacy: (ttlHours: number, memoryOn: boolean) => ({
    ru: [
      "Что я храню:",
      memoryOn
        ? `— В личке помню последние сообщения нашего разговора ${ttlHours} ч после последнего сообщения, потом они удаляются автоматически. /forget — удалить сразу, /mydata — посмотреть.`
        : "— Сообщения я не храню.",
      "— В группах ничего не запоминаю. Сообщения, где меня не позвали, сразу отбрасываю.",
      "— Анонимные счётчики: дата, тип ответа, язык, оценка 🔥😐👎. Без текстов и без ID.",
      "",
      "Кто ещё видит сообщения:",
      "— Текст обрабатывает модель Claude (Anthropic), голосовые расшифровывает OpenAI. По их условиям для API данные не используются для обучения и удаляются в течение 30 дней.",
      "— Сам Telegram хранит переписку как обычный чат.",
      "",
      "Код открыт, можно проверить: https://github.com/pavelminaev88/praise-bot",
    ].join("\n"),
    es: [
      "Qué guardo:",
      memoryOn
        ? `— En privado recuerdo los últimos mensajes de nuestra conversación durante ${ttlHours} h desde el último mensaje; después se borran solos. /forget — borrar ya, /mydata — ver.`
        : "— No guardo mensajes.",
      "— En grupos no recuerdo nada. Los mensajes en los que no me llaman se descartan al momento.",
      "— Contadores anónimos: fecha, tipo de respuesta, idioma, valoración 🔥😐👎. Sin textos ni IDs.",
      "",
      "Quién más ve los mensajes:",
      "— El texto lo procesa el modelo Claude (Anthropic) y la voz la transcribe OpenAI. Según sus condiciones de API, los datos no se usan para entrenar y se borran en 30 días.",
      "— Telegram guarda el chat como cualquier otro.",
      "",
      "El código es abierto: https://github.com/pavelminaev88/praise-bot",
    ].join("\n"),
    en: [
      "What I store:",
      memoryOn
        ? `— In private chat I remember the latest messages of our conversation for ${ttlHours} h after the last message, then they are deleted automatically. /forget deletes them now, /mydata shows them.`
        : "— I do not store messages.",
      "— In groups I remember nothing. Messages that do not call me are dropped right away.",
      "— Anonymous counters: date, reply type, language, 🔥😐👎 rating. No texts, no IDs.",
      "",
      "Who else sees messages:",
      "— Text is processed by Claude (Anthropic), voice is transcribed by OpenAI. Under their API terms data is not used for training and is deleted within 30 days.",
      "— Telegram itself keeps the chat like any other chat.",
      "",
      "The code is open: https://github.com/pavelminaev88/praise-bot",
    ].join("\n"),
  }),
  myData: (count: number, expiresInMs: number | undefined, preview: string) => ({
    ru: count
      ? `Сейчас я помню ${count} сообщ. из нашего разговора. Они удалятся примерно через ${hours(expiresInMs ?? 0)} ч.\n/forget — удалить сейчас.\n\n${preview}`
      : "О тебе у меня ничего не сохранено.",
    es: count
      ? `Ahora recuerdo ${count} mensajes de nuestra conversación. Se borrarán en unas ${hours(expiresInMs ?? 0)} h.\n/forget — borrar ya.\n\n${preview}`
      : "No tengo nada guardado sobre ti.",
    en: count
      ? `I currently remember ${count} messages from our conversation. They will be deleted in about ${hours(expiresInMs ?? 0)} h.\n/forget deletes them now.\n\n${preview}`
      : "I have nothing stored about you.",
  }),
};
