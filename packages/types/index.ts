export type UserRole = "OWNER" | "ADMIN" | "AGENT" | "VIEWER";

export interface Organization {
  id: string;
  name: string;
  plan: "STARTER" | "GROWTH" | "ENTERPRISE";
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: string[];
  createdAt: string;
}

export interface ChatResponse {
  answer: string;
  sources: string[];
  confidence: number;
  escalate: boolean;
}

export interface EscalationPayload {
  conversationId: string;
  customer: {
    name: string;
    email: string;
    company?: string;
  };
  question: string;
  priority: "normal" | "urgent";
}