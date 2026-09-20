import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-frag-surface border border-frag-border rounded-lg ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 md:p-5 border-b border-frag-border">
      <div className="min-w-0">
        {title && <h3 className="text-lg font-semibold text-frag-text">{title}</h3>}
        {subtitle && <p className="text-sm text-frag-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 flex gap-2 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}