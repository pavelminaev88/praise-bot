# Changelog

## 1.0.1 — 2026-09-25
- Health check names the missing secret; `/robots.txt`.
- No link previews in bot messages (the GitHub card under /privacy was noisy).

## 1.0.0 — 2026-09-25
First version on Cloudflare, replacing the n8n workflow.

**Same as in n8n:** system prompt and its four modes, voice messages, 🔥😐👎 buttons.

**New**
- Runs on Cloudflare Workers Free instead of n8n Cloud.
- Group chats: @mention, reply to the bot, `/praise`; tag under someone's message to praise them.
- Voice up to 10 min (Workflows, no 30 s request limit); video notes too; "listening" note for voice over 1 min.
- Memory: last 20 messages of a private chat for 24 h (was: RAM, lost on restarts, keyed by user not chat).
- `/privacy`, `/mydata`, `/forget`, `/stats` (owner only).
- Retries on API hiccups; a clear message instead of silence if replying fails.

**Privacy**
- No more Google Sheets log of full texts with Telegram IDs. Counters only: date, mode, language, rating, latency.
- Jobs encrypted before entering Workflows; logs contain error types only.

**Fixed from n8n version**
- The user's name was never passed to the model — now it is.
- Rating buttons were matched by user ID on write but chat ID on update — ratings in groups would be lost. Now each reply has its own ID.
- A second model (gpt-4.1-mini) repaired JSON after Claude; replaced by a forced tool call — one call instead of two.
- Mode names had mixed case (`mode` / `MODE`); language codes were upper case and Catalan was `CAT` (ISO 639-1: `ca`).

**Prompt changes**
- Removed JSON-format lines (output now goes through a tool).
- Added: how to read the message header, a GROUP CHATS section, crisis numbers in SAFETY (112 in the EU, 024 in Spain).
