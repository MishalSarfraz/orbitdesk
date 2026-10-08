import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Send,
  User,
  Bot,
  AlertCircle,
  CheckCircle,
  Inbox,
  RefreshCw,
  Check,
  BookOpen,
  Plus,
  FileText,
  BarChart3,
  TrendingUp,
  ShieldAlert,
  Database,
  Reply,
  Settings,
  Radio,
  Sliders,
  X,
  Sparkles,
  Zap,
  ShieldCheck,
  ArrowRight,
  LogOut,
  UserCheck,
  LayoutDashboard,
  ExternalLink,
  CreditCard,
  Crown,
} from "lucide-react";

// Dynamic API Base URL (defaults to localhost:4000 in dev, points to Render in production)
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

interface TicketItem {
  id: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: string;
  createdAt: string;
  conversation: {
    id: string;
    customer?: {
      name: string;
      email: string;
      company?: string;
    };
    messages: Array<{
      role: string;
      content: string;
    }>;
  };
}

interface DocItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  _count?: { chunks: number };
}

interface AnalyticsData {
  overview: {
    totalConversations: number;
    aiResolved: number;
    aiResolutionRate: number;
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    escalationRate: number;
    totalDocs: number;
    totalChunks: number;
  };
  recentConversations: Array<{
    id: string;
    createdAt: string;
    status: string;
    customer?: { name: string; email: string };
    _count: { messages: number };
    ticket?: { status: string };
  }>;
}

interface AgentUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER";
}

