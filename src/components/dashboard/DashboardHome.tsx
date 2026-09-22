import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Clipboard, Command, Save, Sparkles, X, Zap, type LucideIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Badge, Button, StatCard, useToast } from '../ui';
import {
  FEATURES_BY_GROUP,
  featureMode,
  type FeatureGroup,
  type NavId,
} from '../../features/registry';

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

// Dashboard sections come from the registry, limited to groups people should
// reach from home (excludes the overview + app groups).
const FEATURE_GROUPS = new Set<FeatureGroup>(['tools', 'system', 'community']);

interface DashboardStats {
  clipCount: number | null;
  macroCount: number | null;
  cpuUsage: number | null;
}

// The theme stores colours as RGB triplets ("0 217 255"); resolve the current
// value to a concrete rgb() so chart strokes track the active palette.
function resolveColor(variable: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  const parts = raw.split(/\s+/).map((p) => Number(p));
  if (parts.length === 3 && parts.every((p) => !Number.isNaN(p))) {
    return `rgb(${parts.join(', ')})`;
  }
  return raw || 'currentColor';
}

function Sparkline({
  id,
  color,
  data,
}: {
  id: string;
  color: string;
  data: { v: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Deterministic "history" so the mini charts don't jitter between renders.
function makeSeries(seed: number, current: number): { v: number }[] {
  const points: { v: number }[] = [];
  let x = seed;
  for (let i = 0; i < 20; i++) {
    x = (x * 9301 + 49297) % 233280;
    const drift = (x / 233280) * 18 - 9;
    points.push({ v: Math.max(0, current + drift) });
  }
  return points;
}

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay: i * 0.05 },
  }),
};

const SPOTLIGHT_DISMISS_KEY = 'fragdesk:spotlight-dismissed';

function StatCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading statistics"
      className="animate-pulse bg-frag-surface border border-frag-border rounded-lg p-4 md:p-5"
    >
      <div className="h-3 rounded bg-frag-border/60 w-24" />
      <div className="mt-3 h-7 rounded bg-frag-border/60 w-16" />
    </div>
  );
}

