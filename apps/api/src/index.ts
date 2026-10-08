import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import { pipeline } from "@xenova/transformers";
import { pipeline, env } from "@xenova/transformers";

// Tell Transformers to cache in /tmp because Vercel allows writes only in /tmp
env.cacheDir = "/tmp/.cache";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// In-Memory Workspace & AI Persona Settings
let workspaceSettings = {
  botName: "OrbitDesk AI",
  tone: "Professional & Concise", // "Professional & Concise" | "Warm & Friendly" | "Strict Technical"
  customInstructions: "Prioritize official policy docs and be helpful.",
  webhookUrl: process.env.WEBHOOK_URL || "",
};

// 1. Embedder Singleton (Cached locally)
let embedder: any = null;
async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

// 2. Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "OrbitDesk API" });
});

// 3. POST /api/chat: Grounded RAG with Dynamic Persona
app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    const org = await prisma.organization.findFirst();
    if (!org) {
      return res.status(400).json({ error: "No organization found." });
    }

    let convId = conversationId;
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id },
      });
      convId = conv.id;
    }

    const qVector = await getEmbedding(message);

    const matches = (await prisma.$queryRaw`
      SELECT d.title, c.content, (c.embedding <=> ${JSON.stringify(qVector)}::vector) AS distance
      FROM "DocumentChunk" c
      JOIN "Document" d ON c."documentId" = d.id
      WHERE d."organizationId" = ${org.id}
      ORDER BY distance ASC
      LIMIT 2;
    `) as Array<{ title: string; content: string; distance: number }>;

    const bestMatch = matches[0];
    const isConfident = bestMatch && bestMatch.distance < 0.65;

    const context = matches
      .filter((m) => m.distance < 0.65)
      .map((m) => `[Source: ${m.title}]\n${m.content}`)
      .join("\n---\n");

    // Dynamic prompt using admin settings
    const systemPrompt = `
You are ${workspaceSettings.botName}, an automated customer support specialist.
Tone: ${workspaceSettings.tone}.
Custom Admin Rule: ${workspaceSettings.customInstructions}

Rules:
- Answer using ONLY the official context below.
- If the answer is unknown, respond with exactly "ESCALATE_TO_HUMAN".
- Do not fabricate pricing or policies.

Context:
${context || "NO_RELEVANT_CONTEXT"}
    `.trim();

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    const rawAnswer = completion.choices[0]?.message?.content || "";
    const shouldEscalate = !isConfident || rawAnswer.includes("ESCALATE_TO_HUMAN");

    const finalAnswer = shouldEscalate
      ? `I couldn't verify documentation for that. I can connect you with our human team right away.`
      : rawAnswer;

    const sources = matches.filter((m) => m.distance < 0.65).map((m) => m.title);

    await prisma.message.createMany({
      data: [
        { conversationId: convId, role: "user", content: message },
        {
          conversationId: convId,
          role: "assistant",
          content: finalAnswer,
          sources: Array.from(new Set(sources)),
        },
      ],
    });

    res.json({
      conversationId: convId,
      answer: finalAnswer,
      sources: Array.from(new Set(sources)),
      confidence: bestMatch ? Math.max(0, 1 - bestMatch.distance) : 0,
      escalate: shouldEscalate,
    });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// 4. POST /api/escalate: Outbound Webhook for n8n / Discord / Slack
