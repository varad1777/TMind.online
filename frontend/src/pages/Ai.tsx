import React, { useEffect, useRef, useState } from "react";
import { Send, AlertCircle, Zap, Settings2, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import AiApi from "@/api/aiApi";

// Improved AI RCA Chat component
// - Parses the `res.data` payload you showed (data is a YAML-ish string inside data)
// - Renders a clean, readable UI with Asset / Anomalies / Checks
// - Adds a simple client-side typing animation (ChatGPT-like)

type Msg = {
  id: string;
  role: "user" | "assistant";
  // full text from server
  fullText: string;
  // what is currently displayed (for typing effect)
  displayedText?: string;
};

export default function AiRcaChat() {
  const [prompt, setPrompt] = useState("");
  const [system, setSystem] = useState("You are an industrial RCA assistant.");
  const [messages, setMessages] = useState<Msg[]>([{ id: String(Date.now()) + "-u", role: "assistant", fullText: "", displayedText: "hello! I am WMind Assistant, How can I Assist You today?" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const typingRef = useRef<{ timer?: number | null }>({ timer: null });

  var { user } = useAuth();


  useEffect(() => {
    return () => {
      if (typingRef.current.timer) window.clearInterval(typingRef.current.timer as number);
    };
  }, []);

  let navigate = useNavigate()

  function parseYamlish(payload: string) {
    // Expected format from your example (payload is data string)
    // AssetName: varadasset
    // \n\nAnomalies:\n  - SignalName: Voltage\n    AnomalyType: Out-of-range\n    ...

    const out: any = { assetName: undefined, anomalies: [] };

    const assetMatch = payload.match(/AssetName:\s*(.+)/i);
    if (assetMatch) out.assetName = assetMatch[1].trim();

    // Extract anomalies section (everything after "Anomalies:")
    const anomaliesStart = payload.indexOf("Anomalies:");
    if (anomaliesStart === -1) return out;

    const anomaliesText = payload.slice(anomaliesStart + "Anomalies:".length).trim();

    // split blocks by leading "- SignalName:" or "- "
    const blocks = anomaliesText.split(/\n\s*-\s*/).map(s => s.trim()).filter(Boolean);

    for (const blk of blocks) {
      const anomaly: any = {};
      // lines like "SignalName: Voltage"
      const lines = blk.split(/\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const kv = line.match(/^([A-Za-z0-9_ ]+):\s*(.*)$/);
        if (!kv) continue;
        const key = kv[1].trim();
        const val = kv[2].trim();
        // Normalize key to camelCase
        const keyNorm = key
          .toLowerCase()
          .replace(/[^a-z0-9]+([a-z0-9])/g, (_, p1) => p1.toUpperCase())
          .replace(/[^a-z0-9]/g, "");
        anomaly[keyNorm] = val;
      }

      // If there is a 'Checks' sub-list, try to extract bullet lines starting with '- '
      if (blk.includes("- ")) {
        const checks: string[] = [];
        const findChecks = blk.match(/-\s+[^\n]+/g);
        if (findChecks) {
          for (const c of findChecks) checks.push(c.replace(/^-\s+/, "").trim());
        }
        if (checks.length) anomaly.checks = checks;
      }

      out.anomalies.push(anomaly);
    }

    return out;
  }


  async function sendPrompt() {
    if (!user) {
      return navigate("/");
    }

    setError(null);
    const userText = prompt.trim();
    if (!userText) return;

    const userMsg: Msg = {
      id: String(Date.now()) + "-u",
      role: "user",
      fullText: userText,
      displayedText: userText,
    };

    setMessages((m) => [...m, userMsg]);

    setLoading(true);
    setPrompt("");

    try {
      const res = await AiApi.post(
        "/ai/ask",
        {
          prompt: userText,
          system,
          sessionId: user.username,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = res.data;

      // Same fallback logic as your fetch version
      const raw =
        (data &&
          (data.data ||
            data.result ||
            data.answer ||
            data.response ||
            data.rca ||
            data.message)) ??
        JSON.stringify(data);

      const text = typeof raw === "string" ? raw : JSON.stringify(raw);

      const assistantMsg: Msg = {
        id: String(Date.now()) + "-a",
        role: "assistant",
        fullText: text,
        displayedText: "",
      };

      setMessages((m) => [...m, assistantMsg]);

      // Start typing animation
      startTyping(assistantMsg.id, text);
    } catch (err: any) {
      console.error(err);

      // Axios error handling
      const message =
        err.response?.data?.message ||
        err.response?.statusText ||
        err.message ||
        "Unknown error";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function startTyping(msgId: string, fullText: string) {
    // conservative typing speed
    const charsPerSec = 120; // characters per second ~ increase for faster
    const intervalMs = 16; // ~60fps update
    let pos = 0;

    if (typingRef.current.timer) window.clearInterval(typingRef.current.timer as number);

    typingRef.current.timer = window.setInterval(() => {
      // increment by charactersPerTick
      const remaining = fullText.length - pos;
      const charsPerTick = Math.max(1, Math.floor((charsPerSec / 1000) * intervalMs));
      pos += Math.min(charsPerTick, remaining);

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, displayedText: fullText.slice(0, pos) } : m))
      );

      if (pos >= fullText.length) {
        if (typingRef.current.timer) {
          window.clearInterval(typingRef.current.timer as number);
          typingRef.current.timer = null;
        }
      }
    }, intervalMs);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  // Render helper: format a single assistant fullText into parsed structure
  function renderAssistantContent(fullText: string) {
    const parsed = parseYamlish(fullText);
    if (!parsed.assetName && (!parsed.anomalies || parsed.anomalies.length === 0)) {
      // Fallback: show raw text with pre-wrap
      return <div className="whitespace-pre-wrap text-sm">{fullText}</div>;
    }

    return (
      <div className="space-y-4 text-sm">
        {parsed.assetName && (
          <div>
            <div className="text-xs text-slate-500">Asset</div>
            <div className="font-semibold text-sm">{parsed.assetName}</div>
          </div>
        )}

        <div className="space-y-3">
          {parsed.anomalies.map((a: any, i: number) => (
            <div key={i} className="border rounded-lg p-3 bg-slate-50">
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-xs text-slate-500">Signal</div>
                <div className="font-semibold">{a.signalname ?? a.signalName ?? a.signal}</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {a.anomalytype && (
                  <div>
                    <div className="text-slate-500">Anomaly</div>
                    <div className="font-medium">{a.anomalytype}</div>
                  </div>
                )}
                {a.observedvalue && (
                  <div>
                    <div className="text-slate-500">Observed</div>
                    <div className="font-medium">{a.observedvalue}</div>
                  </div>
                )}
              </div>

              {a.immediateaction && (
                <div className="mt-3 text-xs">
                  <div className="text-slate-500">Immediate Action</div>
                  <div className="font-medium">{a.immediateaction}</div>
                </div>
              )}

              {a.followupaction && (
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Follow-up</div>
                  <div>{a.followupaction}</div>
                </div>
              )}

              {a.possiblecause && (
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Possible Cause</div>
                  <div>{a.possiblecause}</div>
                </div>
              )}

              {a.checks && a.checks.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="text-slate-500">Checks</div>
                  <ul className="list-disc ml-5 mt-1 text-xs space-y-1">
                    {a.checks.map((c: string, idx: number) => (
                      <li key={idx} className="whitespace-pre-wrap">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Industrial RCA Assistant</h1>
              <p className="text-xs text-slate-500">AI-powered Root Cause Analysis</p>
            </div>
          </div>
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Configure system prompt"
          >
            <Settings2 className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 max-w-7xl w-full mx-auto px-6 py-6 overflow-hidden">
        {/* Chat Section */}
        <div className="flex-1 flex flex-col min-w-0 h-[80%]">
          {/* Messages Container */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-slate-100 rounded-lg mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No messages yet</h3>
                <p className="text-slate-500 text-sm">Ask about asset status, and get response</p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-2xl rounded-lg px-4 py-3 ${m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-slate-100 text-slate-900 rounded-bl-none"
                      }`}
                  >
                    {m.role === "assistant" ? (
                      // show the typing (displayedText) but parse from fullText for structured UI
                      <div className="prose prose-sm">
                        <div
                          className="whitespace-pre-wrap text-sm"
                          dangerouslySetInnerHTML={{
                            __html: m.displayedText ? m.displayedText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') : "",
                          }}
                        />

                      </div>
                    ) : (
                      <div className="text-sm">{m.displayedText}</div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg rounded-bl-none px-4 py-3">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="mt-6 flex gap-3">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about asset status, voltage anomalies, current issues..."
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
            />
            <button
              onClick={sendPrompt}
              disabled={loading || !prompt.trim()}
              className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg hover:shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="pt-2 text-xs text-red-600 font-bold">Warning -<span className="text-gray-600">WMind Assistant can make Mistake</span></p>
        </div>

        {/* Sidebar */}
        <div className="w-80 flex flex-col gap-6">
          {/* System Prompt Card */}
          {showSystemPrompt && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                System Prompt
              </h3>
              <textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                rows={5}
                className="w-full p-3 rounded border border-slate-300 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs resize-none"
              />
            </div>
          )}

          {/* Tips Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Tips for Best Results</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>Be specific about assets and time windows</span>
              </li>

            </ul>
          </div>

          {/* Example Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4">
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">Example Query</h4>
            <p className="text-xs text-slate-600 mb-3">
              "what is status of engine 4 for last 10 min"
            </p>
            <button
              onClick={() => setPrompt("what is status of engine 4 for last 10 min")}
              className="w-full px-3 py-2 bg-white border border-blue-300 rounded text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Use Example
            </button>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-xs font-medium text-slate-600">API Status</p>
            </div>
            <p className="text-xs text-slate-500">T am WMind Assistant</p>
          </div>
        </div>
      </div>
    </div>
  );
}
