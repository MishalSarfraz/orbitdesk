import { pipeline } from "@xenova/transformers";
import { prisma } from "../lib/prisma.js";

let embedder: any = null;

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function ingestDocument(orgId: string, title: string, content: string) {
  const doc = await prisma.document.create({
    data: {
      organizationId: orgId,
      title,
      content,
    },
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

  return { documentId: doc.id, chunkCount: chunks.length };
}

export interface SearchMatch {
  title: string;
  content: string;
  distance: number;
}

export async function searchKnowledgeBase(orgId: string, query: string, topK = 3): Promise<SearchMatch[]> {
  const queryVector = await getEmbedding(query);

  const matches = (await prisma.$queryRaw`
    SELECT d.title, c.content, (c.embedding <=> ${JSON.stringify(queryVector)}::vector) AS distance
    FROM "DocumentChunk" c
    JOIN "Document" d ON c."documentId" = d.id
    WHERE d."organizationId" = ${orgId}
    ORDER BY distance ASC
    LIMIT ${topK};
  `) as SearchMatch[];

  return matches;
}