app.post("/api/escalate", async (req, res) => {
  try {
    const { conversationId, name, email, company, question } = req.body;

    const org = await prisma.organization.findFirst();
    if (!org) return res.status(400).json({ error: "No organization found" });

    const customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name,
        email,
        company,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { customerId: customer.id, status: "escalated" },
    });

    const ticket = await prisma.ticket.upsert({
      where: { conversationId },
      update: { status: "OPEN" },
      create: {
        conversationId,
        priority: "normal",
        status: "OPEN",
      },
    });

    const webhookPayload = {
      event: "ticket.escalated",
      ticketId: ticket.id,
      customer: { name, email, company },
      question,
      conversationId,
      timestamp: new Date().toISOString(),
    };

    console.log(`🚨 Support Ticket Active! ID: #${ticket.id} for ${name} (${email})`);

    // Fire webhook if configured in UI settings or .env
    const targetWebhook = workspaceSettings.webhookUrl || process.env.WEBHOOK_URL;
    if (targetWebhook) {
      console.log(`📡 Dispatching Webhook to: ${targetWebhook}`);
      fetch(targetWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      }).catch((err) => console.error("Webhook dispatch failed:", err.message));
    }

    res.json({
      success: true,
      ticketId: ticket.id,
      webhookDispatched: !!targetWebhook,
      message: "Ticket created. A human agent will contact you.",
    });
  } catch (error) {
    console.error("Escalation Error:", error);
    res.status(500).json({ error: "Failed to escalate ticket" });
  }
});

