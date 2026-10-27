import { QuestionMark } from "iconoir-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center fade-in">
      <div className="w-12 h-12 bg-bg-subtle border border-border-color rounded-xl flex items-center justify-center text-text-muted mb-4 shadow-2xs">
        <QuestionMark size={24} strokeWidth={1.75} />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-text-primary mb-1">
        {title}
      </h2>
      <p className="text-xs text-text-muted max-w-sm">
        This feature is under construction. It will be available in a future sprint.
      </p>
    </div>
  );
}
