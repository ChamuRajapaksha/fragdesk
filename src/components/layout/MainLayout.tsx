import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import type { NavId } from '../../features/registry';

interface MainLayoutProps {
  children: ReactNode;
  activeTab: NavId;
  setActiveTab: (tab: NavId) => void;
}

export default function MainLayout({ children, activeTab, setActiveTab }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-frag-bg overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}