// 5. GET /api/tickets: List tickets
app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        conversation: {
          include: {
            customer: true,
            messages: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    res.json(tickets);
  } catch (error) {
    console.error("Fetch Tickets Error:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// 6. PATCH /api/tickets/:id: Resolve ticket
app.patch("/api/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await prisma.ticket.update({
      where: { id },
      data: { status },
    });
    res.json(updated);
  } catch (error) {
    console.error("Update Ticket Error:", error);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// 7. GET /api/documents: List knowledge docs
app.get("/api/documents", async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
    });
    res.json(docs);
  } catch (error) {
    console.error("Fetch Docs Error:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// 8. POST /api/documents: Index document
app.post("/api/documents", async (req, res) => {
  try {
    const { title, content } = req.body;
    const org = await prisma.organization.findFirst();
    if (!org) return res.status(400).json({ error: "No organization found" });

    const doc = await prisma.document.create({
      data: { organizationId: org.id, title, content },
    });

    const chunks = chunkText(content);
    for (const chunk of chunks) {
      const vector = await getEmbedding(chunk);
      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
        VALUES (
          gen_random_uuid(),
          ${doc.id},
          ${chunk},
          ${JSON.stringify(vector)}::vector
        );
      `;
    }

    res.json({ success: true, document: doc, chunkCount: chunks.length });
  } catch (error) {
    console.error("Index Doc Error:", error);
    res.status(500).json({ error: "Failed to index document" });
  }
});

// 9. GET /api/analytics: Telemetry metrics
app.get("/api/analytics", async (req, res) => {
  try {
    const totalConversations = await prisma.conversation.count();
    const totalTickets = await prisma.ticket.count();
    const openTickets = await prisma.ticket.count({ where: { status: "OPEN" } });
    const resolvedTickets = await prisma.ticket.count({ where: { status: "RESOLVED" } });
    const totalDocs = await prisma.document.count();
    const totalChunks = await prisma.documentChunk.count();

    const aiResolved = Math.max(0, totalConversations - totalTickets);
    const aiResolutionRate = totalConversations > 0 ? Math.round((aiResolved / totalConversations) * 100) : 100;
    const escalationRate = totalConversations > 0 ? Math.round((totalTickets / totalConversations) * 100) : 0;

    const recentConversations = await prisma.conversation.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        _count: { select: { messages: true } },
        ticket: { select: { status: true } },
      },
    });

    res.json({
      overview: {
        totalConversations,
        aiResolved,
        aiResolutionRate,
        totalTickets,
        openTickets,
        resolvedTickets,
        escalationRate,
        totalDocs,
        totalChunks,
      },
      recentConversations,
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// 10. POST /api/tickets/:id/reply: Agent reply
app.post("/api/tickets/:id/reply", async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { conversation: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const newMsg = await prisma.message.create({
      data: {
        conversationId: ticket.conversationId,
        role: "assistant",
        content: `[Human Agent]: ${message}`,
      },
    });

    await prisma.ticket.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });

    res.json({ success: true, message: newMsg });
  } catch (error) {
    console.error("Agent Reply Error:", error);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// 11. GET /api/settings: Get current settings
app.get("/api/settings", (req, res) => {
  res.json(workspaceSettings);
});

// 12. POST /api/settings: Save settings
app.post("/api/settings", (req, res) => {
  const { botName, tone, customInstructions, webhookUrl } = req.body;
  if (botName) workspaceSettings.botName = botName;
  if (tone) workspaceSettings.tone = tone;
  if (customInstructions !== undefined) workspaceSettings.customInstructions = customInstructions;
  if (webhookUrl !== undefined) workspaceSettings.webhookUrl = webhookUrl;

  console.log("⚙️ Updated Workspace Settings:", workspaceSettings);
  res.json({ success: true, settings: workspaceSettings });
});

// 13. POST /api/settings/test-webhook: Fire live ping to webhook URL
app.post("/api/settings/test-webhook", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No Webhook URL provided" });

  try {
    const payload = {
      event: "orbitdesk.ping",
      message: "👋 Hello from OrbitDesk! Webhook connection verified.",
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    res.json({ success: true, status: response.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to reach webhook URL" });
  }
});

// 14. POST /api/auth/login: Authenticate agent by email
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email } = req.body;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Agent not found with this email. Please sign up." });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// 15. POST /api/auth/signup: Register new agent in PostgreSQL
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const org = await prisma.organization.findFirst();
    if (!org) return res.status(400).json({ error: "No organization found" });

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: role || "AGENT" },
      create: {
        organizationId: org.id,
        name,
        email,
        role: role || "AGENT",
      },
    });

    console.log(`👤 Registered Agent: ${name} (${email}) as ${user.role}`);
    res.json({ success: true, user });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// 16. GET /api/auth/users: List team members for quick switching
app.get("/api/auth/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json(users);
  } catch (error) {
    console.error("Fetch Users Error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
// 17. GET /api/billing: Fetch current plan & usage quotas
app.get("/api/billing", async (req, res) => {
  try {
    const org = await prisma.organization.findFirst();
    if (!org) return res.status(400).json({ error: "No organization found" });

    const userCount = await prisma.user.count();
    const docCount = await prisma.document.count();
    const conversationCount = await prisma.conversation.count();

    // Plan limits definition
    const planLimits: Record<string, { seats: number; docs: number; conversations: number; price: string }> = {
      STARTER: { seats: 3, docs: 5, conversations: 500, price: "$29/mo" },
      GROWTH: { seats: 10, docs: 50, conversations: 5000, price: "$99/mo" },
      ENTERPRISE: { seats: 999, docs: 999, conversations: 50000, price: "Custom" },
    };

    const currentPlan = org.plan || "STARTER";
    const limits = planLimits[currentPlan] || planLimits.STARTER;

    res.json({
      plan: currentPlan,
      limits,
      usage: {
        seats: userCount,
        docs: docCount,
        conversations: conversationCount,
      },
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    });
  } catch (error) {
    console.error("Billing Error:", error);
    res.status(500).json({ error: "Failed to fetch billing info" });
  }
});

// 18. POST /api/billing/upgrade: Update organization plan in PostgreSQL
app.post("/api/billing/upgrade", async (req, res) => {
  try {
    const { plan } = req.body;
    const org = await prisma.organization.findFirst();
    if (!org) return res.status(400).json({ error: "No organization found" });

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { plan },
    });

    console.log(`💳 Organization upgraded to plan: ${plan}`);
    res.json({ success: true, plan: updated.plan });
  } catch (error) {
    console.error("Upgrade Error:", error);
    res.status(500).json({ error: "Failed to upgrade plan" });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`⚡ OrbitDesk API running live on http://localhost:${port}`);
  });
}

// Export the Express app for Vercel Serverless
export default app;
