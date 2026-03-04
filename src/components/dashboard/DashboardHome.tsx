import { motion } from 'framer-motion';
import { Clipboard, Zap, Activity, ArrowRight } from 'lucide-react';

const features = [
  {
    id: 'clipboard',
    title: 'Clipboard Manager',
    description: 'Store and search your clipboard history with lightning-fast access',
    icon: Clipboard,
    color: 'text-frag-primary',
    bgColor: 'bg-frag-primary/10',
    status: 'Coming Soon',
  },
  {
    id: 'macros',
    title: 'Macro System',
    description: 'Record, save, and playback keyboard & mouse macros with precision',
    icon: Zap,
    color: 'text-frag-accent',
    bgColor: 'bg-frag-accent/10',
    status: 'Coming Soon',
  },
  {
    id: 'monitor',
    title: 'System Monitor',
    description: 'Real-time CPU, RAM, and GPU monitoring with detailed graphs',
    icon: Activity,
    color: 'text-frag-success',
    bgColor: 'bg-frag-success/10',
    status: 'Coming Soon',
  },
];

export default function DashboardHome() {
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
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <p className="text-frag-muted text-sm mb-1">Total Clips</p>
          <p className="text-3xl font-bold text-frag-primary">0</p>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <p className="text-frag-muted text-sm mb-1">Saved Macros</p>
          <p className="text-3xl font-bold text-frag-accent">0</p>
        </motion.div>

        <motion.div
          className="bg-frag-surface border border-frag-border rounded-lg p-6"
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <p className="text-frag-muted text-sm mb-1">CPU Usage</p>
          <p className="text-3xl font-bold text-frag-success">--</p>
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
                <span className="px-3 py-1 bg-frag-warning/20 text-frag-warning text-sm rounded-full">
                  {feature.status}
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