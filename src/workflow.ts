import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { open } from "./crypto";
import type { Env } from "./env";
import { errorName, handleFailure, handleReply } from "./reply";
import type { ReplyJob } from "./routing";
import { Telegram } from "./telegram";
import { pickLang, T } from "./texts";
import { settings } from "./env";

export interface ReplyParams {
  /** Encrypted ReplyJob (see crypto.seal). Workflows store params for days, so they never see plain text. */
  sealed: string;
}

/** Voice messages longer than this get a short "listening" note first. */
const LONG_VOICE_SECONDS = 60;

export class ReplyWorkflow extends WorkflowEntrypoint<Env, ReplyParams> {
  async run(event: WorkflowEvent<ReplyParams>, step: WorkflowStep) {
    const job = await open<ReplyJob>(this.env.TELEGRAM_BOT_TOKEN, event.payload.sealed);

    if (job.input.type === "voice" && job.input.duration > LONG_VOICE_SECONDS) {
      await step.do("listening note", { retries: { limit: 1, delay: "2 seconds" } }, async () => {
        const tg = new Telegram(this.env.TELEGRAM_BOT_TOKEN, settings(this.env).telegramApi);
        await tg.sendMessage(job.chatId, T.listening[pickLang(job.userLang)], {
          replyTo: job.chatKind === "group" ? job.replyTo : undefined,
        });
        return "ok";
      });
    }

    try {
      // One step does transcription, Claude and sending, and returns nothing but "ok",
      // so no message text ends up in the stored step results.
      await step.do(
        "reply",
        { retries: { limit: 2, delay: "3 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        async () => {
          await handleReply(this.env, job);
          return "ok";
        },
      );
    } catch (e) {
      console.error("reply failed after retries:", errorName(e));
      await step.do("tell user", async () => {
        await handleFailure(this.env, job, e);
        return "ok";
      });
    }
  }
}