interface BillingInfo {
  plan: "STARTER" | "GROWTH" | "ENTERPRISE";
  limits: { seats: number; docs: number; conversations: number; price: string };
  usage: { seats: number; docs: number; conversations: number };
  nextBillingDate: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AgentUser | null>(() => {
    const saved = localStorage.getItem("orbitdesk_agent");
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<"landing" | "admin" | "kb" | "analytics" | "settings" | "billing">(() => {
    const saved = localStorage.getItem("orbitdesk_agent");
    return saved ? "admin" : "landing";
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authRole, setAuthRole] = useState<"ADMIN" | "AGENT">("AGENT");
  const [authError, setAuthError] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<AgentUser[]>([]);

  // Floating Chat Widget State
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am OrbitDesk AI. Ask me anything about CloudScale pricing, billing, or features!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Escalation Modal State
  const [showEscalation, setShowEscalation] = useState(false);
  const [ticketCreated, setTicketCreated] = useState<string | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", company: "" });

  // Admin Tickets State
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [agentReply, setAgentReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Knowledge Base State
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexSuccess, setIndexSuccess] = useState(false);

  // Analytics State
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Billing State
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);

  // Settings State
  const [botName, setBotName] = useState("OrbitDesk AI");
  const [tone, setTone] = useState("Professional & Concise");
  const [customInstructions, setCustomInstructions] = useState("Prioritize official policy docs and be helpful.");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`);
      const data = await res.json();
      setAvailableUsers(data);
    } catch {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      setBotName(data.botName);
      setTone(data.tone);
      setCustomInstructions(data.customInstructions);
      setWebhookUrl(data.webhookUrl || "");
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets`);
      const data = await res.json();
      setTickets(data);
      if (data.length > 0) {
        if (selectedTicket) {
          const current = data.find((t: TicketItem) => t.id === selectedTicket.id);
          if (current) setSelectedTicket(current);
        } else {
          setSelectedTicket(data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchDocs = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      const data = await res.json();
      setDocs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics`);
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchBilling = async () => {
    setLoadingBilling(true);
    try {
      const res = await fetch(`${API_BASE}/api/billing`);
      const data = await res.json();
      setBilling(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBilling(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab === "admin" && currentUser) fetchTickets();
    if (activeTab === "kb" && currentUser) fetchDocs();
    if (activeTab === "analytics" && currentUser) fetchAnalytics();
    if (activeTab === "settings" && currentUser) fetchSettings();
    if (activeTab === "billing" && currentUser) fetchBilling();
  }, [activeTab, currentUser]);

  const handleUpgradePlan = async (newPlan: "STARTER" | "GROWTH" | "ENTERPRISE") => {
    setUpgradingPlan(newPlan);
    try {
      const res = await fetch(`${API_BASE}/api/billing/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      const data = await res.json();
      if (data.success) {
        setUpgradeSuccess(`Successfully switched to ${newPlan} plan!`);
        fetchBilling();
        setTimeout(() => setUpgradeSuccess(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleLogin = async (emailToLogin: string) => {
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToLogin }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        localStorage.setItem("orbitdesk_agent", JSON.stringify(data.user));
        setShowAuthModal(false);
        setActiveTab("admin");
      } else {
        setAuthError(data.error);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to log in");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: authName, email: authEmail, role: authRole }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        localStorage.setItem("orbitdesk_agent", JSON.stringify(data.user));
        setShowAuthModal(false);
        setActiveTab("admin");
        fetchUsers();
      } else {
        setAuthError(data.error);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to sign up");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("orbitdesk_agent");
    setActiveTab("landing");
  };

  // Poll conversation updates for customer chat
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tickets`);
        const allTickets = await res.json();
        const myTicket = allTickets.find((t: TicketItem) => t.conversation.id === conversationId);
        if (myTicket && myTicket.conversation.messages.length > messages.length) {
          setMessages(
            myTicket.conversation.messages.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [conversationId, messages.length]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botName, tone, customInstructions, webhookUrl }),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    setTestingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/test-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookStatus("✅ Webhook Ping Delivered Successfully!");
      } else {
        setWebhookStatus(`❌ Failed: ${data.error}`);
      }
    } catch (err: any) {
      setWebhookStatus(`❌ Error: ${err.message}`);
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      fetchTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: "RESOLVED" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendAgentReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !agentReply.trim() || sendingReply) return;

    setSendingReply(true);
    try {
      await fetch(`${API_BASE}/api/tickets/${selectedTicket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: agentReply.trim() }),
      });
      setAgentReply("");
      fetchTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setSendingReply(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || indexing) return;

    setIndexing(true);
    try {
      await fetch(`${API_BASE}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });
      setNewTitle("");
      setNewContent("");
      setIndexSuccess(true);
      fetchDocs();
      setTimeout(() => setIndexSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIndexing(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, conversationId }),
      });

      const data = await res.json();
      setConversationId(data.conversationId);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        },
      ]);

      if (data.escalate) {
        setShowEscalation(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Could not connect to API. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          name: customer.name,
          email: customer.email,
          company: customer.company,
          question: messages[messages.length - 2]?.content || "Assistance needed",
        }),
      });
      const data = await res.json();
      setTicketCreated(data.ticketId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* 1. PUBLIC CUSTOMER NAVBAR */}
      {!currentUser && (
        <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-8 py-3.5 flex items-center justify-between z-40">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/30">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-wide bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              OrbitDesk
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-400">
            <span className="hover:text-white cursor-pointer transition">Product</span>
            <span className="hover:text-white cursor-pointer transition">Solutions</span>
            <span className="hover:text-white cursor-pointer transition">Pricing</span>
            <span className="hover:text-white cursor-pointer transition">Documentation</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60 transition"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              Staff Portal
            </button>
          </div>
        </nav>
      )}

      {/* 2. INTERNAL AGENT WORKSPACE NAVBAR */}
      {currentUser && (
        <nav className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-2.5 flex items-center justify-between z-40">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/30">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide text-white block leading-tight">
                OrbitDesk Workspace
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Agent Portal</span>
            </div>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("admin")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                activeTab === "admin" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📋 Agent Inbox ({tickets.filter((t) => t.status === "OPEN").length})
            </button>
            <button
              onClick={() => setActiveTab("kb")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                activeTab === "kb" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📚 Knowledge Base
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                activeTab === "analytics" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📊 Analytics
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "billing" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" /> Billing
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                activeTab === "settings" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              ⚙️ Settings
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab(activeTab === "landing" ? "admin" : "landing")}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 transition"
            >
              <ExternalLink className="w-3 h-3 text-indigo-400" />
              {activeTab === "landing" ? "Back to Dashboard" : "Preview Public Site"}
            </button>

            <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
              <div className="text-right">
                <span className="text-xs font-bold text-white block">{currentUser.name}</span>
                <span className="text-[10px] text-indigo-400 font-mono block uppercase">{currentUser.role}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="text-slate-400 hover:text-rose-400 p-1 rounded transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* VIEW 1: PUBLIC SAAS LANDING PAGE */}
      {activeTab === "landing" && (
        <div className="flex-1 overflow-y-auto relative">
          <section className="max-w-5xl mx-auto pt-24 pb-16 px-6 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-medium animate-pulse">
              <Sparkles className="w-3.5 h-3.5" /> Next-Gen AI Customer Support Platform
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
              AI Support, That <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Works.</span>
            </h1>

            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Instant grounded answers. Sub-second vector search. And human agents when it truly matters.
            </p>

            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setIsWidgetOpen(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition hover:scale-105"
              >
                Try Live AI Widget <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

          <section className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3 hover:border-slate-700 transition">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl w-fit">
                <Database className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Grounded Vector RAG</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Embeddings generated locally on CPU and stored in PostgreSQL with pgvector for accurate retrieval without hallucinating.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3 hover:border-slate-700 transition">
              <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl w-fit">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Sub-Second Groq Engine</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Answers generated in under a second using high-speed open-weights models running on Groq LPU silicon.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3 hover:border-slate-700 transition">
              <div className="p-2.5 bg-cyan-600/20 text-cyan-400 rounded-xl w-fit">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Human Fallback & Automation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                When answers lack confidence, tickets are automatically created and dispatched to n8n, Slack, and the Agent Inbox.
              </p>
            </div>
          </section>

          {/* Floating Widget Trigger Button */}
          <div className="fixed bottom-6 right-6 z-50">
            {!isWidgetOpen && (
              <button
                onClick={() => setIsWidgetOpen(true)}
                className="group flex items-center gap-3 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl shadow-indigo-600/50 hover:scale-105 transition-all duration-300"
              >
                <div className="relative">
                  <Bot className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse"></span>
                </div>
                <span className="text-sm font-semibold tracking-wide">Chat with {botName}</span>
              </button>
            )}

            {isWidgetOpen && (
              <div className="w-[380px] sm:w-[420px] h-[580px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200">
                <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-xl text-white">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{botName}</h3>
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active Online
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowEscalation(true)}
                      className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700"
                    >
                      Talk to human
                    </button>
                    <button
                      onClick={() => setIsWidgetOpen(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
                  {messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div
                        className={`p-1.5 rounded-full shrink-0 ${
                          m.role === "user"
                            ? "bg-indigo-600 text-white"
                            : m.content.startsWith("[Human Agent]")
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 text-indigo-400"
                        }`}
                      >
                        {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          m.role === "user"
                            ? "bg-indigo-600 text-white"
                            : m.content.startsWith("[Human Agent]")
                            ? "bg-emerald-950/50 text-emerald-200 border border-emerald-700/60"
                            : "bg-slate-800/90 text-slate-200 border border-slate-700/60"
                        }`}
                      >
                        <p>{m.content}</p>
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-2 pt-1.5 border-t border-slate-700/60 text-[10px] text-slate-400 flex flex-wrap gap-1 items-center">
                            <span className="font-semibold text-slate-500">Sources:</span>
                            {m.sources.map((s, i) => (
                              <span key={i} className="bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 italic">
                      <Bot className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      {botName} is typing...
                    </div>
                  )}
                </div>

                <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask about pricing, refunds, SLA..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: AGENT INBOX */}
      {activeTab === "admin" && currentUser && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Inbox className="w-4 h-4 text-indigo-400" />
                Escalated Tickets
              </h2>
              <button
                onClick={fetchTickets}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No tickets found yet.</div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`p-4 cursor-pointer transition text-left ${
                      selectedTicket?.id === t.id ? "bg-slate-800" : "hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-white">
                        {t.conversation.customer?.name || "Anonymous User"}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          t.status === "OPEN"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : t.status === "IN_PROGRESS"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {t.conversation.customer?.email || "No email"}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 font-mono">
                      Ticket #{t.id.slice(-6)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-slate-900">
            {selectedTicket ? (
              <>
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {selectedTicket.conversation.customer?.name || "Customer"}{" "}
                      <span className="text-slate-500 text-sm font-normal">
                        ({selectedTicket.conversation.customer?.company || "No Company"})
                      </span>
                    </h2>
                    <p className="text-xs text-indigo-400">
                      {selectedTicket.conversation.customer?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedTicket.status !== "RESOLVED" && (
                      <button
                        onClick={() => handleResolveTicket(selectedTicket.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                      >
                        <Check className="w-3.5 h-3.5" /> Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Live Conversation Transcript
                  </h3>
                  {selectedTicket.conversation.messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm max-w-xl ${
                        msg.role === "user"
                          ? "bg-indigo-950/40 border border-indigo-800/50 text-indigo-200 ml-auto"
                          : msg.content.startsWith("[Human Agent]")
                          ? "bg-emerald-950/40 border border-emerald-700/50 text-emerald-200"
                          : "bg-slate-800/60 border border-slate-700/50 text-slate-300"
                      }`}
                    >
                      <p className="text-[10px] font-mono text-slate-400 mb-1 capitalize">{msg.role}:</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleSendAgentReply}
                  className="p-4 border-t border-slate-800 bg-slate-950/80 flex gap-2"
                >
                  <input
                    type="text"
                    placeholder={`Reply directly to ${selectedTicket.conversation.customer?.name || "customer"}...`}
                    value={agentReply}
                    onChange={(e) => setAgentReply(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !agentReply.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Reply className="w-3.5 h-3.5" /> Reply
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Select a ticket from the left panel to inspect the chat transcript.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: KNOWLEDGE BASE MANAGER */}
      {activeTab === "kb" && currentUser && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 border-r border-slate-800 bg-slate-900/40 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Indexed Articles ({docs.length})
              </h2>
              <button
                onClick={fetchDocs}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDocs ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {docs.map((d) => (
                <div key={d.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      {d.title}
                    </h3>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                      {d._count?.chunks || 0} vector chunks
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{d.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-1/2 p-6 overflow-y-auto bg-slate-900">
            <form onSubmit={handleCreateDocument} className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-400" /> Add Knowledge Base Article
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Content will be split into chunks and converted into vectors in PostgreSQL.
                  </p>
                </div>
                {indexSuccess && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Indexed & Ready!
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Article Title</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. VIP Enterprise SLA Policy"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Article Content (Markdown / Text)</label>
                <textarea
                  required
                  rows={8}
                  placeholder="Paste policies, answers, pricing, or troubleshooting steps..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={indexing || !newTitle.trim() || !newContent.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                {indexing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Chunking & Generating Vectors...
                  </>
                ) : (
                  <>
                    <BookOpen className="w-3.5 h-3.5" />
                    Save & Index in Vector DB
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 4: ANALYTICS DASHBOARD */}
      {activeTab === "analytics" && currentUser && (
        <div className="flex-1 overflow-y-auto p-8 max-w-6xl w-full mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" /> Support Analytics & Insights
              </h2>
              <p className="text-xs text-slate-400 mt-1">Real-time telemetry calculated directly from PostgreSQL.</p>
            </div>
            <button
              onClick={fetchAnalytics}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalytics ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {analytics && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Total Conversations</span>
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                  </div>
                  <p className="text-2xl font-bold text-white font-mono">{analytics.overview.totalConversations}</p>
                  <p className="text-[11px] text-slate-500">All customer interactions</p>
                </div>

                <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">AI Resolution Rate</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {analytics.overview.aiResolutionRate}%
                  </p>
                  <p className="text-[11px] text-slate-500">{analytics.overview.aiResolved} answered without humans</p>
                </div>

                <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Escalated Tickets</span>
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {analytics.overview.totalTickets}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {analytics.overview.openTickets} open, {analytics.overview.resolvedTickets} resolved
                  </p>
                </div>

                <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Vector Knowledge Base</span>
                    <Database className="w-4 h-4 text-cyan-400" />
                  </div>
                  <p className="text-2xl font-bold text-cyan-400 font-mono">{analytics.overview.totalChunks}</p>
                  <p className="text-[11px] text-slate-500">Chunks across {analytics.overview.totalDocs} articles</p>
                </div>
              </div>

              <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    AI Auto-Resolution vs Human Escalation
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Target: 80% AI Resolution</span>
                </div>

                <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${analytics.overview.aiResolutionRate}%` }}
                    className="bg-emerald-500 transition-all duration-500"
                  ></div>
                  <div
                    style={{ width: `${analytics.overview.escalationRate}%` }}
                    className="bg-amber-500 transition-all duration-500"
                  ></div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    AI Resolved ({analytics.overview.aiResolutionRate}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    Human Escalated ({analytics.overview.escalationRate}%)
                  </span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Recent Customer Sessions</h3>
                </div>
                <div className="divide-y divide-slate-800 text-xs">
                  {analytics.recentConversations.map((c) => (
                    <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30">
                      <div>
                        <p className="font-semibold text-white">{c.customer?.name || "Guest Visitor"}</p>
                        <p className="text-slate-400 text-[11px] font-mono">ID: {c.id.slice(-8)}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium font-mono ${
                            c.ticket?.status === "RESOLVED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : c.status === "escalated"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-indigo-500/20 text-indigo-400"
                          }`}
                        >
                          {c.ticket?.status ? `TICKET: ${c.ticket.status}` : "AI RESOLVED"}
                        </span>
                        <p className="text-slate-500 text-[11px] mt-0.5">{c._count.messages} messages</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW 5: BILLING & SUBSCRIPTIONS */}
      {activeTab === "billing" && currentUser && (
        <div className="flex-1 overflow-y-auto p-8 max-w-5xl w-full mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" /> Subscription & Usage Limits
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Manage your OrbitDesk plan, monitor quota utilization, and upgrade tiers.
              </p>
            </div>
            <button
              onClick={fetchBilling}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBilling ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {upgradeSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4" /> {upgradeSuccess}
            </div>
          )}

          {billing && (
            <>
              {/* Active Plan Card */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">{billing.plan} Plan</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-semibold">
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Renews automatically on {billing.nextBillingDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-white font-mono">{billing.limits.price}</span>
                    <span className="text-xs text-slate-500 block">Monthly recurring</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-400">Team Seats</span>
                      <span className="text-white font-mono">
                        {billing.usage.seats} / {billing.limits.seats} seats
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, (billing.usage.seats / billing.limits.seats) * 100)}%` }}
                        className="h-full bg-indigo-500 rounded-full"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-400">Knowledge Base Articles</span>
                      <span className="text-white font-mono">
                        {billing.usage.docs} / {billing.limits.docs} docs
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, (billing.usage.docs / billing.limits.docs) * 100)}%` }}
                        className="h-full bg-cyan-500 rounded-full"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-400">Monthly Conversations</span>
                      <span className="text-white font-mono">
                        {billing.usage.conversations} / {billing.limits.conversations}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${Math.min(100, (billing.usage.conversations / billing.limits.conversations) * 100)}%`,
                        }}
                        className="h-full bg-emerald-500 rounded-full"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tiers List */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-4">Available OrbitDesk Tiers</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Starter */}
                  <div
                    className={`p-6 rounded-2xl border transition flex flex-col justify-between ${
                      billing.plan === "STARTER"
                        ? "bg-slate-900 border-indigo-500/80 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/60 border-slate-800"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-base">Starter</h4>
                          <p className="text-xs text-slate-400">For early-stage startups</p>
                        </div>
                        {billing.plan === "STARTER" && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded-full font-mono">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-white font-mono">
                        $29<span className="text-xs text-slate-500 font-normal">/month</span>
                      </p>
                      <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800">
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> 3 teammates
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> AI assistant with RAG
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> 5 Knowledge Base docs
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Basic analytics
                        </li>
                      </ul>
                    </div>

                    <button
                      disabled={billing.plan === "STARTER" || upgradingPlan !== null}
                      onClick={() => handleUpgradePlan("STARTER")}
                      className={`w-full mt-6 py-2 rounded-lg text-xs font-semibold transition ${
                        billing.plan === "STARTER"
                          ? "bg-slate-800 text-slate-500 cursor-default"
                          : "bg-slate-800 hover:bg-slate-700 text-white"
                      }`}
                    >
                      {billing.plan === "STARTER" ? "Active Plan" : "Downgrade to Starter"}
                    </button>
                  </div>

                  {/* Growth */}
                  <div
                    className={`p-6 rounded-2xl border transition relative flex flex-col justify-between ${
                      billing.plan === "GROWTH"
                        ? "bg-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/20"
                        : "bg-slate-900/90 border-indigo-500/40"
                    }`}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold tracking-wider uppercase shadow">
                      Most Popular
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-base">Growth</h4>
                          <p className="text-xs text-slate-400">For scaling SaaS teams</p>
                        </div>
                        {billing.plan === "GROWTH" && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded-full font-mono">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-white font-mono">
                        $99<span className="text-xs text-slate-500 font-normal">/month</span>
                      </p>
                      <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800">
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> 10 teammates
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Advanced automation
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> n8n & webhook integrations
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> 50 Knowledge Base docs
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Advanced analytics
                        </li>
                      </ul>
                    </div>

                    <button
                      disabled={billing.plan === "GROWTH" || upgradingPlan !== null}
                      onClick={() => handleUpgradePlan("GROWTH")}
                      className={`w-full mt-6 py-2.5 rounded-lg text-xs font-semibold transition ${
                        billing.plan === "GROWTH"
                          ? "bg-slate-800 text-slate-500 cursor-default"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                      }`}
                    >
                      {upgradingPlan === "GROWTH"
                        ? "Upgrading in PostgreSQL..."
                        : billing.plan === "GROWTH"
                        ? "Active Plan"
                        : "Upgrade to Growth"}
                    </button>
                  </div>

                  {/* Enterprise */}
                  <div
                    className={`p-6 rounded-2xl border transition flex flex-col justify-between ${
                      billing.plan === "ENTERPRISE"
                        ? "bg-slate-900 border-indigo-500/80 shadow-lg"
                        : "bg-slate-900/60 border-slate-800"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-base">Enterprise</h4>
                          <p className="text-xs text-slate-400">For security & custom scale</p>
                        </div>
                        {billing.plan === "ENTERPRISE" && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded-full font-mono">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-white font-mono">
                        Custom<span className="text-xs text-slate-500 font-normal"> / annual</span>
                      </p>
                      <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800">
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Unlimited teammates
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> SSO with Okta & SAML 2.0
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Audit logs & data retention
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-indigo-400" /> Dedicated support SLA
                        </li>
                      </ul>
                    </div>

                    <button
                      disabled={billing.plan === "ENTERPRISE" || upgradingPlan !== null}
                      onClick={() => handleUpgradePlan("ENTERPRISE")}
                      className={`w-full mt-6 py-2 rounded-lg text-xs font-semibold transition ${
                        billing.plan === "ENTERPRISE"
                          ? "bg-slate-800 text-slate-500 cursor-default"
                          : "bg-slate-800 hover:bg-slate-700 text-white"
                      }`}
                    >
                      {billing.plan === "ENTERPRISE" ? "Active Plan" : "Switch to Enterprise"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW 6: SETTINGS & GUARDRAILS */}
      {activeTab === "settings" && currentUser && (
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl w-full mx-auto space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" /> Workspace & AI Configuration
            </h2>
            <p className="text-xs text-slate-400 mt-1">Configure bot persona, guardrails, and outbound automation webhooks.</p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" /> AI Assistant Persona
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">Assistant Name</label>
                  <input
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">Response Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Professional & Concise">Professional & Concise (Standard)</option>
                    <option value="Warm & Friendly">Warm & Friendly (Conversational)</option>
                    <option value="Strict Technical">Strict Technical (Short & Direct)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Custom System Guardrails</label>
                <textarea
                  rows={3}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Always refer users to docs, never discuss competitor software..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-400" /> Outbound Escalation Webhook (n8n / Slack)
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">Dispatches on human escalation</span>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://n8n.your-domain.com/webhook/... or Discord/Slack Webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={testingWebhook || !webhookUrl}
                    onClick={handleTestWebhook}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-semibold transition"
                  >
                    {testingWebhook ? "Pinging..." : "Test Ping"}
                  </button>
                </div>
                {webhookStatus && (
                  <p className="text-xs mt-2 font-mono text-indigo-400">{webhookStatus}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {settingsSaved ? (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> Settings updated live!
                </span>
              ) : (
                <span className="text-xs text-slate-500">Changes take effect immediately across all sessions.</span>
              )}

              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-2"
              >
                {savingSettings ? "Saving..." : "Save Workspace Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AGENT LOGIN / SIGNUP MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <div className="p-2 bg-indigo-600/20 rounded-xl text-indigo-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Staff Portal Sign In</h3>
                  <p className="text-xs text-slate-400">Restricted to authorized OrbitDesk agents.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {availableUsers.length > 0 && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Quick Demo Login
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleLogin(u.email)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 rounded text-xs transition font-medium flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                      {u.name} ({u.role})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex border-b border-slate-800 text-xs font-semibold">
              <button
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                className={`flex-1 py-2 text-center border-b-2 transition ${
                  authMode === "login"
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError(null);
                }}
                className={`flex-1 py-2 text-center border-b-2 transition ${
                  authMode === "signup"
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                {authError}
              </p>
            )}

            {authMode === "login" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin(authEmail);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Agent Email</label>
                  <input
                    required
                    type="email"
                    placeholder="agent@orbitdesk.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
                >
                  Sign In to Workspace
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Sarah Connor"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Email</label>
                  <input
                    required
                    type="email"
                    placeholder="sarah@orbitdesk.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Workspace Role</label>
                  <select
                    value={authRole}
                    onChange={(e) => setAuthRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="AGENT">Support Agent</option>
                    <option value="ADMIN">Workspace Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
                >
                  Create Agent Account
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CUSTOMER ESCALATION MODAL */}
      {showEscalation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            {!ticketCreated ? (
              <form onSubmit={handleEscalateSubmit} className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-400">
                  <AlertCircle className="w-5 h-5" />
                  <h3 className="font-semibold text-white">Escalate to Human Support</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Fill in your details and an agent will follow up on your request.
                </p>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Your Name</label>
                  <input
                    required
                    type="text"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Email Address</label>
                  <input
                    required
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Company</label>
                  <input
                    type="text"
                    value={customer.company}
                    onChange={(e) => setCustomer({ ...customer, company: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEscalation(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                  >
                    Create Ticket
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-3">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Ticket Submitted!</h3>
                <p className="text-xs text-slate-400">
                  Ticket <span className="font-mono text-indigo-400">#{ticketCreated}</span> created in PostgreSQL.
                </p>
                <button
                  onClick={() => {
                    setShowEscalation(false);
                    setTicketCreated(null);
                  }}
                  className="mt-4 px-4 py-1.5 bg-slate-800 text-white rounded text-xs"
                >
                  Back to chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}