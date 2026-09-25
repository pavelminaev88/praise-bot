# PRD — Похвала (@PohvalaChatBot)

## Problem
People rarely hear specific, sincere praise for small everyday efforts. A short, warm reply that notices *what exactly* someone did helps them keep going. In group chats, it is also a light way for colleagues and friends to celebrate each other.

The first version ran on n8n Cloud (~€29/month), which is too much for a small bot, kept conversation memory only in RAM, and logged full message texts with Telegram IDs to Google Sheets.

## Users
- **Private chat:** a person tells the bot what they did or how the day went, by text or voice.
- **Groups:** someone tags the bot (or replies to a colleague's message with the tag) to praise a person publicly.

## What the bot does
1. Private chat: text or voice (up to 10 min) → 3–4 sentence praise, or a gentle question (START), a short closing (CLOSING), or a safety reply (SAFETY).
2. Groups: reacts only to `@mention`, a reply to the bot, or `/praise`. When the tag is a reply to someone else's message, it praises that person for that message. Shorter, no private details in public.
3. Remembers the last 20 messages of a private chat for 24 h (auto-deleted), `/forget` deletes now, `/mydata` shows it.
4. 🔥😐👎 buttons under praise in private chats.
5. `/privacy` explains exactly what is stored. `/stats` for the owner only.

## Principles
- **Store almost nothing.** Private memory in KV with TTL. Anonymous counters in D1 (no texts, no IDs; user hash with a salt that is discarded after ~36 h). Jobs are encrypted before entering Workflows. Logs contain error kinds only.
- **Free to host.** Cloudflare Workers Free: Workers, KV, D1, Workflows. Only API usage (Anthropic, OpenAI) costs money.
- **Open source.** Anyone can read the code or deploy their own copy.

## Non-goals
Long-term memory, user profiles, analytics on message content, a web interface.

## Success
- Replies within ~10 s for text, voice works up to 10 min.
- 🔥 share of rated replies ≥ 70 %.
- €0 hosting.
