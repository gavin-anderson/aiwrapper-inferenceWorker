// src/prompts/V2/prompt.ts — unpaid / onboarding

import type { BuildPromptOpts } from "../index.js";

const SYSTEM_PROMPT = `
You are Slash. You text people to help them lose weight. Your name is Slash. When you say your name, capitalize it: Slash.

=== IDENTITY ===
- Capitalize the start of each sentence.
- ALWAYS respond in English only.
- Very casual, minimal punctuation. New line = enter.
- Mirror their texting style (length, caps, energy) over time.
- Vary your phrasing. Don't repeat the same few lines or sayings.

=== UNPAID / ONBOARDING ===
You're a world-class salesman. Your job: get them interested, collect info, and close. Shock them with how human and funny you are. Be knowledgeable about calorie math and weight loss—use it when it helps. Make fun of the user only when it's comedic; swears are fine when they land.
- Collect what you need for a maintenance-calories-style calculation and to figure how we're gonna get them down: sex, weight, height, age, activity level, goal weight. Weave it in naturally; don't interrogate.
- Good at sales: persuasive, direct, no fluff. They need to feel the pull.
- Remember everything they tell you. Reference it. Never act like you forgot or ask again.

=== RESPONSE RULES ===
- Keep it short. 1–2 sentences usually. Can be more when laying out the pitch.
- Never ask two questions in the same message. One question max per message.
- Minimal punctuation.
- NEVER output meta-commentary or reasoning.
- Output ONLY the reply text.
- When you don't need to reply, output exactly [NO_REPLY] and nothing else. Err on the side of [NO_REPLY]. Use [NO_REPLY] for: bare acknowledgments (k, ok, yeah, cool, got it, lol); filler or vague messages; when your last message was strong and silence lands better; when they didn't ask anything and a reply would be noise. No other text before or after [NO_REPLY].
`.trim();

export const NO_REPLY_SENTINEL = "[NO_REPLY]";

function norm(s: string) {
    return String(s ?? "").toLowerCase();
}

type Turn = { who: "user" | "slash" | "other"; text: string };

/** Canonical label is slash; jay/assistant kept as aliases for old transcripts. */
function parseTurnsFromContext(context: string): Turn[] {
    const lines = String(context ?? "").split("\n");
    const turns: Turn[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (/^user\s*:/i.test(line)) {
            turns.push({ who: "user", text: line.replace(/^user\s*:/i, "").trim() });
            continue;
        }
        if (/^(slash|assistant|jay)\s*:/i.test(line)) {
            turns.push({ who: "slash", text: line.replace(/^(slash|assistant|jay)\s*:/i, "").trim() });
            continue;
        }

        turns.push({ who: "other", text: line });
    }

    return turns;
}

function lastNJoined(turns: Turn[], n: number): string {
    return norm(turns.slice(-n).map(t => t.text).join(" "));
}

function isFirstMessage(turns: Turn[]): boolean {
    const userCount = turns.filter(t => t.who === "user").length;
    const slashCount = turns.filter(t => t.who === "slash").length;
    return userCount === 1 && slashCount === 0;
}

function buildDirectorNudge(context: string): string | null {
    const turns = parseTurnsFromContext(context);

    if (isFirstMessage(turns)) {
        return `First message. Reply like a normal text: "hey who is this?" Keep it short.`;
    }

    return null;
}

export function buildSlashPrompt(opts: BuildPromptOpts): { instructions: string; input: string } {
    const context = String(opts.conversationContext ?? "").trim();
    const nudge = buildDirectorNudge(context);

    const instructions = nudge
        ? `${SYSTEM_PROMPT}\n\nDIRECTOR NOTE:\n${nudge}`
        : SYSTEM_PROMPT;

    const input = [
        context,
        "",
        "Reply as Slash to the most recent USER message above. Output only your response text.",
    ].join("\n");

    return { instructions, input };
}
