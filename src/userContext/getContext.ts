// src/userContext/getContext.ts

import { pool } from "../db/pool.js";
import { getOpenAIClient } from "../clients/openaiClient.js";
import { withRetry } from "../utils/retry.js";
import { buildContextExtractionPrompt } from "./contextPrompt.js";
import type { ConversationRow, InboundMessageRow, OutboundMessageRow, TimelineRow } from "../inference/types.js";

const CONTEXT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5";
const CONTEXT_TIMEOUT_MS = 30_000;

/**
 * Load the full conversation transcript directly (not reusing inference queries).
 */
async function loadTranscript(conversationId: string): Promise<string> {
    const client = await pool.connect();
    try {
        const convoRes = await client.query<ConversationRow>(
            `SELECT id, channel, user_number, has_paid
             FROM conversations
             WHERE id = $1`,
            [conversationId]
        );
        const convo = convoRes.rows[0];
        if (!convo) throw new Error(`Conversation not found: ${conversationId}`);

        const inboundRes = await client.query<InboundMessageRow & { received_at: string }>(
            `SELECT id, conversation_id, body, from_address, to_address, provider, received_at
             FROM inbound_messages
             WHERE conversation_id = $1
               AND from_address = $2
             ORDER BY received_at ASC`,
            [conversationId, convo.user_number]
        );

        const outboundRes = await client.query<OutboundMessageRow>(
            `SELECT id, conversation_id, body, from_address, to_address, provider, created_at
             FROM outbound_messages
             WHERE conversation_id = $1
               AND to_address = $2
               AND status IN ('sent', 'sending')
             ORDER BY created_at ASC`,
            [conversationId, convo.user_number]
        );

        const timeline: TimelineRow[] = [
            ...inboundRes.rows.map((m) => ({
                direction: "inbound" as const,
                body: m.body,
                from_address: m.from_address,
                to_address: m.to_address,
                provider: m.provider,
                ts: (m as any).received_at,
            })),
            ...outboundRes.rows.map((m) => ({
                direction: "outbound" as const,
                body: m.body,
                from_address: m.from_address,
                to_address: m.to_address,
                provider: m.provider,
                ts: m.created_at,
            })),
        ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

        return timeline
            .map((r) => {
                const who = r.direction === "inbound" ? "USER" : "SLASH";
                return `${who}: ${r.body}`;
            })
            .join("\n");
    } finally {
        client.release();
    }
}

/**
 * Call OpenAI to extract user context from the transcript.
 */
async function extractContext(transcript: string): Promise<string | null> {
    const openai = getOpenAIClient();
    const { instructions, input } = buildContextExtractionPrompt(transcript);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);

    try {
        const response = await withRetry(
            () =>
                openai.responses.create(
                    {
                        model: CONTEXT_MODEL,
                        instructions,
                        input,
                    },
                    { signal: controller.signal }
                ),
            { retries: 3, baseDelayMs: 300, maxDelayMs: 3000 }
        );

        const text = response?.output_text?.trim();
        if (!text || text === "NO_CONTEXT") return null;
        return text;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Save the extracted context to the conversations table.
 */
async function saveContext(conversationId: string, context: string): Promise<void> {
    await pool.query(
        `UPDATE conversations
         SET user_context = $2,
             updated_at = now()
         WHERE id = $1`,
        [conversationId, context]
    );
}

const CONTEXT_INTERVAL = 30;

/**
 * Check if we should run context extraction based on inbound message count.
 * Detects whether the batch crossed a 30-message boundary, so even if we
 * claim messages 60+61 together (count=61, batchSize=2), we see that the
 * range (59, 61] contains 60 and still trigger.
 */
export async function shouldExtractContext(conversationId: string, batchSize: number): Promise<boolean> {
    const res = await pool.query<{ cnt: string }>(
        `SELECT count(*)::text AS cnt
         FROM inbound_messages
         WHERE conversation_id = $1`,
        [conversationId]
    );
    const count = parseInt(res.rows[0]?.cnt ?? "0", 10);
    if (count <= 0) return false;
    const prev = count - batchSize;
    return Math.floor(count / CONTEXT_INTERVAL) > Math.floor(prev / CONTEXT_INTERVAL);
}

/**
 * Main entry point: load transcript, extract user context via OpenAI, store it.
 * Returns the extracted context string, or null if nothing useful was found.
 */
export async function getUserContext(conversationId: string): Promise<string | null> {
    const transcript = await loadTranscript(conversationId);
    if (!transcript.trim()) {
        console.log(`[user-context] No transcript for conversation=${conversationId}, skipping.`);
        return null;
    }

    console.log(`[user-context] Extracting context for conversation=${conversationId}`);
    const context = await extractContext(transcript);

    if (context) {
        await saveContext(conversationId, context);
        console.log(`[user-context] Saved context for conversation=${conversationId}`);
    } else {
        console.log(`[user-context] No useful context found for conversation=${conversationId}`);
    }

    return context;
}
