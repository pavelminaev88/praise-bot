// Fixed bot messages (everything that does not come from Claude). Russian, Spanish, English.

export type Lang = "ru" | "es" | "en";

/**
 * Language of the bot's fixed messages. Russian by default: many Russian speakers use Telegram in English,
 * so language_code "en" says little. Spanish only for Spanish/Catalan/Galician/Basque clients.
 * (Claude's own replies always follow the language of the message.)
 */
export function pickLang(code?: string): Lang {
  const c = (code ?? "").toLowerCase();
  if (/^(es|ca|gl|eu)/.test(c)) return "es";
  return "ru";
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
    ru: "Готово, разговор забыт.",
    es: "Hecho, conversación olvidada.",
    en: "Done, conversation forgotten.",
  },
  start: {
    ru: "Привет. За что можешь себя сегодня похвалить?",
    es: "Hola. ¿Por qué puedes felicitarte hoy?",
    en: "Hi. What can you praise yourself for today?",
  },
  privateOnly: {
    ru: "Эта команда работает в личных сообщениях со мной.",
    es: "Este comando funciona en mensajes privados conmigo.",
    en: "This command works in a private chat with me.",
  },
  thanks: { ru: "Спасибо", es: "Gracias", en: "Thanks" },
  /** HTML (sent with parse_mode HTML). */
  privacy: (userMessages: number, ttlHours: number) => ({
    ru: [
      userMessages
        ? `Помню последние ${userMessages} ${plural(userMessages, "твоё сообщение", "твоих сообщения", "твоих сообщений")} и удаляю их через ${ttlHours} ${plural(ttlHours, "час", "часа", "часов")}, без привязки к аккаунту.`
        : "Ничего не запоминаю.",
      "/mydata — посмотреть, /forget — стереть память.",
      "Работаю на ИИ-моделях Claude и OpenAI.",
      `<a href="${REPO}">Открытый код бота на GitHub</a>`,
    ].join("\n"),
    es: [
      userMessages
        ? `Recuerdo tus últimos ${userMessages} mensajes y los borro a las ${ttlHours} h, sin vincularlos a tu cuenta.`
        : "No guardo nada.",
      "/mydata — ver, /forget — borrar la memoria.",
      "Funciono con los modelos de IA Claude y OpenAI.",
      `<a href="${REPO}">Código abierto del bot en GitHub</a>`,
    ].join("\n"),
    en: [
      userMessages
        ? `I remember your last ${userMessages} messages and delete them after ${ttlHours} h, not linked to your account.`
        : "I do not remember anything.",
      "/mydata — see it, /forget — erase memory.",
      "Powered by Claude and OpenAI AI models.",
      `<a href="${REPO}">Open-source code on GitHub</a>`,
    ].join("\n"),
  }),
  myData: (count: number, ttlHours: number, list: string) => ({
    ru: count
      ? `Помню ${count} ${plural(count, "твоё сообщение", "твоих сообщения", "твоих сообщений")}. Каждое удаляю через ${ttlHours} ${plural(ttlHours, "час", "часа", "часов")}. /forget — стереть сейчас.\n\n${list}`
      : "О тебе у меня ничего не сохранено.",
    es: count
      ? `Recuerdo ${count} mensajes tuyos. Cada uno se borra a las ${ttlHours} h. /forget — borrar ya.\n\n${list}`
      : "No tengo nada guardado sobre ti.",
    en: count
      ? `I remember ${count} of your messages. Each is deleted after ${ttlHours} h. /forget — erase now.\n\n${list}`
      : "I have nothing stored about you.",
  }),
};

const REPO = "https://github.com/pavelminaev88/praise-bot";

/** Russian plural: 1 сообщение, 2 сообщения, 5 сообщений. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
