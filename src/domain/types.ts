export type MuscleGroup =
  | 'Peitoral'
  | 'Costas'
  | 'Pernas'
  | 'Ombros'
  | 'Braços'
  | 'Core';

export type WeightUnit = 'kg' | 'lb';
export type EffortScale = 'RIR' | 'RPE';
export type DurationTarget = 40 | 45 | 50 | 60;
export type RestPresetSeconds = 60 | 90 | 120 | 180;
export type WeightIncrementKg = 1.25 | 2.5 | 5;

export interface ExerciseTemplate {
  id: string;
  name: string;
  subtitle: string;
  muscleGroup: MuscleGroup;
  defaultSets: number;
  minReps: number;
  maxReps: number;
  targetRir: string;
  defaultWeightKg: number;
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  name: string;
  subtitle: string;
  muscleGroup: MuscleGroup;
  sets: number;
  minReps: number;
  maxReps: number;
  targetRir: string;
  targetWeightKg: number;
  previousWeightKg: number;
  previousReps: number;
  supersetGroupId?: string;
}

export interface RoutineDay {
  id: string;
  shortLabel: string;
  fullTitle: string;
  exercises: PlannedExercise[];
}

export interface Routine {
  id: string;
  name: string;
  durationTargetMin: DurationTarget;
  baselineRpe: number;
  cycleNumber: number;
  activeDayId: string;
  days: RoutineDay[];
  updatedAt: string;
}

export interface WorkoutSetLog {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
  completed: boolean;
}

export interface WorkoutExerciseLog {
  plannedExerciseId: string;
  exerciseId: string;
  name: string;
  subtitle: string;
  muscleGroup: MuscleGroup;
  minReps: number;
  maxReps: number;
  targetRir: string;
  previousWeightKg: number;
  previousReps: number;
  supersetGroupId?: string;
  sets: WorkoutSetLog[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  routineDayId: string;
  dayShortLabel: string;
  dayTitle: string;
  startedAt: string;
  completedAt?: string;
  durationMin: number;
  rpe: number;
  totalVolumeKg: number;
  validSetsCount: number;
  status: 'in_progress' | 'completed';
  exercises: WorkoutExerciseLog[];
}

export interface UserPreferences {
  id: 'default';
  athleteName: string;
  weightUnit: WeightUnit;
  defaultRestSeconds: RestPresetSeconds;
  autoStartRestTimer: boolean;
  weightIncrementKg: WeightIncrementKg;
  effortScale: EffortScale;
  doubleProgressionEnabled: boolean;
}

export type AppTab = 'treino' | 'rotinas' | 'historico' | 'perfil';
