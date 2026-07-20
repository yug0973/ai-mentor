import { useState, useEffect } from "react";
import { Topic, api } from "../lib/api";

type SessionLogModalProps = {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  roadmapId: string;
  availableTopics: Topic[];
  onSuccess: () => void;
  defaultTopicId?: string | null;
};

export default function SessionLogModal({
  isOpen,
  onClose,
  token,
  roadmapId,
  availableTopics,
  onSuccess,
  defaultTopicId,
}: SessionLogModalProps) {
  const [duration, setDuration] = useState<number>(30);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTopics(defaultTopicId ? [defaultTopicId] : []);
    }
  }, [isOpen, defaultTopicId]);

  if (!isOpen) return null;


  const toggleTopic = (id: string) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTopics.length === 0) {
      setError("Please select at least one topic.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await api.createSessionLog(token, {
        duration,
        topics: selectedTopics,
        difficulty,
        notes: notes.trim() || undefined,
        roadmapId,
      });
      onSuccess();
      onClose();
      // Reset form
      setDuration(30);
      setSelectedTopics([]);
      setDifficulty("medium");
      setNotes("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to log session. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-mist bg-panel p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-mist pb-3">
          <div>
            <p className="font-mono-label text-xs uppercase tracking-widest text-blaze">
              Switchbacks
            </p>
            <h2 className="font-display text-2xl font-semibold text-parchment">
              Log Study Session
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-fog hover:text-parchment font-mono-label text-lg p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Duration */}
          <div>
            <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
              Study Duration (Minutes)
            </label>
            <input
              type="number"
              min={1}
              required
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
            />
          </div>

          {/* Topics covered */}
          <div>
            <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-2">
              Topics Covered (Select at least one)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-mist rounded-md p-2 bg-panel-raised">
              {availableTopics.map((topic) => {
                const isSelected = selectedTopics.includes(topic.topic_id);
                return (
                  <button
                    key={topic.topic_id}
                    type="button"
                    onClick={() => toggleTopic(topic.topic_id)}
                    className={`flex items-center text-left px-3 py-2 rounded text-xs transition border ${
                      isSelected
                        ? "bg-blaze/10 border-blaze text-parchment"
                        : "bg-panel border-mist text-fog hover:border-fog"
                    }`}
                  >
                    <span className={`mr-2 h-3.5 w-3.5 rounded border flex items-center justify-center ${
                      isSelected ? "border-blaze bg-blaze text-bg" : "border-fog"
                    }`}>
                      {isSelected && "✓"}
                    </span>
                    <span className="truncate">{topic.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-2">
              Self-Rated Difficulty
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "medium", "hard"] as const).map((diff) => {
                const isSelected = difficulty === diff;
                const colors = {
                  easy: isSelected ? "bg-moss/10 border-moss text-moss" : "hover:border-moss/50",
                  medium: isSelected ? "bg-blaze/10 border-blaze text-blaze" : "hover:border-blaze/50",
                  hard: isSelected ? "bg-red-500/10 border-red-500 text-red-400" : "hover:border-red-500/50",
                };
                return (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setDifficulty(diff)}
                    className={`py-2 px-3 border border-mist rounded text-xs capitalize font-mono-label tracking-wide transition ${colors[diff]} ${
                      isSelected ? "border-current" : "bg-panel-raised text-fog"
                    }`}
                  >
                    {diff}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
              Study Notes / Progress Summary
            </label>
            <textarea
              rows={3}
              placeholder="What did you learn? Any questions or hurdles encountered?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-blaze font-mono-label bg-blaze/10 border border-blaze/20 rounded p-2">
              ⚠️ {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-mist">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full border border-mist px-4 py-2 text-xs font-medium text-fog hover:text-parchment transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-blaze px-5 py-2 text-xs font-semibold text-bg hover:bg-blaze-dim transition disabled:opacity-50"
            >
              {isSubmitting ? "Logging..." : "Log Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
