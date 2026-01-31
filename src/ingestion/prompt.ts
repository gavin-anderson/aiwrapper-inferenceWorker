// src/ingestion/prompt.ts

type BuildJayPromptOpts = {
    conversationContext: string;
};

const SYSTEM_PROMPT = `
You are Jay, an elite personal trainer texting a client.

Your name is Jay. Always refer to yourself as Jay.

=== CORE STYLE ===
- ALWAYS respond in English only
- 1-2 sentences, prefer 1 unless you truly need 2
- Very casual, minimal punctuation If you want to start a new line use an enter
- Over time, mirror the user's texting style (length, capitalization, punctuation, energy)
- Direct, supportive, no fluff
- You crave efficiency - vague answers waste everyone's time
- Think like the best trainer in the world: strategic, perceptive, motivating without being pushy

=== PHASE 1: INITIAL ASSESSMENT ===
Your first goal is to learn about the client efficiently.

Key information to gather:
- Name (what should I call you?)
- Where they got the number (how did you find me? referral, social media, etc.)
- Height and weight (specific numbers)
- Current lifestyle (activity level, job, schedule)
- Food habits (what they eat, when, cooking vs eating out)
- Fitness goals (what they want to achieve, why, timeline)
- Obstacles (time, motivation, knowledge, injuries, etc.)
- Past experience with fitness
- Preferences (what they like/dislike doing)

=== YOUR INTRODUCTION ===
After getting their name and where they got your number:
- Brief intro about credentials + experience
- Mention you’ve trained elite athletes and regular people
- If asked about elite athletes, mention Bogdan Djerkovic (Professional Waterpolo player)
- Keep it brief, then ask about their goals

=== RESPONSE RULES ===
- Keep it to 2 sentences max
- Minimal punctuation
- NEVER output meta-commentary or reasoning
- Output ONLY the reply text
`.trim();

function norm(s: string) {
    return String(s ?? "").toLowerCase();
}

type Turn = { who: "user" | "jay" | "other"; text: string };

function parseTurnsFromContext(context: string): Turn[] {
    // expects lines like:
    // USER: hi
    // JAY: hey this is jay...
    const lines = String(context ?? "").split("\n");
    const turns: Turn[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (/^user\s*:/i.test(line)) {
            turns.push({ who: "user", text: line.replace(/^user\s*:/i, "").trim() });
            continue;
        }
        if (/^(jay|assistant)\s*:/i.test(line)) {
            turns.push({ who: "jay", text: line.replace(/^(jay|assistant)\s*:/i, "").trim() });
            continue;
        }

        // anything else: keep but mark other
        turns.push({ who: "other", text: line });
    }

    return turns;
}

function lastNJoined(turns: Turn[], n: number): string {
    return norm(turns.slice(-n).map(t => t.text).join(" "));
}

function isFirstMessage(turns: Turn[]): boolean {
    const userCount = turns.filter(t => t.who === "user").length;
    const jayCount = turns.filter(t => t.who === "jay").length;
    return userCount === 1 && jayCount === 0;
}

function hasGivenIntroduction(turns: Turn[]): boolean {
    const jayText = norm(turns.filter(t => t.who === "jay").map(t => t.text).join(" "));
    return (
        jayText.includes("i've trained") ||
        jayText.includes("i have trained") ||
        jayText.includes("my experience") ||
        jayText.includes("my background") ||
        jayText.includes("credentials") ||
        jayText.includes("bogdan djerkovic") ||
        jayText.includes("professional waterpolo")
    );
}

function assessmentComplete(turns: Turn[]): boolean {
    // Port your CLI hasBasics check
    const recent = lastNJoined(turns, 10);

    const hasName =
        recent.includes("my name is") ||
        recent.includes("call me") ||
        recent.includes("i'm") ||
        recent.includes("im ");

    const hasSource =
        recent.includes("number") ||
        recent.includes("got this") ||
        recent.includes("got your number") ||
        recent.includes("found") ||
        recent.includes("referral") ||
        recent.includes("instagram") ||
        recent.includes("social") ||
        recent.includes("heard about") ||
        recent.includes("from a friend");

    const hasBody =
        recent.includes("height") ||
        recent.includes("weight") ||
        /\b\d+\s*(lb|lbs|kg)\b/.test(recent);

    const hasGoal =
        recent.includes("goal") ||
        recent.includes("want") ||
        recent.includes("trying");

    const hasTraining =
        recent.includes("workout") ||
        recent.includes("exercise") ||
        recent.includes("gym") ||
        recent.includes("train");

    return hasName && hasSource && hasBody && hasGoal && hasTraining;
}

function shouldNudgeIntro(turns: Turn[]): boolean {
    if (assessmentComplete(turns)) return false;
    if (hasGivenIntroduction(turns)) return false;

    const recent = lastNJoined(turns, 10);

    const hasNameCheck =
        recent.includes("name") ||
        recent.includes("call me") ||
        recent.includes("i'm") ||
        recent.includes("im ") ||
        /\bmy name is\b/i.test(recent);

    const hasContactCheck =
        recent.includes("number") ||
        recent.includes("got this") ||
        recent.includes("got your number") ||
        recent.includes("found") ||
        recent.includes("referral") ||
        recent.includes("instagram") ||
        recent.includes("social") ||
        recent.includes("heard about");

    return hasNameCheck && hasContactCheck;
}

function buildDirectorNudge(context: string): string | null {
    const turns = parseTurnsFromContext(context);

    if (isFirstMessage(turns)) {
        return `This is the user's first message. Respond naturally like a normal human text: "Hey this is Jay, who am I speaking with?" Keep it short.`;
    }

    if (shouldNudgeIntro(turns)) {
        return `You now have their name and where they got your number. Give a brief introduction about yourself - your credentials, that you've trained elite athletes and regular people. Keep it brief, then transition to asking about their fitness goals.`;
    }

    return null;
}

export function buildJayPrompt(opts: BuildJayPromptOpts): { instructions: string; input: string } {
    const context = String(opts.conversationContext ?? "").trim();
    const nudge = buildDirectorNudge(context);

    const instructions = nudge
        ? `${SYSTEM_PROMPT}\n\nDIRECTOR NOTE:\n${nudge}`
        : SYSTEM_PROMPT;

    // input is your transcript; we rely on USER/JAY labels for clarity
    const input = [
        context,
        "",
        "Reply as Jay to the most recent USER message above. Output only your response text.",
    ].join("\n");

    return { instructions, input };
}
