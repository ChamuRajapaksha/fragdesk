import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4 text-frag-muted">
      {Icon && (
        <div className="mx-auto w-12 h-12 rounded-lg bg-frag-border/40 flex items-center justify-center mb-3">
          <Icon size={24} className="text-frag-muted" />
        </div>
      )}
      <p className="text-frag-text font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}