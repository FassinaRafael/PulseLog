import { useLiveQuery } from 'dexie-react-hooks';
import React, { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import {
  db,
  ensureSeeded,
  getOrCreateActiveSession,
} from './db/database';
import { SEED_PREFERENCES, SEED_ROUTINE } from './db/seed';
import type { AppTab } from './domain/types';
import { ActiveWorkoutPage } from './pages/ActiveWorkoutPage';
import { PerformancePage } from './pages/PerformancePage';
import { ProfilePage } from './pages/ProfilePage';
import { RoutineConfigPage } from './pages/RoutineConfigPage';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('treino');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    ensureSeeded().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const routines = useLiveQuery(() => db.routines.toArray(), [ready]);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [ready]);
  const prefsList = useLiveQuery(() => db.preferences.toArray(), [ready]);
  const catalog = useLiveQuery(() => db.catalog.toArray(), [ready]);

  const routine = routines?.[0] ?? SEED_ROUTINE;
  const preferences = prefsList?.[0] ?? SEED_PREFERENCES;

  const activeSession = sessions?.find(
    (s) => s.status === 'in_progress' && s.routineDayId === routine.activeDayId
  );

  useEffect(() => {
    if (ready && !activeSession) {
      getOrCreateActiveSession(routine.activeDayId);
    }
  }, [ready, activeSession, routine.activeDayId]);

  if (!ready || !sessions || !catalog) {
    return (
      <div className="min-h-dvh bg-[#0A0A0C] text-[#F4F4F5] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#141417] border border-[#1F1F23] flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-ping" />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-[#A1A1AA]">
          PulseLog
        </span>
      </div>
    );
  }

  const athleteInitials = (() => {
    const parts = preferences.athleteName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) || 'PL').toUpperCase();
  })();

  const statusLabel = activeTab === 'perfil' ? 'SINCRONIZADO' : 'PRONTO';

  return (
    <AppShell
      activeTab={activeTab}
      onChangeTab={setActiveTab}
      statusLabel={statusLabel}
      athleteInitials={athleteInitials}
    >
      {activeTab === 'treino' && activeSession && (
        <ActiveWorkoutPage
          routine={routine}
          session={activeSession}
          preferences={preferences}
          catalog={catalog}
          onNavigateTab={setActiveTab}
        />
      )}

      <div className={activeTab === 'rotinas' ? 'flex flex-col w-full' : 'hidden'}>
        <RoutineConfigPage
          routine={routine}
          catalog={catalog}
          preferences={preferences}
          onNavigateTab={setActiveTab}
        />
      </div>

      {activeTab === 'historico' && (
        <PerformancePage
          routine={routine}
          sessions={sessions}
          preferences={preferences}
          catalog={catalog}
        />
      )}

      {activeTab === 'perfil' && (
        <ProfilePage
          routine={routine}
          sessions={sessions}
          preferences={preferences}
        />
      )}
    </AppShell>
  );
};

export default App;
