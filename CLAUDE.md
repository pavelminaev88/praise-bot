# praise-bot — context for Claude

Telegram praise bot «Похвала» (@PohvalaChatBot). Owner: Pavel. Replaces the n8n workflow «ПохвалаБот LIVE».

## Stack
Cloudflare Workers (Free plan) + Workflows + KV (memory) + D1 (anonymous counters). TypeScript, no frameworks, plain fetch to Telegram / Anthropic / OpenAI.

## Map
- `src/index.ts` — webhook, /setup, dispatch
- `src/routing.ts` — pure: update → action (private/group rules). Most logic tests live here.
- `src/workflow.ts`, `src/reply.ts` — the reply job (transcribe → memory → Claude → send → count)
- `src/prompt.ts` — system prompt. Mode names START/PRAISE/CLOSING/SAFETY are used by code.
- `src/memory.ts` (KV), `src/metrics.ts` (D1), `src/crypto.ts`, `src/texts.ts` (fixed RU/ES/EN messages)
- `docs/PRD.md`, `tasks/todo.md`, `tasks/lessons.md`, `CHANGELOG.md`

## Rules
- Privacy is a product promise: never log message text, never store texts outside KV memory, never put plain text into Workflow params or step results. Update `/privacy` text and README table if storage changes.
- Free plan limits: 10 ms CPU per invocation, 50 outgoing requests per invocation, KV 1,000 writes/day, D1 100k writes/day.
- After changes: `npm test`, `npm run typecheck`, `npm run e2e`. Update CHANGELOG and todo.
- Talk to Pavel in Russian, plain words, no jargon without explanation.
