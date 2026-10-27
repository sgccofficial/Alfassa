import { useState, FormEvent, useEffect, useRef } from "react";
import { Globe, ArrowRight } from "iconoir-react";
import { isValidWebUrl } from "../../engines/material-engine/detector";
import { Modal } from "../../shared/components/Modal";

interface LinkIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<any>;
}

export function LinkIntakeModal({ isOpen, onClose, onSubmit }: LinkIntakeModalProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a web link.");
      return;
    }

    const targetUrl = trimmed.startsWith("http://") || trimmed.startsWith("https://") 
      ? trimmed 
      : `https://${trimmed}`;

    if (!isValidWebUrl(targetUrl)) {
      setError("Please enter a valid website URL (e.g. https://example.com)");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(targetUrl);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Could not intake this URL.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-lg"
      aria-label="Add a Web Link"
    >
      <div className="flex items-center gap-3 mb-5 pr-8">
        <div className="p-2 rounded-lg bg-bg-subtle text-text-primary border border-border-color flex items-center justify-center shrink-0">
          <Globe size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-base font-bold tracking-tight text-text-primary">Add a Web Link</h3>
          <p className="text-xs text-text-muted">Articles, documentation, web pages, or references</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://example.com/article"
            disabled={isSubmitting}
            className="w-full px-3 py-2 bg-bg-surface border border-border-color rounded-lg text-text-primary placeholder:text-text-muted text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-accent-highlight focus:border-accent-highlight transition-colors"
          />
          {error && <p className="text-xs text-red-500 mt-1.5 pl-0.5">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !url.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <span>{isSubmitting ? "Adding..." : "Add link"}</span>
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

