import * as React from "react"
import { cn } from "../utils/cn"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-border-color bg-bg-surface px-3 py-1.5 text-xs sm:text-sm text-text-primary placeholder:text-text-secondary/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-highlight focus-visible:border-accent-highlight disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"
export { Input }
