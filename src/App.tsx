import { useState } from 'react';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import DashboardHome from './components/dashboard/DashboardHome';
import ClipboardHistory from './components/features/clipboard/ClipboardHistory';
import SystemMonitor from './components/features/monitor/SystemMonitor';
import MacroManager from './components/features/macro/MacroManager';
import FragmentLibrary from './components/features/fragments/FragmentLibrary';
import CommunityLibrary from './components/features/community/CommunityLibrary';
import CommandPalette from './components/features/command/CommandPalette';
import SettingsPage from './components/features/settings/SettingsPage';
import OnboardingTour from './components/features/onboarding/OnboardingTour';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardHome setActiveTab={setActiveTab} />;
      case 'clipboard':
        return <ClipboardHistory setActiveTab={setActiveTab} />;
      case 'macros':
        return <MacroManager setActiveTab={setActiveTab} />;
      case 'monitor':
        return <SystemMonitor setActiveTab={setActiveTab} />;
      case 'fragments':
        return <FragmentLibrary />;
      case 'community':
        return <CommunityLibrary />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardHome setActiveTab={setActiveTab} />;
    }
  };

  return (
    <>
      <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
        {renderContent()}
      </MainLayout>
      <CommandPalette setActiveTab={setActiveTab} />
      <OnboardingTour />
    </>
  );
}

export default App;