# Похвала — a Telegram praise bot

A small Telegram bot that gives short, specific, sincere praise. Write or send a voice message about what you did today, and it notices the effort. Add it to a group and tag it under a colleague's message to praise them.

Live bot: [@PohvalaChatBot](https://t.me/PohvalaChatBot) · Russian setup guide: [docs/SETUP.ru.md](docs/SETUP.ru.md)

- **Private chat:** text or voice (up to 10 min) → 3–4 sentences of praise.
- **Groups:** reacts only when tagged (`@PohvalaChatBot`), replied to, or on `/praise`. Tag it in a reply to someone's message to praise that person.
- **Memory:** last 20 messages of a private chat for 24 h, then deleted automatically. `/forget`, `/mydata`, `/privacy`.
- **Feedback:** 🔥😐👎 under each praise, counted anonymously. `/stats` for the owner.
- **Weekly check:** every Monday the bot tests itself (Telegram, storage, one real Claude reply) and sends the owner a report with weekly stats. `/selftest` runs it now.
- **Free hosting:** Cloudflare Workers Free plan. You pay only for the AI APIs.

## What it stores

| What | Where | How long |
|---|---|---|
| Last messages of a **private** chat | Workers KV, keyed by a hash of the chat ID | 24 h after the last message, then auto-deleted |
| Counters: date, mode, language, rating — no text, no IDs | D1 | until you delete them |
| Group messages | nowhere | — |

Jobs are encrypted before they are queued in Cloudflare Workflows, and logs contain only error types. Message text is processed by Claude (Anthropic) and voice by OpenAI; their API terms say data is not used for training and is deleted within 30 days.

## Deploy your own

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pavelminaev88/praise-bot)

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token. For groups: Bot Settings → Group Privacy → Turn off (so it sees @mentions).
2. Click the button above (or fork and import the repo in Cloudflare → Workers & Pages → Create application → Import a repository). KV, D1 and the Workflow are created automatically.
3. In the Worker: Settings → Variables and Secrets → add secrets:
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
   - `OPENAI_API_KEY` — optional, for voice messages
   - `ADMIN_TELEGRAM_ID` — optional, your Telegram user ID, enables `/stats`
4. Open `https://<your-worker>.workers.dev/setup` once. It connects the bot to Telegram.

### Settings

| Variable | Default | |
|---|---|---|
| `MODEL` | `claude-sonnet-5` | any Claude model, e.g. `claude-haiku-4-5-20251001` for lower cost |
| `TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | OpenAI transcription model |
| `MAX_VOICE_SECONDS` | `600` | longer voice messages are politely refused |
| `MEMORY_MESSAGES` | `20` | `0` turns memory off |
| `MEMORY_TTL_HOURS` | `24` | |

To change how the bot talks, edit [`src/prompt.ts`](src/prompt.ts).

## How it works

```
Telegram ──webhook──▶ Worker (src/index.ts)
                        ├─ commands, buttons ─▶ answered right away
                        └─ messages ─▶ Workflow (src/workflow.ts)
                                         download voice → OpenAI transcription
                                         memory (KV) → Claude → Telegram
                                         anonymous counter (D1)
```

Workflows remove the 30-second limit of a normal request, so long voice messages work on the Free plan.

## Develop

```bash
npm install
npm test          # unit tests
npm run e2e       # runs the Worker locally against fake Telegram/Claude/OpenAI APIs
npm run typecheck
```

## License

MIT
