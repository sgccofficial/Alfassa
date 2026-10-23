import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

interface IntakeStatusToastProps {
  isProcessing: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onDismiss: () => void;
}

export function IntakeStatusToast({
  isProcessing,
  statusMessage,
  errorMessage,
  onDismiss,
}: IntakeStatusToastProps) {
  useEffect(() => {
    if (statusMessage && !isProcessing) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage, isProcessing, onDismiss]);

  if (!isProcessing && !statusMessage && !errorMessage) {
    return null;
  }

  return (
    <div className="fixed bottom-16 md:bottom-6 right-6 z-40 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-200">
      <div className="bg-bg-surface/98 backdrop-blur-md border border-border-color rounded-xl p-3 shadow-md flex items-center gap-2.5">
        {isProcessing && (
          <Loader2 size={16} className="text-accent-highlight animate-spin shrink-0" />
        )}

        {!isProcessing && statusMessage && (
          <CheckCircle2 size={16} strokeWidth={2} className="text-emerald-500 shrink-0" />
        )}

        {!isProcessing && errorMessage && (
          <AlertCircle size={16} strokeWidth={2} className="text-red-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text-primary">
            {isProcessing ? "Adding material..." : errorMessage ? "Notice" : "Material added"}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5 leading-normal break-words">
            {isProcessing ? "Saving..." : errorMessage || statusMessage}
          </p>
        </div>

        {!isProcessing && (
          <button
            onClick={onDismiss}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-bg-subtle transition-colors cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
