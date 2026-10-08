import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import { pipeline } from "@xenova/transformers";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Define the interface for query matches
interface SearchMatch {
  title: string;
  content: string;
  distance: number;
}

// Initialize local embedding pipeline
let embedder: any = null;
async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// Chunking helper
function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

async function main() {
  console.log("🚀 Starting Groq + Local Embeddings RAG Spike...\n");

  // 1. Create a demo Organization (Multi-tenant partition)
  const org = await prisma.organization.create({
    data: { name: "Acme Corp" },
  });
  console.log(`✓ Organization created: ${org.name} (ID: ${org.id})`);

  // 2. Knowledge base document
  const sampleDoc = {
    title: "OrbitDesk Pricing & Security Guide",
    content: `
OrbitDesk Pricing:
- Starter Plan: $29/month. Includes 3 team seats and email alerts.
- Growth Plan: $99/month. Includes 10 team seats, n8n automation, and analytics.
- Enterprise Plan: Custom pricing. Includes unlimited seats and 24/7 dedicated support.

Security Policy:
- Single Sign-On (SSO) with Okta and SAML 2.0 is strictly an Enterprise feature.
- Starter and Growth plans support standard email/password and Google login only.
- Data encryption: All customer data is encrypted at rest using AES-256 and TLS 1.3 in transit.
    `.trim(),
  };

  // 3. Save Document
  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      title: sampleDoc.title,
      content: sampleDoc.content,
    },
  });
  console.log(`✓ Document saved: "${doc.title}"`);

  // 4. Chunk & Generate Embeddings
  const chunks = chunkText(sampleDoc.content);
  console.log(`✓ Splitting into ${chunks.length} chunks. Generating embeddings locally...`);

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
  console.log("✓ All chunks and vectors saved into Neon PostgreSQL!\n");

  // 5. Test Question
  const question = "How much is the Growth plan, and can I use SSO with it?";
  console.log(`❓ User Question: "${question}"`);

  const questionVector = await getEmbedding(question);

  // 6. Vector Cosine Similarity Search (<=> operator) scoped by organizationId
  const matches = (await prisma.$queryRaw`
    SELECT d.title, c.content, (c.embedding <=> ${JSON.stringify(questionVector)}::vector) AS distance
    FROM "DocumentChunk" c
    JOIN "Document" d ON c."documentId" = d.id
    WHERE d."organizationId" = ${org.id}
    ORDER BY distance ASC
    LIMIT 2;
  `) as SearchMatch[];

  console.log(`\n🔍 Found ${matches.length} matching chunks:`);
  matches.forEach((m: SearchMatch, idx: number) => {
    console.log(`  [Chunk ${idx + 1}] Distance: ${m.distance.toFixed(4)}\n  "${m.content.trim()}"\n`);
  });

  // 7. Grounded Answer using Groq (Llama-3.3-70b-versatile)
  const context = matches.map((m: SearchMatch) => m.content).join("\n---\n");
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are OrbitDesk AI support. Answer the question using ONLY the context provided below. If unknown, say "I cannot find this in documentation."\n\nContext:\n${context}`,
      },
      { role: "user", content: question },
    ],
    temperature: 0.1,
  });

  console.log("🤖 Groq Llama-3.3 Answer:\n");
  console.log(completion.choices[0]?.message?.content);
}

main()
  .catch((err) => console.error("❌ Error:", err))
  .finally(async () => await prisma.$disconnect());