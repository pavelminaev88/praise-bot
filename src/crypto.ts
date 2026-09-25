// Small crypto helpers. All keys are derived from the bot token, so there is nothing extra to configure.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Secret Telegram sends back in the X-Telegram-Bot-Api-Secret-Token header. */
export async function webhookSecret(botToken: string): Promise<string> {
  return hex(await sha256(`webhook:${botToken}`)).slice(0, 48);
}

/** Stable, non-reversible key for a chat (used as the memory key instead of the raw chat ID). */
export async function chatKey(botToken: string, chatId: number): Promise<string> {
  return hex(await sha256(`chat:${botToken}:${chatId}`)).slice(0, 32);
}

/** Hash of a user ID with a salt that is thrown away after a day. Good for counting, not for tracking. */
export async function dailyUserHash(salt: string, userId: number): Promise<string> {
  return hex(await sha256(`user:${salt}:${userId}`)).slice(0, 16);
}

export function randomId(bytes = 9): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function aesKey(botToken: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", await sha256(`payload:${botToken}`), "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Encrypts a job before it is handed to Cloudflare Workflows.
 * Workflows keep instance parameters for a few days; this way they only ever see ciphertext.
 */
export async function seal(botToken: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(botToken), enc.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function open<T>(botToken: string, sealed: string): Promise<T> {
  const [iv, data] = sealed.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(botToken), unb64(data));
  return JSON.parse(dec.decode(plain)) as T;
}
