import type { ReactNode } from 'react';

export default function TagChip({ children }: { children: ReactNode }) {
  return (
    <span className="px-2 py-0.5 text-xs rounded bg-frag-border/40 text-frag-muted">
      {children}
    </span>
  );
}