export default function DashboardHome({ setActiveTab }: DashboardHomeProps) {
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    clipCount: null,
    macroCount: null,
    cpuUsage: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const pendingRef = useRef(0);

  const sections = useMemo(
    () => FEATURES_BY_GROUP.filter((section) => FEATURE_GROUPS.has(section.group)),
    [],
  );

  const newFeatures = useMemo(
    () => sections.flatMap((section) => section.features).filter((f) => featureMode(f.id) === 'new'),
    [sections],
  );

  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SPOTLIGHT_DISMISS_KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  const spotlight = useMemo(
    () => newFeatures.filter((f) => !dismissed.includes(f.id)),
    [newFeatures, dismissed],
  );

  const dismissSpotlight = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...prev, id];
      localStorage.setItem(SPOTLIGHT_DISMISS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    // Each stat fetched independently so one broken/unconfigured feature
    // (e.g. clipboard monitor never started) doesn't blank out the others
    // -- a failure just leaves that card showing "--".
    const settle = () => {
      pendingRef.current += 1;
      if (pendingRef.current >= 3) setStatsLoading(false);
    };

    invoke<{ id: number }[]>('get_clipboard_items', { limit: 1000 })
      .then((items) => setStats((s) => ({ ...s, clipCount: items.length })))
      .catch(() => setStats((s) => ({ ...s, clipCount: null })))
      .finally(settle);

    invoke<{ id: string }[]>('get_macros')
      .then((macros) => setStats((s) => ({ ...s, macroCount: macros.length })))
      .catch(() => setStats((s) => ({ ...s, macroCount: null })))
      .finally(settle);

    invoke<Record<string, unknown>>('get_system_stats')
      .then((data) => {
        const cpu = data.cpu_usage ?? data.cpu_usage_percent ?? data.cpu;
        setStats((s) => ({ ...s, cpuUsage: typeof cpu === 'number' ? cpu : null }));
      })
      .catch(() => setStats((s) => ({ ...s, cpuUsage: null })))
      .finally(settle);
  }, []);

  const clips = stats.clipCount ?? 0;
  const macros = stats.macroCount ?? 0;
  const cpu = stats.cpuUsage ?? 0;

  const clipSeries = useMemo(() => makeSeries(7, clips), [clips]);
  const macroSeries = useMemo(() => makeSeries(23, macros), [macros]);
  const cpuSeries = useMemo(() => makeSeries(41, cpu), [cpu]);

  const clipColor = useMemo(() => resolveColor('--frag-primary'), [stats]);
  const macroColor = useMemo(() => resolveColor('--frag-accent'), [stats]);
  const cpuColor = useMemo(() => resolveColor('--frag-success'), [stats]);

  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const handleStartRecording = useCallback(async () => {
    try {
      await invoke('start_macro_recording');
      toast('Recording started — stop it inside the Macros page.', 'success');
      setActiveTab('macros');
    } catch {
      toast('Could not start recording.', 'error');
    }
  }, [setActiveTab, toast]);

  const handleSaveCurrentClip = useCallback(async () => {
    try {
      const text = await invoke<string>('get_current_clipboard');
      await invoke('save_clipboard_text', { text });
      setStats((s) => ({ ...s, clipCount: (s.clipCount ?? 0) + 1 }));
      toast('Current clipboard saved to history.', 'success');
    } catch {
      toast('Could not read the current clipboard.', 'error');
    }
  }, [toast]);

  // Stable navigation handler so the StatCard / spotlight / grid children
  // don't receive a fresh closure on every parent render.
  const navigate = useCallback((tab: NavId) => setActiveTab(tab), [setActiveTab]);

  return (
    <div className="min-h-full bg-frag-bg text-frag-text">
      {/* Welcome row */}
      <div className="mb-6 md:mb-8 flex flex-wrap items-start justify-between gap-y-4 gap-x-6">
        <div>
          <p className="text-sm text-frag-muted">{today}</p>
          <h1 className="text-3xl md:text-4xl font-bold text-frag-text mt-1">
            Welcome to FragDesk
          </h1>
          <p className="text-frag-muted mt-1 text-lg">
            Utility and Macro aggregator designed for performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button onClick={handleStartRecording}>
            <Zap size={16} />
            Start Recording
          </Button>
          <Button variant="secondary" onClick={handleSaveCurrentClip}>
            <Save size={16} />
            Save Current Clip
          </Button>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-frag-surface border border-frag-border text-frag-muted text-sm font-medium"
            aria-label="Open the command palette"
          >
            <Command size={14} />
            Ctrl+K
          </span>
        </div>
      </div>

      {/* Stats row with sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 md:mb-10">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={Clipboard as LucideIcon}
              label="Total Clips"
              value={stats.clipCount ?? '--'}
              accent="text-frag-primary"
              onClick={() => navigate('clipboard')}
              sparkline={
                <Sparkline id="clip" color={clipColor} data={clipSeries} />
              }
            />
            <StatCard
              icon={Zap}
              label="Saved Macros"
              value={stats.macroCount ?? '--'}
              accent="text-frag-accent"
              onClick={() => navigate('macros')}
              sparkline={
                <Sparkline id="macro" color={macroColor} data={macroSeries} />
              }
            />
            <StatCard
              icon={Activity}
              label="CPU Usage"
              value={stats.cpuUsage !== null ? `${stats.cpuUsage.toFixed(0)}%` : '--'}
              accent="text-frag-success"
              onClick={() => navigate('monitor')}
              sparkline={
                <Sparkline id="cpu" color={cpuColor} data={cpuSeries} />
              }
            />
          </>
        )}
      </div>

      {/* New-feature spotlight */}
      {spotlight.length > 0 && (
        <div className="mb-8 space-y-3">
          {spotlight.map((feature, index) => {
            const Icon = feature.icon;
            const accent =
              ACCENTS[feature.id] ?? {
                color: 'text-frag-primary',
                bgColor: 'bg-frag-primary/10',
              };
            return (
              <motion.div
                key={feature.id}
                custom={index}
                variants={CARD_VARIANTS}
                initial="hidden"
                animate="show"
                className="relative flex items-center gap-4 rounded-lg border border-frag-accent/30 bg-gradient-to-r from-frag-accent/10 via-frag-accent/5 to-transparent p-4 md:p-5"
              >
                <div className={`${accent.bgColor} p-3 rounded-lg shrink-0`}>
                  <Icon className={accent.color} size={26} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-frag-accent flex items-center gap-1.5">
                    <Sparkles size={13} />
                    New feature
                  </p>
                  <h3 className="text-lg font-semibold text-frag-text mt-0.5">
                    {feature.label}
                  </h3>
                  <p className="text-frag-muted text-sm mt-0.5 line-clamp-2">
                    {feature.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    className="whitespace-nowrap"
                    onClick={() => navigate(feature.id)}
                  >
                    Explore
                    <ArrowRight size={16} />
                  </Button>
                  <button
                    type="button"
                    onClick={() => dismissSpotlight(feature.id)}
                    aria-label={`Dismiss ${feature.label} announcement`}
                    className="p-2 rounded-lg text-frag-muted hover:text-frag-text hover:bg-frag-bg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Grouped feature grid */}
      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.group}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-frag-muted mb-3">
              {section.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.features.map((feature, index) => {
                const Icon = feature.icon;
                const accent =
                  ACCENTS[feature.id] ?? {
                    color: 'text-frag-primary',
                    bgColor: 'bg-frag-primary/10',
                  };
                const mode = featureMode(feature.id);
                const modeBadge =
                  mode === 'coming-soon' ? (
                    <Badge variant="muted">Coming soon</Badge>
                  ) : mode === 'new' ? (
                    <Badge variant="accent">New</Badge>
                  ) : (
                    <Badge variant="success">Available</Badge>
                  );

                return (
                  <motion.button
                    key={feature.id}
                    type="button"
                    custom={index}
                    variants={CARD_VARIANTS}
                    initial="hidden"
                    animate="show"
                    whileHover={{ x: 6 }}
                    onClick={() => navigate(feature.id)}
                    className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-5 flex items-center gap-4 md:gap-5 text-left cursor-pointer group hover:border-frag-primary/40 transition-colors"
                  >
                    <div className={`${accent.bgColor} p-3 rounded-lg shrink-0`}>
                      <Icon className={accent.color} size={28} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-frag-text truncate">
                        {feature.label}
                      </h3>
                      <p className="text-frag-muted text-sm mt-0.5 line-clamp-2">
                        {feature.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {modeBadge}
                      <ArrowRight className="text-frag-muted group-hover:text-frag-primary transition-colors shrink-0" size={18} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}