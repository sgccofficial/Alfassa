import React from "react";
import { cn } from "../utils/cn";

export interface ProcessingIndicatorProps {
  label?: string;
  className?: string;
  size?: "xs" | "sm" | "base";
}

/**
 * Shared ProcessingIndicator Component (Sprint 6)
 *
 * Implements a restrained, subtle, slow, continuous shine/sweep animation
 * across the processing text without glowing borders, card pulsing, or flashing.
 * Respects prefers-reduced-motion automatically.
 */
export function ProcessingIndicator({
  label = "Processing",
  className,
  size = "xs",
}: ProcessingIndicatorProps) {
  const sizeClass =
    size === "xs" ? "text-[11px]" : size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium select-none animate-text-sweep tracking-normal",
        sizeClass,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {label}
    </span>
  );
}
