# Todo

## v1 — core (done)
- [x] Cloudflare Worker + webhook with secret header
- [x] Private chat: text → praise (prompt from n8n kept as is, technical fixes only)
- [x] Voice / video notes via OpenAI transcription, up to 10 min, via Workflows (no 30 s limit)
- [x] Groups: @mention, reply to bot, /praise; praise the author of a replied message
- [x] Nothing stored; jobs encrypted before Workflows; logs without message text

## v1.1 — feedback (done)
- [x] 🔥😐👎 buttons (private chat, PRAISE only)
- [x] Anonymous counters in D1, daily-salted user hash
- [x] /stats for the owner (ADMIN_TELEGRAM_ID)

## v2 — memory (done)
- [x] KV memory for private chats: last 20 messages, 24 h TTL
- [x] /forget, /mydata, /privacy

## Next
- [x] Deploy to Cloudflare, set secrets, open /setup
- [x] Live test in private chat (2026-09-25): text RU/ES, memory, 🔥 button, /start, /stats, /mydata, /privacy, /forget — all OK, ~2.8 s per reply
- [ ] Live test: voice message, group chat
- [ ] Check real latency and CPU time in Cloudflare logs (Free plan: 10 ms CPU per invocation)
- [ ] **Simplify the prompt** for current models: fewer rules, same behaviour; compare old vs new on 20 real-style messages
- [ ] Decide on the old n8n bot: switch off or point it to this code
- [ ] Group privacy mode: confirm @mentions arrive with Group Privacy off
- [ ] Move KidTales off n8n with the same stack

## Review (2026-09-25)
- 33 unit tests, 18 end-to-end tests (local Worker + KV + D1 + Workflows against mock APIs) pass.
- Live: Telegram + Anthropic (`claude-sonnet-5`, forced tool call) verified. OpenAI transcription and groups not yet tested live.
