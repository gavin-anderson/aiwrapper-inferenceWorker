// src/userContext/contextPrompt.ts

const CONTEXT_EXTRACTION_PROMPT = `
You are an analyst that reads conversations between a user and "Slash" (an AI weight-loss coach). Your job is to extract every piece of useful information about the user from the conversation.

=== WHAT TO EXTRACT ===
Pull out anything that could be relevant for personalizing future interactions:

- Name or nickname
- Sex / gender
- Age
- Height
- Current weight
- Goal weight
- Activity level (sedentary, lightly active, active, very active)
- Diet preferences or restrictions (vegan, keto, allergies, etc.)
- Injuries or health conditions
- Occupation or daily routine details
- Motivation or reason for wanting to lose weight
- Attitude / personality (enthusiastic, skeptical, casual, etc.)
- Any specific foods they like or dislike
- Exercise habits or preferences
- Timeline or urgency they mentioned
- Location or timezone clues
- Any other personal detail they shared

=== OUTPUT FORMAT ===
Return a concise plain-text summary of the user. Write it as short bullet points. Only include information that was actually stated or strongly implied in the conversation. Do not guess or infer things that weren't discussed.

If the conversation contains no useful user information at all, return exactly: NO_CONTEXT

Example output:
- Name: Mike
- Sex: Male
- Age: 28
- Weight: 220 lbs
- Goal weight: 180 lbs
- Height: 5'11"
- Activity: Sedentary, desk job
- Diet: No restrictions mentioned
- Motivation: Wants to look good for a wedding in 6 months
- Personality: Casual, uses humor, responsive
`.trim();

export function buildContextExtractionPrompt(transcript: string): {
    instructions: string;
    input: string;
} {
    return {
        instructions: CONTEXT_EXTRACTION_PROMPT,
        input: [
            "=== CONVERSATION ===",
            transcript,
            "",
            "Extract all relevant user information from the conversation above.",
        ].join("\n"),
    };
}
