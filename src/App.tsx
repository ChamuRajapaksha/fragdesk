import { useState } from 'react';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import DashboardHome from './components/dashboard/DashboardHome';
import ClipboardHistory from './components/features/clipboard/ClipboardHistory';
import SystemMonitor from './components/features/monitor/SystemMonitor';
import MacroManager from './components/features/macro/MacroManager';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardHome />;
      case 'clipboard':
        return <ClipboardHistory />;
      case 'macros':
        return <MacroManager />;
      case 'monitor':
        return <SystemMonitor />;
      case 'settings':
        return (
          <div>
            <h1 className="text-3xl font-bold text-frag-text">Settings</h1>
            <p className="text-frag-muted mt-2">Coming soon...</p>
          </div>
        );
      default:
        return <DashboardHome />;
    }
  };

  return (
    <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </MainLayout>
  );
}

export default App;