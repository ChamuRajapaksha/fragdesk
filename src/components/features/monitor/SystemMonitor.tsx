import { useState, useEffect, useRef, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Cpu, MemoryStick, Activity, Bell, X, LayoutGrid, ArrowUp, ArrowDown, Eye, EyeOff, Gauge } from 'lucide-react';
import { extractErrorMessage, isSupabaseConfigured, supabase } from '../../../community/supabaseClient';
import { useAuth } from '../../../community/useAuth';

interface SystemMonitorProps {
  setActiveTab: (tab: string) => void;
}

interface SystemStats {
  cpu_usage: number;
  cpu_count: number;
  ram_used: number;
  ram_total: number;
  ram_percent: number;
}

interface DataPoint {
  time: string;
  cpu: number;
  ram: number;
}

interface AlertRule {
  id: string;
  name: string;
  metric: 'cpu' | 'ram';
  comparison: 'above' | 'below';
  threshold: number;
  enabled: boolean;
  source: string | null;
  created_at: number;
}

interface FiredAlert {
  ruleId: string;
  message: string;
}

interface WidgetConfig {
  id: string;
  visible: boolean;
}

interface RtssAppSummary {
  process_id: number;
  name: string;
}

interface FpsStats {
  current_fps: number;
  avg_fps: number;
  one_percent_low_fps: number;
  sample_count: number;
}

const WIDGET_LABELS: Record<string, string> = {
  stats: 'Stats Cards (CPU, RAM, Status)',
  alerts: 'Alert Rules Panel',
  cpu_graph: 'CPU Usage Graph',
  ram_graph: 'RAM Usage Graph',
  fps: 'FPS / 1% Lows (via RTSS)',
};

