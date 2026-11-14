import { describe, expect, it } from 'vitest';
import {
  calculateEstimated1RM,
  calculateSessionMetrics,
  calculateWeeklyMuscleVolume,
  buildExerciseProgressionSeries,
} from '../metrics';
import {
  calculateWeightDelta,
  evaluateDoubleProgression,
  formatEffortTarget,
} from '../progression';
import type { WorkoutExerciseLog, WorkoutSession } from '../types';

describe('PulseLog Domain Logic', () => {
  it('calcula 1RM estimado pela fórmula de Epley', () => {
    expect(calculateEstimated1RM(100, 1)).toBe(100);
    expect(calculateEstimated1RM(72.5, 8)).toBe(91.8);
    expect(calculateEstimated1RM(0, 8)).toBe(0);
    expect(calculateEstimated1RM(80, 0)).toBe(0);
  });

  it('avalia Double Progression corretamente ao atingir teto de repetições', () => {
    const readyExercise: WorkoutExerciseLog = {
      plannedExerciseId: 'p1',
      exerciseId: 'supino-reto',
      name: 'Supino Reto com Barra',
      subtitle: 'Compound Barbell Press',
      muscleGroup: 'Peitoral',
      minReps: 6,
      maxReps: 8,
      targetRir: '1-2',
      previousWeightKg: 70,
      previousReps: 8,
      sets: [
        { setNumber: 1, weightKg: 72.5, reps: 8, rir: 2, completed: true },
        { setNumber: 2, weightKg: 72.5, reps: 8, rir: 1, completed: true },
        { setNumber: 3, weightKg: 72.5, reps: 8, rir: 1, completed: true },
      ],
    };

    const resReady = evaluateDoubleProgression(readyExercise, 2.5);
    expect(resReady.eligibleForOverload).toBe(true);
    expect(resReady.suggestedNextWeightKg).toBe(75);
    expect(resReady.deltaKg).toBe(2.5);

    const notReadyExercise: WorkoutExerciseLog = {
      ...readyExercise,
      sets: [
        { setNumber: 1, weightKg: 72.5, reps: 8, rir: 2, completed: true },
        { setNumber: 2, weightKg: 72.5, reps: 7, rir: 1, completed: true },
        { setNumber: 3, weightKg: 72.5, reps: 6, rir: 1, completed: true },
      ],
    };

    const resNotReady = evaluateDoubleProgression(notReadyExercise, 2.5);
    expect(resNotReady.eligibleForOverload).toBe(false);
    expect(resNotReady.suggestedNextWeightKg).toBe(72.5);
  });

  it('calcula delta de carga corretamente em kg e lb', () => {
    expect(calculateWeightDelta(72.5, 70, 'kg')).toEqual({
      diff: 2.5,
      status: 'up',
      label: '▲ +2.5 kg',
    });
    expect(calculateWeightDelta(26, 26, 'kg')).toEqual({
      diff: 0,
      status: 'same',
      label: '= Mantido',
    });
    expect(calculateWeightDelta(65, 70, 'kg')).toEqual({
      diff: -5,
      status: 'down',
      label: '▼ -5 kg',
    });
  });

  it('calcula métricas de sessão (tonelagem e séries válidas)', () => {
    const exercises: WorkoutExerciseLog[] = [
      {
        plannedExerciseId: 'p1',
        exerciseId: 'supino-reto',
        name: 'Supino Reto',
        subtitle: 'Barbell',
        muscleGroup: 'Peitoral',
        minReps: 6,
        maxReps: 8,
        targetRir: '1-2',
        previousWeightKg: 70,
        previousReps: 8,
        sets: [
          { setNumber: 1, weightKg: 70, reps: 8, rir: 2, completed: true },
          { setNumber: 2, weightKg: 70, reps: 8, rir: 1, completed: true },
          { setNumber: 3, weightKg: 70, reps: 6, rir: 1, completed: false },
        ],
      },
    ];

    const metrics = calculateSessionMetrics(exercises);
    expect(metrics.validSetsCount).toBe(2);
    expect(metrics.totalVolumeKg).toBe(1120);
    expect(metrics.completedExercisesCount).toBe(0);
  });

  it('calcula volume semanal por grupamento muscular e série histórica', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    const sessions: WorkoutSession[] = [
      {
        id: 's1',
        routineId: 'r1',
        routineDayId: 'd1',
        dayShortLabel: 'Dia 1 • Push',
        dayTitle: 'Day 1: Push',
        startedAt: '2026-11-10T08:00:00Z',
        completedAt: '2026-11-10T08:40:00Z',
        durationMin: 40,
        rpe: 8.5,
        totalVolumeKg: 3000,
        validSetsCount: 6,
        status: 'completed',
        exercises: [
          {
            plannedExerciseId: 'p1',
            exerciseId: 'supino-reto',
            name: 'Supino Reto',
            subtitle: 'Barbell',
            muscleGroup: 'Peitoral',
            minReps: 6,
            maxReps: 8,
            targetRir: '1-2',
            previousWeightKg: 67.5,
            previousReps: 8,
            sets: [
              { setNumber: 1, weightKg: 70, reps: 8, rir: 2, completed: true },
              { setNumber: 2, weightKg: 70, reps: 8, rir: 2, completed: true },
              { setNumber: 3, weightKg: 70, reps: 8, rir: 1, completed: true },
            ],
          },
        ],
      },
    ];

    const volume = calculateWeeklyMuscleVolume(sessions, now);
    const chest = volume.find((v) => v.muscleGroup === 'Peitoral');
    expect(chest?.completedSets).toBe(3);

    const series = buildExerciseProgressionSeries(sessions, 'supino-reto');
    expect(series).toHaveLength(1);
    expect(series[0].topWeightKg).toBe(70);
  });

  it('converte escala RIR para RPE corretamente', () => {
    expect(formatEffortTarget('1-2', 'RIR')).toBe('1-2 RIR');
    expect(formatEffortTarget('1-2', 'RPE')).toBe('RPE 8–9');
    expect(formatEffortTarget('2', 'RPE')).toBe('RPE 8');
  });
});
