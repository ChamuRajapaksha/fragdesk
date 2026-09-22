interface LoadingStateProps {
  rows?: number;
  label?: string;
}

/** Skeleton loading placeholder (theme-token based, no plain text). */
export default function LoadingState({ rows = 1, label = 'Loading...' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className="space-y-3"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse bg-frag-surface border border-frag-border rounded-lg p-4 md:p-5">
          <div className="h-3 rounded bg-frag-border/60 w-24 mb-3" />
          <div className="h-6 rounded bg-frag-border/60 w-32" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}