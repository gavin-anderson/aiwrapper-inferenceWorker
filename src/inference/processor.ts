// src/inference/processor.ts
import { pool } from "../db/pool.js";
import type { InferenceJob } from "./types.js";
import { callModel, type CallModelOpts } from "./model.js";
import { getNoReplySentinel, getPromptVersion } from "../prompts/index.js";
import { insertOutboundMessage, loadConversation, loadInboundMessage, markJobsSucceeded, loadTranscriptForConversation } from "./queries.js";
import { CONFIG } from "./config.js";
import { shouldExtractContext, getUserContext } from "../userContext/getContext.js";

export async function runInference(jobs: InferenceJob[]): Promise<{
    inboundProviderSid: string;
    insertedOutboundIds: string[];
    noReply: boolean;
}> {
    // Use the last job (most recent) for outbound linking
    const lastJob = jobs[jobs.length - 1];

    // --- READ PHASE (short) ---
    const client1 = await pool.connect();
    let inbound: Awaited<ReturnType<typeof loadInboundMessage>>;
    let conversationContext: string;
    let conversation: Awaited<ReturnType<typeof loadConversation>>;

    try {
        inbound = await loadInboundMessage(client1, lastJob.id);
        conversationContext = await loadTranscriptForConversation(client1, lastJob.conversation_id);
        conversation = await loadConversation(client1, lastJob.conversation_id);
    } finally {
        client1.release();
    }

    // --- MODEL PHASE ---
    const modelOpts: CallModelOpts = {
        conversationId: lastJob.conversation_id,
        inboundProviderSid: inbound.provider_message_sid,
        timeoutMs: CONFIG.MODEL_TIMEOUT_MS,
        conversationContext,
        hasPaid: conversation.has_paid,
    };
    const { reply: replyText, model } = await callModel(modelOpts);

    // --- WRITE PHASE (transaction) ---
    const noReplySentinel = await getNoReplySentinel(conversation.has_paid);
    const prompt_version = getPromptVersion(conversation.has_paid);
    const noReply = replyText.trim() === noReplySentinel;
    const jobIds = jobs.map(j => j.id);

    const client2 = await pool.connect();
    try {
        await client2.query("BEGIN");

        const insertedOutboundIds: string[] = [];
        if (!noReply) {
            // Split on tab or newline(s)
            const segments = replyText
                .split(/\t|\n+/)
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (let i = 0; i < segments.length; i++) {
                const id = await insertOutboundMessage(client2, {
                    conversationId: lastJob.conversation_id,
                    inboundMessageId: inbound.id,
                    provider: inbound.provider,
                    toAddress: inbound.from_address,
                    fromAddress: inbound.to_address,
                    body: segments[i],
                    provider_inbound_sid: inbound.provider_message_sid,
                    sequenceNumber: i,
                    prompt_version,
                    model,
                });
                if (id) insertedOutboundIds.push(id);
            }
        }

        await markJobsSucceeded(client2, jobIds);
        await client2.query("COMMIT");

        // Fire-and-forget: extract user context every 30 inbound messages
        shouldExtractContext(lastJob.conversation_id, jobs.length)
            .then((should) => {
                if (should) return getUserContext(lastJob.conversation_id);
            })
            .catch((err) => {
                console.warn(
                    `[user-context] Failed for conversation=${lastJob.conversation_id}:`,
                    err?.message || err
                );
            });

        return { inboundProviderSid: inbound.provider_message_sid, insertedOutboundIds, noReply };
    } catch (e) {
        await client2.query("ROLLBACK");
        throw e;
    } finally {
        client2.release();
    }
}
