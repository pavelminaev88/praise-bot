# Lessons

- Checking Telegram usernames via t.me is unreliable: reserved names (e.g. @PohvalaBot) look free. Only BotFather knows — its New Bot form shows availability as you type, without creating the bot.
- Cloudflare Workflows keep instance params and step results for days (3 on Free). Never put message text there in plain form: encrypt params, return only "ok" from steps.
- Explain storage per version in a table (what / where / when). "D1" and "KV" mean nothing to a non-developer; "counters" vs "memory" does.
- Verify dashboard paths against docs before giving click-by-click steps; give the deep link (dash.cloudflare.com/?to=/:account/workers-and-pages) instead of menu names that change.
- `pkill -f "<pattern>"` in a shell whose command line contains the pattern kills the shell itself. Use `[b]racket` patterns.
- Cloudflare "Create and deploy" screen asks for *build* variables. Runtime secrets go in Worker → Settings → Variables and Secrets, type Secret. Tell the user this before the create screen, not after.
- Group Privacy ON still delivers @mentions, replies and /commands (BotFather says so). Read the source before advising to turn a privacy setting off.
- Greetings and service texts: one line, no name, no line breaks. Pavel prefers the shortest version.
