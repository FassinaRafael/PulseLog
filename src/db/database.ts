import Dexie, { type EntityTable } from 'dexie';
import { calculateSessionMetrics } from '../domain/metrics';
import { evaluateDoubleProgression } from '../domain/progression';
import type {
  ExerciseTemplate,
  Routine,
  UserPreferences,
  WorkoutSession,
} from '../domain/types';
import {
  createActiveSessionFromRoutine,
  SEED_CATALOG,
  SEED_HISTORY_SESSIONS,
  SEED_PREFERENCES,
  SEED_ROUTINE,
} from './seed';

export class PulseLogDB extends Dexie {
  routines!: EntityTable<Routine, 'id'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  preferences!: EntityTable<UserPreferences, 'id'>;
  catalog!: EntityTable<ExerciseTemplate, 'id'>;

  constructor() {
    super('PulseLogDatabase');
    this.version(1).stores({
      routines: 'id, updatedAt',
      sessions: 'id, routineId, routineDayId, status, startedAt, completedAt',
      preferences: 'id',
      catalog: 'id, muscleGroup, name',
    });
  }
}

export const db = new PulseLogDB();

let initPromise: Promise<void> | null = null;

/**
 * Garante que o IndexedDB esteja populado com dados iniciais na primeira execução.
 */
export async function ensureSeeded(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const routineCount = await db.routines.count();
    if (routineCount === 0) {
      await db.transaction(
        'rw',
        db.routines,
        db.sessions,
        db.preferences,
        db.catalog,
        async () => {
          await db.preferences.put(SEED_PREFERENCES);
          await db.catalog.bulkPut(SEED_CATALOG);
          await db.routines.put(SEED_ROUTINE);
          await db.sessions.bulkPut(SEED_HISTORY_SESSIONS);
          const initialActive = createActiveSessionFromRoutine(
            SEED_ROUTINE,
            SEED_ROUTINE.activeDayId,
            1
          );
          await db.sessions.put(initialActive);
        }
      );
    }
  })();

  return initPromise;
}

export async function getActiveRoutine(): Promise<Routine> {
  await ensureSeeded();
  const routines = await db.routines.toArray();
  return routines[0] ?? SEED_ROUTINE;
}

export async function getPreferences(): Promise<UserPreferences> {
  await ensureSeeded();
  return (await db.preferences.get('default')) ?? SEED_PREFERENCES;
}

export async function updatePreferences(
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getPreferences();
  const next: UserPreferences = { ...current, ...patch, id: 'default' };
  await db.preferences.put(next);
  return next;
}

export async function getOrCreateActiveSession(
  dayId?: string
): Promise<WorkoutSession> {
  await ensureSeeded();
  const routine = await getActiveRoutine();
  const targetDayId = dayId ?? routine.activeDayId;

  const existing = await db.sessions
    .where('status')
    .equals('in_progress')
    .filter((s) => s.routineDayId === targetDayId)
    .first();

  if (existing) return existing;

  const created = createActiveSessionFromRoutine(routine, targetDayId, 0);
  await db.sessions.put(created);
  return created;
}

export async function updateActiveSession(session: WorkoutSession): Promise<void> {
  const metrics = calculateSessionMetrics(session.exercises);
  await db.sessions.put({
    ...session,
    totalVolumeKg: metrics.totalVolumeKg,
    validSetsCount: metrics.validSetsCount,
  });
}

export async function switchActiveDay(dayId: string): Promise<WorkoutSession> {
  const routine = await getActiveRoutine();
  await db.routines.put({
    ...routine,
    activeDayId: dayId,
    updatedAt: new Date().toISOString(),
  });
  return getOrCreateActiveSession(dayId);
}

