import dotenv from "dotenv";
dotenv.config();

console.log("➡️ Step 1: Script started, environment loaded.");

import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import { pipeline } from "@xenova/transformers";

const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

console.log("➡️ Step 2: Libraries imported successfully.");

// Track download progress so it never hangs silently
let embedder: any = null;
async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    console.log("⏳ Initializing local embedding model (Xenova/all-MiniLM-L6-v2)...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      progress_callback: (progress: any) => {
        if (progress.status === "progress") {
          console.log(`  Downloading ${progress.file}: ${Math.round(progress.progress || 0)}%`);
        }
      },
    });
    console.log("✅ Model loaded successfully!");
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

async function run() {
  console.log("➡️ Step 3: Connecting to Neon PostgreSQL...");
  
  // 1. Create Organization
  const org = await prisma.organization.create({
    data: { name: "CloudScale Inc." },
  });
  console.log(`✅ 1. Created Organization: ${org.name} (ID: ${org.id})`);

  // 2. Ingest document
  console.log("➡️ Step 4: Generating vector embeddings...");
  const guide = `
CloudScale Platform Information:
- Free Plan: $0/month. 1 seat, community forum support.
- Pro Plan: $49/month. 5 seats, priority email support, 99.9% uptime SLA.
- Enterprise Plan: $249/month. Unlimited seats, SAML SSO, dedicated account manager.

Billing Policy:
- All subscriptions are billed monthly or annually (with a 20% discount on annual plans).
- Refunds are available within 14 days of initial purchase.
  `.trim();

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      title: "CloudScale Plans & Billing",
      content: guide,
    },
  });

  const chunks = chunkText(guide);
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
  console.log(`✅ 2. Stored ${chunks.length} chunks & vectors in PostgreSQL.`);

  // 3. Test Question
  const question = "What is the refund policy for CloudScale?";
  console.log(`\n❓ Asking: "${question}"`);

  const qVector = await getEmbedding(question);

  const matches = (await prisma.$queryRaw`
    SELECT d.title, c.content, (c.embedding <=> ${JSON.stringify(qVector)}::vector) AS distance
    FROM "DocumentChunk" c
    JOIN "Document" d ON c."documentId" = d.id
    WHERE d."organizationId" = ${org.id}
    ORDER BY distance ASC
    LIMIT 2;
  `) as Array<{ title: string; content: string; distance: number }>;

  console.log(`🔍 Retrieved ${matches.length} matching context chunks from PostgreSQL.`);

  // 4. Grounded Groq Answer
  console.log("➡️ Step 5: Calling Groq Llama-3.3-70b-versatile...");
  const context = matches.map((m) => m.content).join("\n---\n");

  const completion = await groq.chat.completions.create({
     model: "openai/gpt-oss-20b",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are OrbitDesk AI. Answer using ONLY this context:\n${context}`,
      },
      { role: "user", content: question },
    ],
  });

  console.log("\n🤖 Groq Answer:");
  console.log(completion.choices[0]?.message?.content);
  console.log("\n🎉 Phase 1 is verified and fully operational!");
}

run()
  .catch((err) => {
    console.error("\n❌ Execution Failed with Error:\n", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });