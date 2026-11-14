import type {
  MuscleGroup,
  WorkoutExerciseLog,
  WorkoutSession,
} from './types';

export interface SessionMetrics {
  totalVolumeKg: number;
  validSetsCount: number;
  completedExercisesCount: number;
  totalExercisesCount: number;
}

export interface MuscleVolumeBreakdown {
  muscleGroup: MuscleGroup;
  label: string;
  completedSets: number;
  targetSets: number;
  percentage: number;
  targetHit: boolean;
}

export interface ExerciseSeriesPoint {
  sessionId: string;
  label: string;
  dateLabel: string;
  topWeightKg: number;
  topReps: number;
  estimated1RM: number;
  deltaFromPreviousKg: number;
  rpe: number;
}

export const WEEKLY_MUSCLE_TARGETS: {
  muscleGroup: MuscleGroup;
  label: string;
  targetSets: number;
}[] = [
  { muscleGroup: 'Peitoral', label: 'Peitoral', targetSets: 12 },
  { muscleGroup: 'Costas', label: 'Costas (Dorsais/Trapézio)', targetSets: 12 },
  { muscleGroup: 'Pernas', label: 'Pernas (Quadríceps/Posterior)', targetSets: 12 },
  { muscleGroup: 'Ombros', label: 'Ombros (Deltoides)', targetSets: 9 },
  { muscleGroup: 'Braços', label: 'Braços (Bíceps/Tríceps)', targetSets: 10 },
];

/**
 * Estima 1RM usando a fórmula clássica de Epley: weight * (1 + reps / 30).
 */
export function calculateEstimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/**
 * Verifica se todas as séries de um exercício foram concluídas.
 */
export function isExerciseCompleted(exercise: WorkoutExerciseLog): boolean {
  return exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);
}

/**
 * Calcula tonelagem total (kg), séries válidas e contagem de exercícios concluídos.
 */
export function calculateSessionMetrics(
  exercises: WorkoutExerciseLog[]
): SessionMetrics {
  let totalVolumeKg = 0;
  let validSetsCount = 0;
  let completedExercisesCount = 0;

  for (const ex of exercises) {
    let allDone = ex.sets.length > 0;
    for (const set of ex.sets) {
      if (set.completed) {
        validSetsCount += 1;
        totalVolumeKg += set.weightKg * set.reps;
      } else {
        allDone = false;
      }
    }
    if (allDone) {
      completedExercisesCount += 1;
    }
  }

  return {
    totalVolumeKg: Math.round(totalVolumeKg),
    validSetsCount,
    completedExercisesCount,
    totalExercisesCount: exercises.length,
  };
}

/**
 * Agrupa o volume semanal efetivo (séries concluídas) por grupamento muscular.
 * Considera os últimos 7 dias a partir da sessão mais recente (ou referência) quando há datas,
 * garantindo exibição consistente com as metas semanais.
 */
export function calculateWeeklyMuscleVolume(
  sessions: WorkoutSession[],
  referenceDate: Date = new Date()
): MuscleVolumeBreakdown[] {
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  // Usa janela de 7 dias a partir da data de referência (ou da sessão mais recente se os dados seed forem anteriores)
  const newestTime = completedSessions.reduce((max, s) => {
    const t = new Date(s.completedAt ?? s.startedAt).getTime();
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, 0);

  const anchorMs = Math.max(referenceDate.getTime(), newestTime);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentCutoff =
    newestTime > 0 && referenceDate.getTime() - newestTime > sevenDaysMs
      ? newestTime - sevenDaysMs
      : anchorMs - sevenDaysMs;

  const counts = new Map<MuscleGroup, number>();

  for (const session of completedSessions) {
    const sessionTime = new Date(session.completedAt ?? session.startedAt).getTime();
    if (!Number.isNaN(sessionTime) && sessionTime < recentCutoff) continue;

    for (const ex of session.exercises) {
      const doneSets = ex.sets.filter((s) => s.completed).length;
      if (doneSets > 0) {
        counts.set(ex.muscleGroup, (counts.get(ex.muscleGroup) ?? 0) + doneSets);
      }
    }
  }

  return WEEKLY_MUSCLE_TARGETS.map((target) => {
    const completedSets = counts.get(target.muscleGroup) ?? 0;
    const percentage = Math.min(
      100,
      Math.round((completedSets / target.targetSets) * 100)
    );
    return {
      muscleGroup: target.muscleGroup,
      label: target.label,
      completedSets,
      targetSets: target.targetSets,
      percentage,
      targetHit: completedSets >= target.targetSets,
    };
  });
}

/**
 * Extrai série histórica de um exercício (Top Set e 1RM estimado) ordenada cronologicamente.
 */
export function buildExerciseProgressionSeries(
  sessions: WorkoutSession[],
  exerciseId: string
): ExerciseSeriesPoint[] {
  const completed = sessions
    .filter((s) => s.status === 'completed')
    .sort(
      (a, b) =>
        new Date(a.completedAt ?? a.startedAt).getTime() -
        new Date(b.completedAt ?? b.startedAt).getTime()
    );

  const points: ExerciseSeriesPoint[] = [];

  for (const session of completed) {
    const found = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!found) continue;

    const doneSets = found.sets.filter((s) => s.completed && s.weightKg > 0);
    if (doneSets.length === 0) continue;

    let bestSet = doneSets[0];
    let best1RM = calculateEstimated1RM(bestSet.weightKg, bestSet.reps);

    for (const s of doneSets) {
      const est = calculateEstimated1RM(s.weightKg, s.reps);
      if (s.weightKg > bestSet.weightKg || (s.weightKg === bestSet.weightKg && est > best1RM)) {
        bestSet = s;
        best1RM = est;
      }
    }

    const prevWeight =
      points.length > 0 ? points[points.length - 1].topWeightKg : bestSet.weightKg;
    const d = new Date(session.completedAt ?? session.startedAt);
    const dateLabel = Number.isNaN(d.getTime())
      ? session.dayShortLabel
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase();

    points.push({
      sessionId: session.id,
      label: `S${points.length + 1}`,
      dateLabel,
      topWeightKg: bestSet.weightKg,
      topReps: bestSet.reps,
      estimated1RM: best1RM,
      deltaFromPreviousKg: Math.round((bestSet.weightKg - prevWeight) * 100) / 100,
      rpe: session.rpe,
    });
  }

  return points;
}

/**
 * Calcula estatísticas de consistência do atleta para o Perfil.
 */
export function calculateAthleteStats(sessions: WorkoutSession[]) {
  const completed = sessions.filter((s) => s.status === 'completed');
  const totalWorkouts = completed.length;

  const weekKeys = new Set<string>();
  for (const s of completed) {
    const d = new Date(s.completedAt ?? s.startedAt);
    if (Number.isNaN(d.getTime())) continue;
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
    const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    weekKeys.add(`${d.getFullYear()}-W${week}`);
  }

  const activeWeeks = Math.max(weekKeys.size, totalWorkouts > 0 ? 1 : 0);
  const streakWeeks = Math.min(activeWeeks, Math.max(1, Math.ceil(totalWorkouts / 3)));

  return {
    totalWorkouts,
    activeWeeks,
    streakWeeks,
  };
}
