import React, { useState, useEffect } from "react";
import { Brain, BookOpen, Edit3, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/providers/AuthProvider";
import { Concept } from "../../types";
import { subscribeToUserConcepts } from "../../services/concept-db";

export function RevisionView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.uid || "guest-user";
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [revisionNote, setRevisionNote] = useState("");

  useEffect(() => {
    const unsub = subscribeToUserConcepts(userId, setConcepts);
    return () => unsub();
  }, [userId]);

  const handleSaveNote = () => {
    console.log("Saving note for concept", selectedConcept?.id, ":", revisionNote);
    // In a real app, this would save to a db.
  };

  return (
    <div className="p-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      <header className="md:col-span-3">
        <h1 className="text-xl font-bold text-text-primary">Revision</h1>
        <p className="text-sm text-text-secondary">Review concepts and add revision notes.</p>
      </header>

      <div className="md:col-span-1 bg-bg-surface border border-border-color rounded-xl p-4 space-y-2 h-[calc(100vh-150px)] overflow-y-auto">
        <h2 className="text-xs font-bold text-text-muted uppercase">Accepted Concepts</h2>
        {concepts.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedConcept(c);
              setRevisionNote("");
            }}
            className={`w-full text-left p-3 rounded-lg text-sm ${
              selectedConcept?.id === c.id ? "bg-bg-subtle" : "hover:bg-bg-subtle"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {selectedConcept ? (
        <div className="md:col-span-2 bg-bg-surface border border-border-color rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-text-primary">{selectedConcept.title}</h2>
          <p className="text-sm text-text-secondary">{selectedConcept.content}</p>
          <div className="pt-4 border-t border-border-color space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">Revision Notes</h3>
            <textarea
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              className="w-full p-3 rounded-lg bg-bg-main border border-border-color text-sm"
              placeholder="Add revision notes for this concept..."
            />
            <button
              onClick={handleSaveNote}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent-highlight text-white"
            >
              <Save size={16} />
              Save Note
            </button>
          </div>
        </div>
      ) : (
        <div className="md:col-span-2 bg-bg-surface border border-border-color rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
          <Brain className="text-text-muted" size={48} />
          <p className="text-text-secondary">Select a concept to review and add notes.</p>
        </div>
      )}
    </div>
  );
}
