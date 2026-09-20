import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { FEATURES, featureMode, type NavId } from '../../features/registry';

interface DashboardHomeProps {
  setActiveTab: (tab: NavId) => void;
}

// Accent colours are a pure-presentation concern, so they live here rather
// than in the registry (which only describes what a feature is).
const ACCENTS: Record<string, { color: string; bgColor: string }> = {
  clipboard: { color: 'text-frag-primary', bgColor: 'bg-frag-primary/10' },
  macros: { color: 'text-frag-accent', bgColor: 'bg-frag-accent/10' },
  monitor: { color: 'text-frag-success', bgColor: 'bg-frag-success/10' },
  fragments: { color: 'text-frag-primary', bgColor: 'bg-frag-primary/10' },
  community: { color: 'text-frag-accent', bgColor: 'bg-frag-accent/10' },
};

// Dashboard cards come from the registry, limited to the features people
// should reach from home (excludes the overview + app groups).
const FEATURE_GROUPS = new Set(['tools', 'system', 'community']);

interface DashboardStats {
  clipCount: number | null;
  macroCount: number | null;
  cpuUsage: number | null;
}

export default function DashboardHome({ setActiveTab }: DashboardHomeProps) {
  const dashboardFeatures = FEATURES.filter((f) => FEATURE_GROUPS.has(f.group));
  const [stats, setStats] = useState<DashboardStats>({
    clipCount: null,
    macroCount: null,
    cpuUsage: null,
  });

  useEffect(() => {
    // Each stat fetched independently so one broken/unconfigured feature
    // (e.g. clipboard monitor never started) doesn't blank out the others
    // -- a failure just leaves that card showing "--".
    invoke<{ id: number }[]>('get_clipboard_items', { limit: 1000 })
      .then((items) => setStats((s) => ({ ...s, clipCount: items.length })))
      .catch(() => setStats((s) => ({ ...s, clipCount: null })));

    invoke<{ id: string }[]>('get_macros')
      .then((macros) => setStats((s) => ({ ...s, macroCount: macros.length })))
      .catch(() => setStats((s) => ({ ...s, macroCount: null })));

    invoke<Record<string, unknown>>('get_system_stats')
      .then((data) => {
        const cpu = data.cpu_usage ?? data.cpu_usage_percent ?? data.cpu;
        setStats((s) => ({ ...s, cpuUsage: typeof cpu === 'number' ? cpu : null }));
      })
      .catch(() => setStats((s) => ({ ...s, cpuUsage: null })));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-frag-text mb-2">
          Welcome to FragDesk
        </h1>
        <p className="text-frag-muted text-lg">
          Utility and Macro aggregator designed for performance.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 md:mb-8">
        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 cursor-pointer"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
          onClick={() => setActiveTab('clipboard')}
        >
          <p className="text-frag-muted text-sm mb-1">Total Clips</p>
          <p className="text-3xl font-bold text-frag-primary">
            {stats.clipCount ?? '--'}
          </p>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 cursor-pointer"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
          onClick={() => setActiveTab('macros')}
        >
          <p className="text-frag-muted text-sm mb-1">Saved Macros</p>
          <p className="text-3xl font-bold text-frag-accent">
            {stats.macroCount ?? '--'}
          </p>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 cursor-pointer"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
          onClick={() => setActiveTab('monitor')}
        >
          <p className="text-frag-muted text-sm mb-1">CPU Usage</p>
          <p className="text-3xl font-bold text-frag-success">
            {stats.cpuUsage !== null ? `${stats.cpuUsage.toFixed(0)}%` : '--'}
          </p>
        </motion.div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 gap-4">
        <h2 className="text-2xl font-bold text-frag-text mb-4">Features</h2>

        {dashboardFeatures.map((feature, index) => {
          const Icon = feature.icon;
          const accent = ACCENTS[feature.id] ?? { color: 'text-frag-primary', bgColor: 'bg-frag-primary/10' };
          const isNew = featureMode(feature.id) === 'new';
          const isComingSoon = featureMode(feature.id) === 'coming-soon';

          return (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ x: 8 }}
              onClick={() => setActiveTab(feature.id)}
              className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 flex items-center gap-4 md:gap-6 cursor-pointer group"
            >
              <div className={`${accent.bgColor} p-3 md:p-4 rounded-lg`}>
                <Icon className={accent.color} size={32} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-frag-text mb-1 truncate">
                  {feature.label}
                </h3>
                <p className="text-frag-muted">
                  {feature.description}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {isComingSoon ? (
                  <span className="px-3 py-1 bg-frag-border/40 text-frag-muted text-sm rounded-full">
                    Coming soon
                  </span>
                ) : isNew ? (
                  <span className="px-3 py-1 bg-frag-accent/15 text-frag-accent text-sm rounded-full">
                    New
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-frag-success/20 text-frag-success text-sm rounded-full">
                    Available
                  </span>
                )}
                <ArrowRight className="text-frag-muted group-hover:text-frag-primary transition-colors" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}