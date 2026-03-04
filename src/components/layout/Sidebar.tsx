import { motion } from 'framer-motion';
import { Clipboard, Zap, Activity, Settings, Layers } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Layers },
  { id: 'clipboard', label: 'Clipboard', icon: Clipboard },
  { id: 'macros', label: 'Macros', icon: Zap },
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <div className="w-64 bg-frag-surface border-r border-frag-border h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-frag-border">
        <h1 className="text-2xl font-bold text-frag-primary">
          Frag<span className="text-frag-accent">Desk</span>
        </h1>
        <p className="text-xs text-frag-muted mt-1">Utility Application</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

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
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-frag-border">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-frag-primary/20 flex items-center justify-center">
            <span className="text-frag-primary text-sm font-bold">FD</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-frag-text">v0.1.0</p>
            <p className="text-xs text-frag-muted">Alpha Build</p>
          </div>
        </div>
      </div>
    </div>
  );
}