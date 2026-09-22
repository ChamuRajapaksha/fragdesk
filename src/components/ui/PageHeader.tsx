import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  accent?: ReactNode;
}

/**
 * One heading scale app-wide (`text-3xl font-bold text-frag-text`), with an
 * optional accent icon on the left and a slot for page-level actions.
 */
export default function PageHeader({ title, subtitle, actions, accent }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-y-3 flex-wrap mb-6 md:mb-8">
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        {accent && (
          <div className="hidden sm:flex w-12 h-12 rounded-xl bg-frag-primary/10 text-frag-primary items-center justify-center shrink-0">
            {accent}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-frag-text">{title}</h1>
          {subtitle && <p className="text-frag-muted mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex gap-3 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}