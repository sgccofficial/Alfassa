import React from "react";
import { Modal } from "./Modal";
import { WarningTriangle } from "iconoir-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} aria-label={title}>
      <div className="p-6 space-y-4">
        <h3 className="text-base font-bold text-text-primary border-b border-border-color pb-3">
          {title}
        </h3>
        <div className="flex items-start gap-3">
          {isDestructive && (
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 shrink-0">
              <WarningTriangle size={20} />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-color">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-secondary transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
              isDestructive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-text-primary text-bg-surface hover:opacity-90"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
