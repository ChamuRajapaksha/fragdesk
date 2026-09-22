import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Clipboard, Zap, Activity, Layers, Users, Settings } from 'lucide-react';
import DashboardHome from '../components/dashboard/DashboardHome';
import ClipboardHistory from '../components/features/clipboard/ClipboardHistory';
import MacroManager from '../components/features/macro/MacroManager';
import SystemMonitor from '../components/features/monitor/SystemMonitor';
import FragmentLibrary from '../components/features/fragments/FragmentLibrary';
import CommunityLibrary from '../components/features/community/CommunityLibrary';
import SettingsPage from '../components/features/settings/SettingsPage';

export type NavId =
  | 'dashboard'
  | 'clipboard'
  | 'macros'
  | 'monitor'
  | 'fragments'
  | 'community'
  | 'settings';

export type FeatureGroup = 'overview' | 'tools' | 'system' | 'community' | 'app';

export interface FeaturePageProps {
  setActiveTab?: (tab: NavId) => void;
}

type PageComponent = ComponentType<FeaturePageProps>;

export interface FeatureDefinition {
  id: NavId;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  group: FeatureGroup;
  component: PageComponent;
  mode: 'available' | 'new' | 'coming-soon';
}

export const FEATURES: FeatureDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overview of your clips, macros, and system at a glance.',
    icon: LayoutDashboard,
    keywords: ['home', 'overview', 'start'],
    group: 'overview',
    component: DashboardHome as PageComponent,
    mode: 'available',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    description: 'Store and search your clipboard history with lightning-fast access.',
    icon: Clipboard,
    keywords: ['clipboard', 'copy', 'paste', 'history', 'snippets'],
    group: 'tools',
    component: ClipboardHistory as PageComponent,
    mode: 'available',
  },
  {
    id: 'macros',
    label: 'Macros',
    description: 'Record, save, and playback keyboard & mouse macros with precision.',
    icon: Zap,
    keywords: ['macro', 'record', 'playback', 'automation', 'hotkey'],
    group: 'tools',
    component: MacroManager as PageComponent,
    mode: 'available',
  },
  {
    id: 'monitor',
    label: 'System Monitor',
    description: 'Real-time CPU, RAM, and GPU monitoring with detailed graphs.',
    icon: Activity,
    keywords: ['monitor', 'system', 'cpu', 'ram', 'gpu', 'fps', 'performance'],
    group: 'system',
    component: SystemMonitor as PageComponent,
    mode: 'available',
  },
  {
    id: 'fragments',
    label: 'Fragments',
    description: 'Browse curated macros and starter content bundled with FragDesk.',
    icon: Layers,
    keywords: ['fragments', 'library', 'starter', 'bundled', 'import'],
    group: 'community',
    component: FragmentLibrary,
    mode: 'available',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Discover and share fragments with other FragDesk users.',
    icon: Users,
    keywords: ['community', 'share', 'library', 'import', 'supabase'],
    group: 'community',
    component: CommunityLibrary,
    mode: 'available',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Configure recording hotkeys and the app colour palette.',
    icon: Settings,
    keywords: ['settings', 'preferences', 'hotkey', 'theme', 'palette'],
    group: 'app',
    component: SettingsPage,
    mode: 'available',
  },
];

export function getFeature(id: string): FeatureDefinition | undefined {
  return FEATURES.find((f) => f.id === id);
}

export function featureMode(id: string): FeatureDefinition['mode'] {
  return FEATURES.find((f) => f.id === id)?.mode ?? 'available';
}

export const GROUP_LABELS: Record<FeatureGroup, string> = {
  overview: 'Overview',
  tools: 'Tools',
  system: 'System',
  community: 'Community',
  app: 'App',
};

export const GROUP_ORDER: FeatureGroup[] = ['overview', 'tools', 'system', 'community', 'app'];

export interface FeatureGroupSection {
  group: FeatureGroup;
  label: string;
  features: FeatureDefinition[];
}

export const FEATURES_BY_GROUP: FeatureGroupSection[] = GROUP_ORDER.map((group) => ({
  group,
  label: GROUP_LABELS[group],
  features: FEATURES.filter((f) => f.group === group),
}));