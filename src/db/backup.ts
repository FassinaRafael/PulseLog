import { calculateEstimated1RM } from '../domain/metrics';
import type {
  ExerciseTemplate,
  Routine,
  UserPreferences,
  WorkoutSession,
} from '../domain/types';
import { db } from './database';
import {
  createActiveSessionFromRoutine,
  SEED_CATALOG,
  SEED_HISTORY_SESSIONS,
  SEED_PREFERENCES,
  SEED_ROUTINE,
} from './seed';

interface PulseLogBackupPayload {
  app: 'PulseLog';
  version: string;
  exportedAt: string;
  routines: Routine[];
  sessions: WorkoutSession[];
  preferences: UserPreferences[];
  catalog: ExerciseTemplate[];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportBackupJson(): Promise<void> {
  const [routines, sessions, preferences, catalog] = await Promise.all([
    db.routines.toArray(),
    db.sessions.toArray(),
    db.preferences.toArray(),
    db.catalog.toArray(),
  ]);

  const payload: PulseLogBackupPayload = {
    app: 'PulseLog',
    version: '2.4.0',
    exportedAt: new Date().toISOString(),
    routines,
    sessions,
    preferences,
    catalog,
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, `pulselog-backup-${dateTag}.json`);
}

export async function exportHistoryCsv(): Promise<void> {
  const sessions = await db.sessions
    .where('status')
    .equals('completed')
    .toArray();

  const header = [
    'Data',
    'Treino',
    'Exercicio',
    'GrupoMuscular',
    'Serie',
    'PesoKg',
    'Reps',
    'RIR',
    'VolumeKg',
    'Est1RM',
  ].join(',');

  const rows: string[] = [header];

  for (const session of sessions) {
    const dateStr = (session.completedAt ?? session.startedAt).slice(0, 10);
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (!set.completed) continue;
        const vol = Math.round(set.weightKg * set.reps * 10) / 10;
        const est1rm = calculateEstimated1RM(set.weightKg, set.reps);
        rows.push(
          [
            dateStr,
            `"${session.dayTitle.replace(/"/g, '""')}"`,
            `"${ex.name.replace(/"/g, '""')}"`,
            ex.muscleGroup,
            set.setNumber,
            set.weightKg,
            set.reps,
            set.rir,
            vol,
            est1rm,
          ].join(',')
        );
      }
    }
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const blob = new Blob(['\uFEFF' + rows.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerDownload(blob, `pulselog-historico-${dateTag}.csv`);
}

export async function importBackupJson(file: File): Promise<{
  sessionsCount: number;
  routinesCount: number;
}> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as Partial<PulseLogBackupPayload>;

  if (
    parsed.app !== 'PulseLog' ||
    !Array.isArray(parsed.routines) ||
    !Array.isArray(parsed.sessions)
  ) {
    throw new Error('Arquivo de backup inválido ou incompatível com o PulseLog.');
  }

  await db.transaction(
    'rw',
    db.routines,
    db.sessions,
    db.preferences,
    db.catalog,
    async () => {
      await db.routines.clear();
      await db.sessions.clear();
      await db.preferences.clear();
      await db.catalog.clear();

      if (parsed.routines && parsed.routines.length > 0) {
        await db.routines.bulkPut(parsed.routines);
      }
      if (parsed.sessions && parsed.sessions.length > 0) {
        await db.sessions.bulkPut(parsed.sessions);
      }
      if (parsed.preferences && parsed.preferences.length > 0) {
        await db.preferences.bulkPut(parsed.preferences);
      } else {
        await db.preferences.put(SEED_PREFERENCES);
      }
      if (parsed.catalog && parsed.catalog.length > 0) {
        await db.catalog.bulkPut(parsed.catalog);
      } else {
        await db.catalog.bulkPut(SEED_CATALOG);
      }
    }
  );

  return {
    sessionsCount: parsed.sessions.length,
    routinesCount: parsed.routines.length,
  };
}

export async function resetToSeedData(): Promise<void> {
  await db.transaction(
    'rw',
    db.routines,
    db.sessions,
    db.preferences,
    db.catalog,
    async () => {
      await db.routines.clear();
      await db.sessions.clear();
      await db.preferences.clear();
      await db.catalog.clear();

      await db.preferences.put(SEED_PREFERENCES);
      await db.catalog.bulkPut(SEED_CATALOG);
      await db.routines.put(SEED_ROUTINE);
      await db.sessions.bulkPut(SEED_HISTORY_SESSIONS);
      await db.sessions.put(
        createActiveSessionFromRoutine(SEED_ROUTINE, SEED_ROUTINE.activeDayId, 1)
      );
    }
  );
}
