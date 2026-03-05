import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Cpu, MemoryStick, Activity } from 'lucide-react';

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

export default function SystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    // Load initial stats
    loadStats();
    
    // Start monitoring
    setIsMonitoring(true);
    const interval = setInterval(() => {
      loadStats();
    }, 1000);

    return () => {
      clearInterval(interval);
      setIsMonitoring(false);
    };
  }, []);

  const loadStats = async () => {
    try {
      const result = await invoke<SystemStats>('get_system_stats');
      setStats(result);
      
      // Add to history (keep last 60 data points = 1 minute)
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
          {
            time: timeStr,
            cpu: result.cpu_usage,
            ram: result.ram_percent,
          }
        ];
        
        // Keep only last 60 points
        return newHistory.slice(-60);
      });
    } catch (error) {
      console.error('Failed to get system stats:', error);
    }
  };

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

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-frag-text mb-2">System Monitor</h1>
        <p className="text-frag-muted">
          {isMonitoring ? '🟢 Real-time system performance monitoring' : 'Monitoring paused'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {/* CPU Card */}
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
            <p className="text-4xl font-bold text-frag-primary">
              {stats.cpu_usage.toFixed(1)}
            </p>
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

        {/* RAM Card */}
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
            <p className="text-4xl font-bold text-frag-accent">
              {stats.ram_percent.toFixed(1)}
            </p>
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

        {/* Status Card */}
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
            <p className="text-xs text-frag-muted">
              {history.length} data points collected
            </p>
          </div>
        </motion.div>
      </div>

      {/* CPU Graph */}
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6 mb-4">
        <h3 className="text-xl font-bold text-frag-text mb-4 flex items-center gap-2">
          <Cpu className="text-frag-primary" size={20} />
          CPU Usage Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={history}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d9ff" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#00d9ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="time" 
              stroke="#71717a" 
              tick={{ fill: '#71717a' }}
              tickLine={{ stroke: '#71717a' }}
            />
            <YAxis 
              stroke="#71717a" 
              tick={{ fill: '#71717a' }}
              tickLine={{ stroke: '#71717a' }}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#141933', 
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#e4e4e7'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="cpu" 
              stroke="#00d9ff" 
              strokeWidth={2}
              fill="url(#cpuGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* RAM Graph */}
      <div className="bg-frag-surface border border-frag-border rounded-lg p-6">
        <h3 className="text-xl font-bold text-frag-text mb-4 flex items-center gap-2">
          <MemoryStick className="text-frag-accent" size={20} />
          RAM Usage Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={history}>
            <defs>
              <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b026ff" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#b026ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="time" 
              stroke="#71717a" 
              tick={{ fill: '#71717a' }}
              tickLine={{ stroke: '#71717a' }}
            />
            <YAxis 
              stroke="#71717a" 
              tick={{ fill: '#71717a' }}
              tickLine={{ stroke: '#71717a' }}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#141933', 
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#e4e4e7'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="ram" 
              stroke="#b026ff" 
              strokeWidth={2}
              fill="url(#ramGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}