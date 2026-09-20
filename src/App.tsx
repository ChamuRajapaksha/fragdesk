import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { applyPaletteById } from './themes';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import CommandPalette from './components/features/command/CommandPalette';
import OnboardingTour from './components/features/onboarding/OnboardingTour';
import { FEATURES, type NavId } from './features/registry';

function App() {
  const [activeTab, setActiveTab] = useState<NavId>('dashboard');

  // Restore the persisted palette (if any) before first paint settles;
  // the default palette already matches :root so a miss is a no-op.
  useEffect(() => {
    invoke<string>('get_ui_theme')
      .then(applyPaletteById)
      .catch(() => {});
  }, []);

  const feature = FEATURES.find((f) => f.id === activeTab) ?? FEATURES[0];
  const Page = feature.component;

  return (
    <>
      <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
        <Page setActiveTab={setActiveTab} />
      </MainLayout>
      <CommandPalette setActiveTab={setActiveTab} />
      <OnboardingTour />
    </>
  );
}

export default App;