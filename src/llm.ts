// Calls Claude and gets a structured answer via a forced tool call.

import { SYSTEM_PROMPT } from "./prompt";
import type { Mode, Turn } from "./memory";
import type { ReplyJob } from "./routing";

export interface Answer {
  mode: Mode;
  answer: string;
  language: string;
}

const MODES: Mode[] = ["START", "PRAISE", "CLOSING", "SAFETY"];

const REPLY_TOOL = {
  name: "reply",
  description: "Send the reply to the user.",
  input_schema: {
    type: "object",
    properties: {
      MODE: { type: "string", enum: MODES },
      ANSWER: { type: "string", description: "Message to the user" },
      LANGUAGE: { type: "string", description: "ISO 639-1 code of the user's language, lower case" },
    },
    required: ["MODE", "ANSWER", "LANGUAGE"],
  },
};

/** Builds the text Claude sees for the current message: a short header plus the message. */
export function buildUserContent(job: ReplyJob, text: string, previousMode?: Mode): string {
  const tags = [`chat: ${job.chatKind}`];
  if (job.askedBy || job.note) {
    tags.push(`praise for: ${job.name}`);
    if (job.askedBy) tags.push(`asked by: ${job.askedBy}`);
  } else {
    tags.push(`name: ${job.name}`);
  }
  tags.push(`input: ${job.input.type === "voice" ? "voice transcript" : "text"}`);
  if (previousMode) tags.push(`previous mode: ${previousMode}`);

  const parts = [tags.map((t) => `[${t}]`).join(" ")];
  if (job.replyContext) parts.push(`(Replying to your earlier message: "${job.replyContext}")`);
  if (job.note) parts.push(`(Comment from ${job.askedBy ?? job.name}: "${job.note}")`);
  parts.push("", text);
  return parts.join("\n");
}

export function historyMessages(turns: Turn[]) {
  return turns.map((t) => ({ role: t.r === "u" ? ("user" as const) : ("assistant" as const), content: t.t }));
}

export async function askClaude(opts: {
  apiKey: string;
  apiBase: string;
  model: string;
  history: Turn[];
  userContent: string;
}): Promise<Answer> {
  const body = {
    model: opts.model,
    max_tokens: 700,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [REPLY_TOOL],
    tool_choice: { type: "tool", name: "reply" },
    messages: [...historyMessages(opts.history), { role: "user", content: opts.userContent }],
  };
  const res = await fetch(`${opts.apiBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
  const call = data.content?.find((c) => c.type === "tool_use" && c.name === "reply");
  return parseAnswer(call?.input);
}

export function parseAnswer(input: Record<string, unknown> | undefined): Answer {
  const answer = typeof input?.ANSWER === "string" ? input.ANSWER.trim() : "";
  if (!answer) throw new Error("Claude returned no answer");
  const rawMode = String(input?.MODE ?? "").toUpperCase() as Mode;
  const mode = MODES.includes(rawMode) ? rawMode : "PRAISE";
  const language = String(input?.LANGUAGE ?? "").toLowerCase().slice(0, 8);
  return { mode, answer, language };
}
