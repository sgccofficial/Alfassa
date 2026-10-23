import * as React from "react"
import { cn } from "../utils/cn"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "secondary" | "danger" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap text-xs sm:text-sm font-semibold ring-offset-bg-main transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-highlight/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed",
          {
            "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 shadow-xs active:translate-y-px rounded-lg": variant === "default",
            "bg-bg-subtle text-text-primary hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-border-color shadow-2xs rounded-lg": variant === "secondary",
            "border border-border-color bg-transparent hover:bg-bg-subtle text-text-primary rounded-lg": variant === "outline",
            "hover:bg-bg-subtle text-text-secondary hover:text-text-primary rounded-lg": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 shadow-xs rounded-lg": variant === "danger",
            "text-text-primary underline-offset-4 hover:underline p-0 h-auto font-medium": variant === "link",
            
            "h-9 px-3.5 py-1.5": size === "default",
            "h-8 px-2.5 text-xs rounded-md": size === "sm",
            "h-10 px-5 text-sm rounded-lg": size === "lg",
            "h-9 w-9 p-0 rounded-lg": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