export default function SystemMonitor({ setActiveTab }: SystemMonitorProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleMetric, setRuleMetric] = useState<'cpu' | 'ram'>('cpu');
  const [ruleComparison, setRuleComparison] = useState<'above' | 'below'>('above');
  const [ruleThreshold, setRuleThreshold] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [firedAlerts, setFiredAlerts] = useState<FiredAlert[]>([]);
  const [sharingRuleId, setSharingRuleId] = useState<string | null>(null);
  const [sharedRuleIds, setSharedRuleIds] = useState<Set<string>>(new Set());

  const [layout, setLayout] = useState<WidgetConfig[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);
  const [sharingLayout, setSharingLayout] = useState(false);
  const [layoutShared, setLayoutShared] = useState(false);
  const [layoutNameDraft, setLayoutNameDraft] = useState('');

  // FPS / 1% lows tracking
  const [rtssApps, setRtssApps] = useState<RtssAppSummary[]>([]);
  const [rtssError, setRtssError] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [fpsStats, setFpsStats] = useState<FpsStats | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);

  const triggeredRef = useRef<Set<string>>(new Set());
  const rulesRef = useRef<AlertRule[]>([]);

  useEffect(() => {
    loadStats();
    loadRules();
    loadLayout();

    setIsMonitoring(true);
    const interval = setInterval(() => {
      loadStats();
      loadFpsStats();
    }, 1000);

    return () => {
      clearInterval(interval);
      setIsMonitoring(false);
    };
  }, []);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  const loadRules = async () => {
    try {
      const result = await invoke<AlertRule[]>('get_alert_rules');
      setRules(result);
    } catch (err) {
      console.error('Failed to load alert rules:', err);
    }
  };

  const loadLayout = async () => {
    try {
      const result = await invoke<WidgetConfig[]>('get_monitor_layout');
      setLayout(result);
    } catch (err) {
      console.error('Failed to load monitor layout:', err);
    }
  };

  async function loadFpsStats() {
    try {
      const stats = await invoke<FpsStats | null>('get_fps_stats');
      setFpsStats(stats);
    } catch (err) {
      console.error('Failed to load FPS stats:', err);
    }
  }

  async function refreshRtssApps() {
    setLoadingApps(true);
    setRtssError(null);
    try {
      const apps = await invoke<RtssAppSummary[]>('list_rtss_apps');
      setRtssApps(apps);
    } catch (err) {
      setRtssError(extractErrorMessage(err));
      setRtssApps([]);
    } finally {
      setLoadingApps(false);
    }
  }

  async function handleOpenAppPicker() {
    setShowAppPicker(true);
    await refreshRtssApps();
  }

  async function handleSelectApp(app: RtssAppSummary) {
    try {
      await invoke('set_fps_tracking_target', { processId: app.process_id });
      setSelectedPid(app.process_id);
      setSelectedName(app.name);
      setShowAppPicker(false);
      setFpsStats(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleStopTracking() {
    try {
      await invoke('set_fps_tracking_target', { processId: null });
      setSelectedPid(null);
      setSelectedName(null);
      setFpsStats(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function persistLayout(newLayout: WidgetConfig[]) {
    setLayout(newLayout);
    try {
      const applied = await invoke<WidgetConfig[]>('set_monitor_layout', { widgets: newLayout });
      setLayout(applied);
    } catch (err) {
      setError(extractErrorMessage(err));
      await loadLayout();
    }
  }

  function moveWidget(id: string, direction: -1 | 1) {
    const idx = layout.findIndex((w) => w.id === id);
    const swapWith = idx + direction;
    if (idx === -1 || swapWith < 0 || swapWith >= layout.length) return;
    const next = [...layout];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    void persistLayout(next);
  }

  function toggleWidgetVisibility(id: string) {
    const next = layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
    void persistLayout(next);
  }

  async function resetLayout() {
    try {
      const defaults: WidgetConfig[] = [
        { id: 'stats', visible: true },
        { id: 'alerts', visible: true },
        { id: 'cpu_graph', visible: true },
        { id: 'ram_graph', visible: true },
        { id: 'fps', visible: true },
      ];
      const applied = await invoke<WidgetConfig[]>('set_monitor_layout', { widgets: defaults });
      setLayout(applied);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleShareLayout() {
    if (!isSupabaseConfigured) {
      setError("Community sharing isn't set up yet — add Supabase credentials to .env first.");
      return;
    }
    if (!user) {
      setActiveTab('community');
      return;
    }
    if (!supabase) return;
    const name = layoutNameDraft.trim();
    if (!name) return;

    setSharingLayout(true);
    setError(null);
    try {
      const json = await invoke<string>('export_monitor_layout_json', { name });
      const fragment = JSON.parse(json) as {
        fragment_type: string;
        name: string;
        tags: string[];
        format_version: number;
        payload: unknown;
      };

      const { error: insertError } = await supabase.from('fragments').insert({
        fragment_type: fragment.fragment_type,
        name: fragment.name,
        tags: fragment.tags,
        format_version: fragment.format_version,
        payload: fragment.payload,
        submitted_by: user.id,
      });

      if (insertError) throw insertError;
      setLayoutShared(true);
      setLayoutNameDraft('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSharingLayout(false);
    }
  }

  function evaluateRules(currentStats: SystemStats) {
    const values: Record<'cpu' | 'ram', number> = {
      cpu: currentStats.cpu_usage,
      ram: currentStats.ram_percent,
    };

    for (const rule of rulesRef.current) {
      if (!rule.enabled) continue;
      const value = values[rule.metric];
      const isTriggered =
        rule.comparison === 'above' ? value > rule.threshold : value < rule.threshold;
      const wasTriggered = triggeredRef.current.has(rule.id);

      if (isTriggered && !wasTriggered) {
        triggeredRef.current.add(rule.id);
        const metricLabel = rule.metric === 'cpu' ? 'CPU' : 'RAM';
        setFiredAlerts((prev) => [
          ...prev,
          {
            ruleId: rule.id,
            message: `${rule.name}: ${metricLabel} is ${rule.comparison} ${rule.threshold}% (currently ${value.toFixed(1)}%)`,
          },
        ]);
      } else if (!isTriggered && wasTriggered) {
        triggeredRef.current.delete(rule.id);
      }
    }
  }

  const loadStats = async () => {
    try {
      const result = await invoke<SystemStats>('get_system_stats');
      setStats(result);
      evaluateRules(result);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      setHistory(prev => {
        const newHistory = [
          ...prev,
          { time: timeStr, cpu: result.cpu_usage, ram: result.ram_percent }
        ];
        return newHistory.slice(-60);
      });
    } catch (error) {
      console.error('Failed to get system stats:', error);
    }
  };

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim()) return;
    try {
      await invoke('create_alert_rule', {
        name: ruleName.trim(),
        metric: ruleMetric,
        comparison: ruleComparison,
        threshold: ruleThreshold,
      });
      setRuleName('');
      setShowRuleForm(false);
      await loadRules();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await invoke('delete_alert_rule', { id });
      triggeredRef.current.delete(id);
      await loadRules();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleToggleRule(id: string) {
    try {
      await invoke('toggle_alert_rule', { id });
      await loadRules();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleShareRule(rule: AlertRule) {
    if (!isSupabaseConfigured) {
      setError("Community sharing isn't set up yet — add Supabase credentials to .env first.");
      return;
    }
    if (!user) {
      setActiveTab('community');
      return;
    }
    if (!supabase) return;

    setSharingRuleId(rule.id);
    setError(null);
    try {
      const json = await invoke<string>('export_alert_rule_json', { id: rule.id });
      const fragment = JSON.parse(json) as {
        fragment_type: string;
        name: string;
        tags: string[];
        format_version: number;
        payload: unknown;
      };

      const { error: insertError } = await supabase.from('fragments').insert({
        fragment_type: fragment.fragment_type,
        name: fragment.name,
        tags: fragment.tags,
        format_version: fragment.format_version,
        payload: fragment.payload,
        submitted_by: user.id,
      });

      if (insertError) throw insertError;
      setSharedRuleIds((prev) => new Set(prev).add(rule.id));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSharingRuleId(null);
    }
  }

  function dismissAlert(ruleId: string) {
    setFiredAlerts((prev) => {
      const idx = prev.findIndex((a) => a.ruleId === ruleId);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  }

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-frag-muted">Loading system stats...</div>
      </div>
    );
  }

  const widgetContent: Record<string, ReactNode> = {
    stats: (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-frag-primary/10 rounded-lg">
                <Cpu className="text-frag-primary" size={24} />
              </div>
              <div>
                <p className="text-frag-muted text-sm">CPU Usage</p>
                <p className="text-xs text-frag-muted">{stats.cpu_count} cores</p>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold text-frag-primary">{stats.cpu_usage.toFixed(1)}</p>
            <p className="text-frag-muted text-xl mb-1">%</p>
          </div>
          <div className="mt-4 h-2 bg-frag-bg rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-frag-primary"
              initial={{ width: 0 }}
              animate={{ width: `${stats.cpu_usage}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-frag-accent/10 rounded-lg">
                <MemoryStick className="text-frag-accent" size={24} />
              </div>
              <div>
                <p className="text-frag-muted text-sm">RAM Usage</p>
                <p className="text-xs text-frag-muted">
                  {formatBytes(stats.ram_used)} / {formatBytes(stats.ram_total)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold text-frag-accent">{stats.ram_percent.toFixed(1)}</p>
            <p className="text-frag-muted text-xl mb-1">%</p>
          </div>
          <div className="mt-4 h-2 bg-frag-bg rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-frag-accent"
              initial={{ width: 0 }}
              animate={{ width: `${stats.ram_percent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-frag-success/10 rounded-lg">
                <Activity className="text-frag-success" size={24} />
              </div>
              <div>
                <p className="text-frag-muted text-sm">Monitoring</p>
                <p className="text-xs text-frag-muted">Update every 1s</p>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-frag-success">
              {isMonitoring ? 'Active' : 'Paused'}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-xs text-frag-muted">{history.length} data points collected</p>
          </div>
        </motion.div>
      </div>
    ),

    alerts: (
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-frag-text flex items-center gap-2">
            <Bell className="text-frag-primary" size={20} />
            Alert Rules
          </h3>
          <button
            onClick={() => setShowRuleForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-frag-primary text-frag-bg text-sm font-semibold hover:bg-frag-primary/90"
          >
            {showRuleForm ? 'Cancel' : '+ Add Rule'}
          </button>
        </div>

        {showRuleForm && (
          <form onSubmit={handleCreateRule} className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-frag-border">
            <div>
              <label className="text-xs text-frag-muted block mb-1">Name</label>
              <input
                type="text"
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. High CPU warning"
                className="bg-frag-bg border border-frag-border rounded-lg px-3 py-1.5 text-sm text-frag-text focus:outline-none focus:border-frag-primary"
              />
            </div>
            <div>
              <label className="text-xs text-frag-muted block mb-1">Metric</label>
              <select
                value={ruleMetric}
                onChange={(e) => setRuleMetric(e.target.value as 'cpu' | 'ram')}
                className="bg-frag-bg border border-frag-border rounded-lg px-3 py-1.5 text-sm text-frag-text"
              >
                <option value="cpu">CPU</option>
                <option value="ram">RAM</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-frag-muted block mb-1">Condition</label>
              <select
                value={ruleComparison}
                onChange={(e) => setRuleComparison(e.target.value as 'above' | 'below')}
                className="bg-frag-bg border border-frag-border rounded-lg px-3 py-1.5 text-sm text-frag-text"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-frag-muted block mb-1">Threshold %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={ruleThreshold}
                onChange={(e) => setRuleThreshold(Number(e.target.value))}
                className="bg-frag-bg border border-frag-border rounded-lg px-3 py-1.5 text-sm text-frag-text w-24"
              />
            </div>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-frag-success text-frag-bg text-sm font-semibold">
              Create
            </button>
          </form>
        )}

        {rules.length === 0 ? (
          <p className="text-sm text-frag-muted">No alert rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between bg-frag-bg border border-frag-border rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${rule.enabled ? 'bg-frag-success' : 'bg-frag-border'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <div>
                    <p className="text-sm text-frag-text font-medium">{rule.name}</p>
                    <p className="text-xs text-frag-muted">
                      {rule.metric.toUpperCase()} {rule.comparison} {rule.threshold}%
                      {rule.source === 'community' && <span className="ml-2 text-frag-accent">from community</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sharedRuleIds.has(rule.id) ? (
                    <span className="text-xs text-frag-success">Shared ✓</span>
                  ) : (
                    <button
                      onClick={() => handleShareRule(rule)}
                      disabled={sharingRuleId === rule.id}
                      className="text-xs px-2 py-1 rounded-lg bg-frag-primary/10 text-frag-primary hover:bg-frag-primary/20 disabled:opacity-40"
                    >
                      {sharingRuleId === rule.id ? '...' : 'Share'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-xs px-2 py-1 rounded-lg bg-frag-danger/10 text-frag-danger hover:bg-frag-danger/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),

    cpu_graph: (
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6">
        <h3 className="text-xl font-bold text-frag-text mb-4 flex items-center gap-2">
          <Cpu className="text-frag-primary" size={20} />
          CPU Usage Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={history}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d9ff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d9ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#71717a" tick={{ fill: '#71717a' }} tickLine={{ stroke: '#71717a' }} />
            <YAxis stroke="#71717a" tick={{ fill: '#71717a' }} tickLine={{ stroke: '#71717a' }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: '#141933', border: '1px solid #1e293b', borderRadius: '8px', color: '#e4e4e7' }} />
            <Area type="monotone" dataKey="cpu" stroke="#00d9ff" strokeWidth={2} fill="url(#cpuGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ),

    ram_graph: (
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6">
        <h3 className="text-xl font-bold text-frag-text mb-4 flex items-center gap-2">
          <MemoryStick className="text-frag-accent" size={20} />
          RAM Usage Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={history}>
            <defs>
              <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b026ff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#b026ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#71717a" tick={{ fill: '#71717a' }} tickLine={{ stroke: '#71717a' }} />
            <YAxis stroke="#71717a" tick={{ fill: '#71717a' }} tickLine={{ stroke: '#71717a' }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: '#141933', border: '1px solid #1e293b', borderRadius: '8px', color: '#e4e4e7' }} />
            <Area type="monotone" dataKey="ram" stroke="#b026ff" strokeWidth={2} fill="url(#ramGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ),

    fps: (
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-frag-text flex items-center gap-2">
            <Gauge className="text-frag-primary" size={20} />
            FPS / 1% Lows
          </h3>
          {selectedPid !== null && (
            <button
              onClick={handleStopTracking}
              className="text-xs px-2 py-1 rounded-lg bg-frag-danger/10 text-frag-danger hover:bg-frag-danger/20"
            >
              Stop tracking
            </button>
          )}
        </div>

        {selectedPid === null ? (
          <div>
            <p className="text-sm text-frag-muted mb-3">
              Requires RTSS (or MSI Afterburner) to be installed, running, and hooked into a
              game. FragDesk reads RTSS's frame-timing data — it doesn't hook games directly.
            </p>
            <button
              onClick={handleOpenAppPicker}
              className="px-3 py-1.5 rounded-lg bg-frag-primary text-frag-bg text-sm font-semibold hover:bg-frag-primary/90"
            >
              Select a game to track
            </button>

            {showAppPicker && (
              <div className="mt-3 bg-frag-bg border border-frag-border rounded-lg p-3 max-w-sm">
                {loadingApps ? (
                  <p className="text-xs text-frag-muted">Checking RTSS...</p>
                ) : rtssError ? (
                  <div className="space-y-2">
                    <p className="text-xs text-frag-danger">{rtssError}</p>
                    <button
                      onClick={refreshRtssApps}
                      className="text-xs text-frag-primary hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : rtssApps.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-frag-muted">
                      RTSS is running, but isn't currently hooked into any game. Launch a game
                      first, then retry.
                    </p>
                    <button
                      onClick={refreshRtssApps}
                      className="text-xs text-frag-primary hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {rtssApps.map((app) => (
                      <button
                        key={app.process_id}
                        onClick={() => handleSelectApp(app)}
                        className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-frag-surface text-frag-text"
                      >
                        {app.name}
                        <span className="text-frag-muted text-xs ml-2">PID {app.process_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-frag-muted mb-3">
              Tracking: <span className="text-frag-text">{selectedName ?? `PID ${selectedPid}`}</span>
            </p>
            {fpsStats === null ? (
              <p className="text-sm text-frag-muted">Waiting for frame data...</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="overflow-hidden whitespace-nowrap min-w-0">
                  <p className="text-xs text-frag-muted">Current</p>
                  <p className="text-2xl font-bold text-frag-primary">
                    {fpsStats.current_fps.toFixed(0)}
                  </p>
                </div>
                <div className="overflow-hidden whitespace-nowrap min-w-0">
                  <p className="text-xs text-frag-muted">Average</p>
                  <p className="text-2xl font-bold text-frag-text">
                    {fpsStats.avg_fps.toFixed(0)}
                  </p>
                </div>
                <div className="overflow-hidden whitespace-nowrap min-w-0">
                  <p className="text-xs text-frag-muted">1% Low</p>
                  <p className="text-2xl font-bold text-frag-danger">
                    {fpsStats.one_percent_low_fps.toFixed(0)}
                  </p>
                </div>
              </div>
            )}
            {fpsStats && (
              <p className="text-xs text-frag-muted mt-2">
                Based on {fpsStats.sample_count} sampled frames
              </p>
            )}
          </div>
        )}
      </div>
    ),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-frag-text mb-2">System Monitor</h1>
          <p className="text-frag-muted">
            {isMonitoring ? '🟢 Real-time system performance monitoring' : 'Monitoring paused'}
          </p>
        </div>
        <button
          onClick={() => setShowCustomize((v) => !v)}
          className="px-3 py-2 rounded-lg bg-frag-surface border border-frag-border text-frag-muted hover:text-frag-text flex items-center gap-2 text-sm"
        >
          <LayoutGrid size={16} />
          Customize Layout
        </button>
      </div>

      {showCustomize && (
        <div className="bg-frag-surface border border-frag-border rounded-lg p-4 mb-6 space-y-2">
          {layout.map((w, i) => (
            <div key={w.id} className="flex items-center justify-between bg-frag-bg border border-frag-border rounded-lg px-3 py-2">
              <span className={`text-sm ${w.visible ? 'text-frag-text' : 'text-frag-muted line-through'}`}>
                {WIDGET_LABELS[w.id] ?? w.id}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveWidget(w.id, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-frag-surface disabled:opacity-30 text-frag-muted">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => moveWidget(w.id, 1)} disabled={i === layout.length - 1} className="p-1.5 rounded hover:bg-frag-surface disabled:opacity-30 text-frag-muted">
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => toggleWidgetVisibility(w.id)} className="p-1.5 rounded hover:bg-frag-surface text-frag-muted">
                  {w.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-frag-border">
            <button onClick={resetLayout} className="text-xs text-frag-muted hover:text-frag-text">
              Reset to default
            </button>
            <div className="flex items-center gap-2">
              {layoutShared ? (
                <span className="text-xs text-frag-success">Shared ✓</span>
              ) : (
                <>
                  <input
                    type="text"
                    value={layoutNameDraft}
                    onChange={(e) => setLayoutNameDraft(e.target.value)}
                    placeholder="Name this layout..."
                    className="bg-frag-bg border border-frag-border rounded-lg px-2 py-1 text-xs text-frag-text w-40"
                  />
                  <button
                    onClick={handleShareLayout}
                    disabled={sharingLayout || !layoutNameDraft.trim()}
                    className="text-xs px-2 py-1 rounded-lg bg-frag-primary text-frag-bg font-medium disabled:opacity-40"
                  >
                    {sharingLayout ? '...' : 'Share layout'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {firedAlerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {firedAlerts.map((alert, i) => (
            <div key={`${alert.ruleId}-${i}`} className="flex items-center justify-between bg-frag-danger/10 border border-frag-danger/40 text-frag-danger text-sm rounded-lg px-4 py-3">
              <span className="flex items-center gap-2">
                <Bell size={16} />
                {alert.message}
              </span>
              <button onClick={() => dismissAlert(alert.ruleId)} className="hover:text-white">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-frag-danger/10 border border-frag-danger/40 text-frag-danger text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {layout
          .filter((w) => w.visible)
          .map((w) => (
            <div key={w.id}>{widgetContent[w.id]}</div>
          ))}
      </div>
    </div>
  );
}