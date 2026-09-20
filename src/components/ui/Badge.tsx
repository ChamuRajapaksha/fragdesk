import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'muted' | 'accent';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-frag-success/20 text-frag-success',
  warning: 'bg-frag-warning/20 text-frag-warning',
  danger: 'bg-frag-danger/20 text-frag-danger',
  muted: 'bg-frag-border/40 text-frag-muted',
  accent: 'bg-frag-accent/15 text-frag-accent',
};

export default function Badge({
  variant = 'muted',
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span className={`px-3 py-1 text-sm rounded-full ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  );
}