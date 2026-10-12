import { askClaude } from "./llm.js";
import type { TaskSpec } from "./types.js";

export interface Turn {
  role: "customer" | "agent";
  text: string;
}

export const END = "[END]";

const PROMPT = (persona: string, turns: Turn[]) => `You play a customer in a support chat, to test a support agent. Stay in character.

Who you are and what you know:
${persona.trim()}

Rules:
- Answer the agent's last message the way this person would: short, natural, in the language of the chat.
- Only give facts from the description above. If asked for something you don't know, say so.
- Answer what the agent asked (confirm, choose, provide data). Don't volunteer new requests.
- If your request has been handled, or the agent only said goodbye or has nothing left to ask, reply with exactly ${END}.

Chat so far:
${turns.map((t) => `${t.role === "customer" ? "CUSTOMER" : "AGENT"}: ${t.text.trim()}`).join("\n\n")}

Your next message (or ${END}):`;

/** The simulated customer's next message, or null when the conversation is over. */
export async function customerReply(task: TaskSpec, turns: Turn[], opts: { model: string; isolate: boolean }): Promise<string | null> {
  if (!task.customer) return null;
  const reply = (await askClaude(PROMPT(task.customer.persona, turns), { ...opts, timeoutSec: 120 })).trim();
  return !reply || reply.includes(END) ? null : reply;
}
