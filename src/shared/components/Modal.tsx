import React, { useEffect, useCallback } from "react";
import { Xmark } from "iconoir-react";
import { cn } from "../utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  "aria-label"?: string;
}

/**
 * Universal Modal / Dialog Surface for Alfassa.
 * Enforces strict 4-layer separation:
 * 1. Home screen (underneath)
 * 2. Backdrop/overlay (fixed, dimmed, blurred)
 * 3. Modal surface (opaque, elevated, bordered card)
 * 4. Modal content (crisp, high-contrast controls)
 */
export function Modal({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  "aria-label": ariaLabel = "Dialog",
}: ModalProps) {
  // Close on Escape key press
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent background scrolling while modal is open
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Layer 2: Backdrop / Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/60 dark:bg-black/75 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Layer 3 & 4: Centering Container & Solid Modal Surface */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center pointer-events-none">
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn(
            // Layer 3: Completely solid, opaque surface strictly elevated above the backdrop
            "pointer-events-auto relative w-full rounded-2xl",
            "bg-bg-surface text-text-primary",
            "border border-border-color",
            "shadow-xl ring-1 ring-black/5 dark:ring-white/10",
            "p-5 sm:p-6 text-left isolate",
            "animate-in zoom-in-95 fade-in duration-150",
            className
          )}
        >
          {showCloseButton && (
            <button
              onClick={onClose}
              type="button"
              className="absolute top-5 right-5 p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-highlight cursor-pointer"
              aria-label="Close dialog"
            >
              <Xmark size={18} strokeWidth={1.75} />
            </button>
          )}

          {/* Layer 4: Modal Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
