// src/prompts/index.ts

export type BuildPromptOpts = {
    conversationContext: string;
    hasPaid: boolean;
    userContext: string | null;
};

export type PromptModule = {
    buildSlashPrompt: (opts: BuildPromptOpts) => { instructions: string; input: string };
    NO_REPLY_SENTINEL: string;
};

const PROMPT_VERSION = process.env.PROMPT_VERSION ?? "V1";

const moduleCache: Record<string, PromptModule> = {};

function getCacheKey(hasPaid: boolean): string {
    if (PROMPT_VERSION === "V2") {
        return hasPaid ? "V2-paid" : "V2-unpaid";
    }
    return "V1";
}

async function loadPromptModule(hasPaid: boolean): Promise<PromptModule> {
    const key = getCacheKey(hasPaid);
    if (moduleCache[key]) return moduleCache[key];

    let path: string;
    if (PROMPT_VERSION === "V2") {
        path = hasPaid ? "./V2/paidprompt.js" : "./V2/prompt.js";
    } else {
        path = "./V1/prompt.js";
    }

    try {
        const mod = await import(path);
        moduleCache[key] = mod as PromptModule;
        return moduleCache[key];
    } catch (err) {
        throw new Error(`Failed to load prompt "${key}" (${path}): ${err}`);
    }
}

export async function buildSlashPrompt(opts: BuildPromptOpts): Promise<{ instructions: string; input: string }> {
    const mod = await loadPromptModule(opts.hasPaid);
    return mod.buildSlashPrompt(opts);
}

export async function getNoReplySentinel(hasPaid: boolean = false): Promise<string> {
    const mod = await loadPromptModule(hasPaid);
    return mod.NO_REPLY_SENTINEL;
}

/** Returns the prompt version string to store in outbound_messages (e.g. V1, V2-unpaid, V2-paid). */
export function getPromptVersion(hasPaid: boolean): string {
    if (PROMPT_VERSION === "V2") {
        return hasPaid ? "V2-paid" : "V2-unpaid";
    }
    return "V1";
}
