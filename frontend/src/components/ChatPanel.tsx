import { useState, useEffect, useRef, FormEvent } from "react";
import { api, ChatMessage } from "../lib/api";

interface ChatPanelProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Ongoing "talk to your mentor any time" chat — deliberately separate from
 * Dashboard's interview-only chatHistory/chatMessage state, which is gated
 * to interviewSession and only exists during onboarding. This panel is
 * available throughout the learner's journey, backed by ChatMessage
 * history persisted in Postgres (see backend chat.routes.ts / chat.service.ts)
 * and grounded in the learner's real profile/roadmap/mastery data on the
 * engine side (see mentor_ai_engine/app/chat).
 */
export function ChatPanel({ token, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    api
      .getChatHistory(token)
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chat history");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError(null);
    setInput("");

    try {
      const { userMessage, mentorMessage } = await api.sendChatMessage(token, trimmed);
      setMessages((prev) => [...prev, userMessage, mentorMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      setInput(trimmed); // give it back so the learner doesn't lose what they typed
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-mist bg-panel-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mist p-4">
          <div>
            <p className="font-mono-label text-xs uppercase tracking-wider text-moss">AI Mentor</p>
            <p className="text-sm text-parchment font-semibold">Ask anything, any time</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-mist px-3 py-1.5 text-xs text-fog hover:bg-panel transition"
          >
            Close
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-4 bg-bg/25">
          {isLoadingHistory ? (
            <p className="text-sm text-fog text-center py-10">Loading your conversation...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-fog text-center py-10 max-w-xs mx-auto">
              Ask about a topic, why something's locked, what to focus on next — anything about
              your course.
            </p>
          ) : (
            messages.map((msg) => {
              const isMentor = msg.role === "mentor";
              return (
                <div key={msg.id} className={`flex ${isMentor ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg p-4 text-sm leading-relaxed border ${
                      isMentor
                        ? "bg-panel border-mist text-parchment"
                        : "bg-blaze/10 border-blaze/30 text-parchment font-medium"
                    }`}
                  >
                    <p className="font-mono-label text-[10px] uppercase tracking-wider text-moss mb-1">
                      {isMentor ? "▲ AI Mentor" : "● You"}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })
          )}
          {error && <p className="text-xs text-center text-red-400">{error}</p>}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSend} className="border-t border-mist bg-panel-raised p-4 flex gap-2">
          <input
            type="text"
            required
            disabled={isSending}
            placeholder="Ask your mentor anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow rounded-md border border-mist bg-panel px-4 py-3 text-sm text-parchment outline-none focus:border-blaze disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-md bg-blaze px-5 py-3 text-sm font-semibold text-bg hover:bg-blaze-dim transition disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
