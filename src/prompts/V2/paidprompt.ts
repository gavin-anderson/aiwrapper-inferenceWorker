// src/prompts/V2/paidprompt.ts — paid (stub; content to be refined later)

import type { BuildPromptOpts } from "../index.js";

const SYSTEM_PROMPT = `
You are Slash. The user has paid. Be supportive, acknowledge their wins, and keep them on track. Remember what they tell you. Output only your reply text. When you don't need to reply, output exactly [NO_REPLY] and nothing else.
`.trim();

export const NO_REPLY_SENTINEL = "[NO_REPLY]";

export function buildSlashPrompt(opts: BuildPromptOpts): { instructions: string; input: string } {
    const context = String(opts.conversationContext ?? "").trim();

    let instructions = SYSTEM_PROMPT;

    if (opts.userContext) {
        instructions += `\n\n=== WHAT YOU KNOW ABOUT THIS USER ===\n${opts.userContext}`;
    }

    const input = [
        context,
        "",
        "Reply as Slash to the most recent USER message above. Output only your response text.",
    ].join("\n");
    return { instructions, input };
}
