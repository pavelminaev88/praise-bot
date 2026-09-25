// Anonymous counters in D1. One row per bot reply: when, what kind, which mode, rating.
// No message texts, no chat or user IDs. `user_day` is a hash with a salt that lives in KV
// for ~36 hours and is then gone, so it can count people within a day but not follow anyone.

import { dailyUserHash, randomId } from "./crypto";
import { usd } from "./pricing";
import { plural } from "./texts";

let schemaReady = false;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY,
     ts TEXT NOT NULL,
     chat TEXT,
     input TEXT,
     mode TEXT,
     lang TEXT,
     rating TEXT,
     latency_ms INTEGER,
     error TEXT,
     user_day TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
];

// Columns added after the first release. ALTER fails if the column exists, which is fine.
const MIGRATIONS = [`ALTER TABLE events ADD COLUMN cost_usd REAL`, `ALTER TABLE events ADD COLUMN voice_sec INTEGER`];

export interface EventRow {
  chat: "private" | "group";
  input: "text" | "voice";
  mode?: string;
  lang?: string;
  latencyMs?: number;
  error?: string;
  /** Claude cost of this reply, USD. */
  costUsd?: number;
  /** Length of the voice message, seconds. */
  voiceSec?: number;
  userId: number;
}

export class Metrics {
  constructor(
    private db: D1Database,
    private kv: KVNamespace,
  ) {}

  private async ensureSchema() {
    if (schemaReady) return;
    await this.db.batch(SCHEMA.map((s) => this.db.prepare(s)));
    for (const m of MIGRATIONS) await this.db.prepare(m).run().catch(() => {});
    schemaReady = true;
  }

  private async dailySalt(): Promise<string> {
    const key = `salt:${new Date().toISOString().slice(0, 10)}`;
    let salt = await this.kv.get(key);
    if (!salt) {
      salt = randomId(24);
      await this.kv.put(key, salt, { expirationTtl: 36 * 3600 });
    }
    return salt;
  }

  /** Records an event and returns its ID (used by the rating buttons). */
  async record(row: EventRow, id = randomId()): Promise<string> {
    await this.ensureSchema();
    const userDay = await dailyUserHash(await this.dailySalt(), row.userId);
    await this.db
      .prepare(
        `INSERT INTO events (id, ts, chat, input, mode, lang, latency_ms, error, user_day, cost_usd, voice_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, new Date().toISOString(), row.chat, row.input, row.mode ?? null, row.lang ?? null, row.latencyMs ?? null, row.error ?? null, userDay, row.costUsd ?? null, row.voiceSec ?? null)
      .run();
    return id;
  }

  async rate(id: string, rating: string): Promise<void> {
    await this.ensureSchema();
    await this.db.prepare(`UPDATE events SET rating = ? WHERE id = ?`).bind(rating, id).run();
  }

  async report(days = 7): Promise<string> {
    await this.ensureSchema();
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { results } = await this.db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                COUNT(*) AS replies,
                COUNT(DISTINCT user_day) AS people,
                SUM(mode = 'PRAISE') AS praise,
                SUM(input = 'voice') AS voice,
                SUM(chat = 'group') AS grp,
                SUM(rating = 'good') AS good,
                SUM(rating = 'neutral') AS neutral,
                SUM(rating = 'bad') AS bad,
                SUM(error IS NOT NULL) AS errors,
                CAST(AVG(latency_ms) AS INTEGER) AS avg_ms
         FROM events WHERE ts >= ? GROUP BY day ORDER BY day DESC`,
      )
      .bind(since)
      .all<Record<string, number | string>>();
    if (!results.length) return `За ${days} дн. событий нет.`;
    const lines = results.map(
      (r) =>
        `${r.day}: ${r.replies} отв., ${r.people} чел., похвал ${r.praise}, голос ${r.voice}, группы ${r.grp} | 🔥${r.good} 😐${r.neutral} 👎${r.bad} | ошибок ${r.errors} | ~${Math.round(Number(r.avg_ms ?? 0) / 100) / 10} с`,
    );
    return [`Статистика за ${days} дн.:`, ...lines].join("\n");
  }

  /** Last 7 days vs the 7 days before. People are counted per day (hashes change daily), so we show a daily average. */
  async weekSummary(): Promise<string> {
    await this.ensureSchema();
    const now = Date.now();
    const iso = (d: number) => new Date(now - d * 86400_000).toISOString();
    const q = `SELECT COUNT(*) AS replies,
                      COUNT(DISTINCT user_day) AS person_days,
                      COUNT(DISTINCT substr(ts, 1, 10)) AS days,
                      SUM(mode = 'PRAISE') AS praise, SUM(input = 'voice') AS voice, SUM(chat = 'group') AS grp,
                      SUM(rating = 'good') AS good, SUM(rating = 'neutral') AS neutral, SUM(rating = 'bad') AS bad,
                      SUM(error IS NOT NULL) AS errors, CAST(AVG(latency_ms) AS INTEGER) AS avg_ms,
                      SUM(cost_usd) AS cost, SUM(voice_sec) AS voice_sec
               FROM events WHERE ts >= ? AND ts < ?`;
    const [cur, prev] = await Promise.all([
      this.db.prepare(q).bind(iso(7), iso(0)).first<Record<string, number>>(),
      this.db.prepare(q).bind(iso(14), iso(7)).first<Record<string, number>>(),
    ]);
    const n = (v: unknown) => Number(v ?? 0);
    const c = cur ?? {};
    const rated = n(c.good) + n(c.neutral) + n(c.bad);
    const fire = rated ? ` (🔥 ${Math.round((n(c.good) / rated) * 100)}%)` : "";
    const perDay = n(c.days) ? Math.round((n(c.person_days) / n(c.days)) * 10) / 10 : 0;
    return [
      `За 7 дней: ${n(c.replies)} ${plural(n(c.replies), "ответ", "ответа", "ответов")} (неделей раньше ${n(prev?.replies)}), в среднем ${perDay} чел. в день`,
      `Похвал ${n(c.praise)}, голосовых ${n(c.voice)}, в группах ${n(c.grp)}`,
      `Оценки: 🔥${n(c.good)} 😐${n(c.neutral)} 👎${n(c.bad)}${fire}`,
      `Ошибок ${n(c.errors)}, среднее время ответа ${(n(c.avg_ms) / 1000).toFixed(1).replace(".", ",")} с`,
      `Расходы: Claude ${usd(n(c.cost))}, голосовые ${Math.round(n(c.voice_sec) / 60)} мин`,
    ].join("\n");
  }
}
