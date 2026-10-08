import Groq from "groq-sdk";
import { searchKnowledgeBase } from "./rag.service.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CONFIDENCE_DISTANCE_THRESHOLD = 0.65;

export interface AIResponse {
  answer: string;
  sources: string[];
  confidence: number;
  escalate: boolean;
}

export async function generateSupportAnswer(
  orgId: string,
  userQuestion: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<AIResponse> {
  const matches = await searchKnowledgeBase(orgId, userQuestion, 3);

  const bestMatch = matches[0];
  const hasConfidentMatch = bestMatch && bestMatch.distance < CONFIDENCE_DISTANCE_THRESHOLD;

  const contextText = matches
    .filter((m) => m.distance < CONFIDENCE_DISTANCE_THRESHOLD)
    .map((m) => `[Source: ${m.title}]\n${m.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `
You are OrbitDesk AI, an automated customer support specialist.
Rules:
- Answer the customer's question accurately using ONLY the context provided below.
- If the answer is not clearly present in the context, do NOT invent facts or pricing. Instead, respond with exactly: "ESCALATE_TO_HUMAN".
- Keep your tone polite, concise, and helpful.

Available Context:
${contextText || "NO_RELEVANT_CONTEXT_FOUND"}
  `.trim();

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.slice(-4),
      { role: "user", content: userQuestion },
    ],
  });

  const rawAnswer = completion.choices[0]?.message?.content || "";
  const needsEscalation = !hasConfidentMatch || rawAnswer.includes("ESCALATE_TO_HUMAN");

  const sources = matches
    .filter((m) => m.distance < CONFIDENCE_DISTANCE_THRESHOLD)
    .map((m) => m.title);

  return {
    answer: needsEscalation
      ? "I cannot find this information in our official documentation. Would you like me to connect you to a human agent?"
      : rawAnswer,
    sources: Array.from(new Set(sources)),
    confidence: bestMatch ? Math.max(0, 1 - bestMatch.distance) : 0,
    escalate: needsEscalation,
  };
}