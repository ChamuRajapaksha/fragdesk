import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clipboard, Zap, Activity, ArrowRight, Layers, Users } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface DashboardHomeProps {
  setActiveTab: (tab: string) => void;
}

const features = [
  {
    id: 'clipboard',
    title: 'Clipboard Manager',
    description: 'Store and search your clipboard history with lightning-fast access',
    icon: Clipboard,
    color: 'text-frag-primary',
    bgColor: 'bg-frag-primary/10',
  },
  {
    id: 'macros',
    title: 'Macro System',
    description: 'Record, save, and playback keyboard & mouse macros with precision',
    icon: Zap,
    color: 'text-frag-accent',
    bgColor: 'bg-frag-accent/10',
  },
  {
    id: 'monitor',
    title: 'System Monitor',
    description: 'Real-time CPU, RAM, and GPU monitoring with detailed graphs',
    icon: Activity,
    color: 'text-frag-success',
    bgColor: 'bg-frag-success/10',
  },
  {
    id: 'fragments',
    title: 'Fragment Library',
    description: 'Browse curated macros and starter content bundled with FragDesk',
    icon: Layers,
    color: 'text-frag-primary',
    bgColor: 'bg-frag-primary/10',
  },
  {
    id: 'community',
    title: 'Community Library',
    description: 'Discover and share fragments with other FragDesk users',
    icon: Users,
    color: 'text-frag-accent',
    bgColor: 'bg-frag-accent/10',
  },
];

interface DashboardStats {
  clipCount: number | null;
  macroCount: number | null;
  cpuUsage: number | null;
}

export default function DashboardHome({ setActiveTab }: DashboardHomeProps) {
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

    // NOTE: field name assumed -- SystemStats' actual shape wasn't visible
    // when this was written. Checks a couple of likely names; if your
    // monitor.rs uses something else (e.g. `cpu_percent`), swap it in below.
    invoke<Record<string, unknown>>('get_system_stats')
      .then((data) => {
        const cpu = data.cpu_usage ?? data.cpu_usage_percent ?? data.cpu;
        setStats((s) => ({ ...s, cpuUsage: typeof cpu === 'number' ? cpu : null }));
      })
      .catch(() => setStats((s) => ({ ...s, cpuUsage: null })));
  }, []);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-frag-text mb-2">
          Welcome to FragDesk
        </h1>
        <p className="text-frag-muted text-lg">
          Your all-in-one application for productivity and performance
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6 cursor-pointer"
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
          className="bg-frag-surface border border-frag-border rounded-lg p-6 cursor-pointer"
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
          className="bg-frag-surface border border-frag-border rounded-lg p-6 cursor-pointer"
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
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-frag-text mb-4">Features</h2>

        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ x: 8 }}
              onClick={() => setActiveTab(feature.id)}
              className="bg-frag-surface border border-frag-border rounded-lg p-6 flex items-center gap-6 cursor-pointer group"
            >
              <div className={`${feature.bgColor} p-4 rounded-lg`}>
                <Icon className={feature.color} size={32} />
              </div>

              <div className="flex-1">
                <h3 className="text-xl font-semibold text-frag-text mb-1">
                  {feature.title}
                </h3>
                <p className="text-frag-muted">
                  {feature.description}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-frag-success/20 text-frag-success text-sm rounded-full">
                  Available
                </span>
                <ArrowRight className="text-frag-muted group-hover:text-frag-primary transition-colors" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}