export async function saveRoutine(updatedRoutine: Routine): Promise<void> {
  await db.routines.put({
    ...updatedRoutine,
    updatedAt: new Date().toISOString(),
  });

  // Sincroniza a sessão in_progress do dia editado caso o usuário tenha adicionado/reordenado exercícios
  const inProgressSessions = await db.sessions
    .where('status')
    .equals('in_progress')
    .toArray();

  for (const session of inProgressSessions) {
    const day = updatedRoutine.days.find((d) => d.id === session.routineDayId);
    if (!day) continue;

    const existingMap = new Map(
      session.exercises.map((e) => [e.plannedExerciseId, e])
    );

    const syncedExercises = day.exercises.map((planned) => {
      const prevLog = existingMap.get(planned.id);
      if (prevLog) {
        const sets = Array.from({ length: planned.sets }, (_, idx) => {
          const existingSet = prevLog.sets[idx];
          if (existingSet) return existingSet;
          return {
            setNumber: idx + 1,
            weightKg: planned.targetWeightKg,
            reps: planned.minReps,
            rir: parseInt(planned.targetRir, 10) || 1,
            completed: false,
          };
        });
        return {
          ...prevLog,
          name: planned.name,
          subtitle: planned.subtitle,
          muscleGroup: planned.muscleGroup,
          minReps: planned.minReps,
          maxReps: planned.maxReps,
          targetRir: planned.targetRir,
          supersetGroupId: planned.supersetGroupId,
          sets,
        };
      }

      return {
        plannedExerciseId: planned.id,
        exerciseId: planned.exerciseId,
        name: planned.name,
        subtitle: planned.subtitle,
        muscleGroup: planned.muscleGroup,
        minReps: planned.minReps,
        maxReps: planned.maxReps,
        targetRir: planned.targetRir,
        previousWeightKg: planned.previousWeightKg,
        previousReps: planned.previousReps,
        supersetGroupId: planned.supersetGroupId,
        sets: Array.from({ length: planned.sets }, (_, idx) => ({
          setNumber: idx + 1,
          weightKg: planned.targetWeightKg,
          reps: planned.minReps,
          rir: parseInt(planned.targetRir, 10) || 1,
          completed: false,
        })),
      };
    });

    const metrics = calculateSessionMetrics(syncedExercises);
    await db.sessions.put({
      ...session,
      dayShortLabel: day.shortLabel,
      dayTitle: day.fullTitle,
      exercises: syncedExercises,
      totalVolumeKg: metrics.totalVolumeKg,
      validSetsCount: metrics.validSetsCount,
    });
  }
}

export async function addExerciseToCatalog(
  template: ExerciseTemplate
): Promise<void> {
  await db.catalog.put(template);
}

/**
 * Conclui a sessão ativa, grava no histórico, atualiza referências anteriores
 * na rotina e aplica Double Progression se habilitado.
 */
export async function completeActiveSession(
  session: WorkoutSession
): Promise<{
  completedSession: WorkoutSession;
  progressedExercises: string[];
}> {
  const prefs = await getPreferences();
  const routine = await getActiveRoutine();
  const metrics = calculateSessionMetrics(session.exercises);
  const nowIso = new Date().toISOString();
  const elapsedMin = Math.max(
    15,
    Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / (60 * 1000)
    ) || session.durationMin
  );

  const completedSession: WorkoutSession = {
    ...session,
    id: `done-${Date.now()}`,
    completedAt: nowIso,
    durationMin: Math.min(120, elapsedMin),
    totalVolumeKg: metrics.totalVolumeKg,
    validSetsCount: metrics.validSetsCount,
    status: 'completed',
  };

  const progressedExercises: string[] = [];

  const updatedDays = routine.days.map((day) => {
    if (day.id !== session.routineDayId) return day;

    return {
      ...day,
      exercises: day.exercises.map((planned) => {
        const log = session.exercises.find(
          (e) => e.plannedExerciseId === planned.id
        );
        if (!log) return planned;

        const doneSets = log.sets.filter((s) => s.completed);
        if (doneSets.length === 0) return planned;

        const topSet = doneSets.reduce((best, cur) =>
          cur.weightKg >= best.weightKg ? cur : best
        );

        let nextTargetWeight = topSet.weightKg;
        if (prefs.doubleProgressionEnabled) {
          const dp = evaluateDoubleProgression(log, prefs.weightIncrementKg);
          if (dp.eligibleForOverload) {
            nextTargetWeight = dp.suggestedNextWeightKg;
            progressedExercises.push(planned.name);
          }
        }

        return {
          ...planned,
          previousWeightKg: topSet.weightKg,
          previousReps: topSet.reps,
          targetWeightKg: nextTargetWeight,
        };
      }),
    };
  });

  // Avança automaticamente para o próximo dia do ciclo
  const currentIdx = routine.days.findIndex((d) => d.id === session.routineDayId);
  const nextDay =
    routine.days[(currentIdx + 1) % routine.days.length] ?? routine.days[0];

  const updatedRoutine: Routine = {
    ...routine,
    days: updatedDays,
    activeDayId: nextDay.id,
    updatedAt: nowIso,
  };

  await db.transaction('rw', db.sessions, db.routines, async () => {
    await db.sessions.put(completedSession);
    await db.sessions.delete(session.id);
    await db.routines.put(updatedRoutine);
    const freshNext = createActiveSessionFromRoutine(updatedRoutine, nextDay.id, 0);
    await db.sessions.put(freshNext);
  });

  return { completedSession, progressedExercises };
}
