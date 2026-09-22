import { X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mb-4 bg-frag-danger/10 border border-frag-danger/40 text-frag-danger text-sm rounded-lg px-4 py-2 flex items-start justify-between gap-3 break-words"
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 mt-0.5 hover:text-frag-text transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}