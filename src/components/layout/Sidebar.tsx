import { motion } from 'framer-motion';
import { useAuth } from '../../community/useAuth';
import { isSupabaseConfigured } from '../../community/supabaseClient';
import { FEATURES_BY_GROUP, featureMode, type NavId } from '../../features/registry';

interface SidebarProps {
  activeTab: NavId;
  setActiveTab: (tab: NavId) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { user, loading: authLoading } = useAuth();

  return (
    <div className="w-60 md:w-64 bg-frag-surface border-r border-frag-border h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 md:p-6 border-b border-frag-border">
        <h1 className="text-2xl font-bold text-frag-primary">
          Frag<span className="text-frag-accent">Desk</span>
        </h1>
        <p className="text-xs text-frag-muted mt-1">Utility Application</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto space-y-4">
        {FEATURES_BY_GROUP.map((section) => (
          <div key={section.group}>
            <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-frag-muted">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.features.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isNew = featureMode(item.id) === 'new';

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-all duration-200 relative
                      ${isActive
                        ? 'text-frag-primary bg-frag-primary/10'
                        : 'text-frag-muted hover:text-frag-text hover:bg-frag-bg'
                      }
                    `}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute left-0 top-0 bottom-0 w-1 bg-frag-primary rounded-r"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    <Icon size={20} className="shrink-0" />
                    <span className="font-medium min-w-0 truncate">{item.label}</span>
                    {isNew && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-frag-accent/15 text-frag-accent">
                        New
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Auth status */}
      {isSupabaseConfigured && !authLoading && (
        <button
          onClick={() => setActiveTab('community')}
          className="w-[calc(100%-2rem)] mx-4 mb-2 px-3 py-2 rounded-lg bg-frag-bg hover:bg-frag-bg/70 border border-frag-border text-left transition-colors"
        >
          {user ? (
            <>
              <p className="text-xs text-frag-muted">Signed in as</p>
              <p className="text-sm text-frag-text truncate">{user.email}</p>
            </>
          ) : (
            <p className="text-sm text-frag-primary">Sign in to share fragments</p>
          )}
        </button>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-frag-border space-y-2">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-frag-primary/20 flex items-center justify-center">
            <span className="text-frag-primary text-sm font-bold">FD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-frag-text">v0.1.0</p>
            <p className="text-xs truncate text-frag-muted">Alpha Build</p>
          </div>
        </div>
        <p className="text-xs text-frag-muted px-4">
          Press <span className="font-mono text-frag-primary">Ctrl+K</span> to search
        </p>
      </div>
    </div>
  );
}