import {
  Dumbbell,
  ListChecks,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import React from 'react';
import type { AppTab } from '../../domain/types';

interface AppShellProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  statusLabel?: string;
  subtitle?: string;
  athleteInitials?: string;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: AppTab;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: 'treino', label: 'Treino', Icon: Dumbbell },
  { id: 'rotinas', label: 'Rotinas', Icon: ListChecks },
  { id: 'historico', label: 'Histórico', Icon: TrendingUp },
  { id: 'perfil', label: 'Perfil', Icon: SlidersHorizontal },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onChangeTab,
  children,
}) => {
  return (
    <div className="min-h-dvh bg-[#0A0A0C] text-[#F4F4F5] flex justify-center">
      <div className="w-full max-w-[480px] min-h-dvh bg-[#0A0A0C] border-x border-[#1F1F23]/60 flex flex-col relative">
        {/* MAIN CONTENT */}
        <main className="flex-1 w-full pt-safe pb-32 px-5 flex flex-col">
          {children}
        </main>

        {/* BOTTOM NAVIGATION BAR */}
        <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe flex justify-center pointer-events-none">
          <div className="w-full max-w-[480px] h-14 px-2 bg-[#0A0A0C]/95 backdrop-blur-md border-t border-[#1F1F23] flex justify-around items-center pointer-events-auto">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeTab(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] flex-1 gap-0.5 transition-all duration-150 active:scale-95 ${
                    isActive
                      ? 'text-[#10B981]'
                      : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                  }`}
                >
                  <Icon
                    className="w-5 h-5"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  <span className="text-[10px] font-medium tracking-tight">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
