import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X, type LucideIcon } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLE: Record<ToastVariant, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-frag-success' },
  error: { icon: AlertCircle, className: 'text-frag-danger' },
  info: { icon: Info, className: 'text-frag-primary' },
};

const AUTO_DISMISS_MS = 3500;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((prev) => [...prev, { id, variant, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 items-end"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const { icon: Icon, className } = TOAST_STYLE[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="bg-frag-surface border border-frag-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm"
              >
                <Icon size={18} className={`shrink-0 ${className}`} />
                <span className="text-sm text-frag-text break-words">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="text-frag-muted hover:text-frag-text shrink-0 transition-colors"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}