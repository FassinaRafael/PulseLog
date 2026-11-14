import type { WeightUnit, WorkoutExerciseLog } from './types';

const KG_TO_LB = 2.20462;

export interface DoubleProgressionResult {
  eligibleForOverload: boolean;
  suggestedNextWeightKg: number;
  deltaKg: number;
  reason: string;
}

export interface WeightDelta {
  diff: number;
  status: 'up' | 'same' | 'down';
  label: string;
}

/**
 * Converte peso em kg para a unidade de exibição escolhida pelo usuário.
 */
export function convertFromKg(weightKg: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(weightKg * 100) / 100;
  return Math.round(weightKg * KG_TO_LB * 10) / 10;
}

/**
 * Converte um valor digitado na unidade escolhida de volta para kg (unidade canônica do banco).
 */
export function convertToKg(value: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(value * 100) / 100;
  return Math.round((value / KG_TO_LB) * 100) / 100;
}

/**
 * Formata peso para leitura tabular (ex: 72.5 ou 26.0).
 */
export function formatWeightValue(weightKg: number, unit: WeightUnit): string {
  const val = convertFromKg(weightKg, unit);
  return Number.isInteger(val) ? `${val.toFixed(1)}` : `${val}`;
}

/**
 * Avalia se o exercício atingiu o teto de repetições em todas as séries concluídas
 * para sugerir sobrecarga progressiva na próxima sessão (Double Progression).
 */
export function evaluateDoubleProgression(
  exerciseLog: WorkoutExerciseLog,
  incrementKg: number
): DoubleProgressionResult {
  if (exerciseLog.sets.length === 0) {
    return {
      eligibleForOverload: false,
      suggestedNextWeightKg: 0,
      deltaKg: 0,
      reason: 'Nenhuma série registrada',
    };
  }

  const allCompleted = exerciseLog.sets.every((set) => set.completed);
  const topWeight = Math.max(...exerciseLog.sets.map((set) => set.weightKg));

  if (!allCompleted) {
    return {
      eligibleForOverload: false,
      suggestedNextWeightKg: topWeight,
      deltaKg: 0,
      reason: 'Conclua todas as séries para avaliar sobrecarga',
    };
  }

  const hitRepCeiling = exerciseLog.sets.every(
    (set) => set.reps >= exerciseLog.maxReps
  );

  if (hitRepCeiling) {
    return {
      eligibleForOverload: true,
      suggestedNextWeightKg: Math.round((topWeight + incrementKg) * 100) / 100,
      deltaKg: incrementKg,
      reason: 'Bateu o teto de repetições em todas as séries',
    };
  }

  return {
    eligibleForOverload: false,
    suggestedNextWeightKg: topWeight,
    deltaKg: 0,
    reason: 'Mantenha a carga até completar o teto de repetições em todas as séries',
  };
}

/**
 * Calcula a diferença entre a carga atual e a referência da sessão anterior.
 */
export function calculateWeightDelta(
  currentWeightKg: number,
  previousWeightKg: number,
  unit: WeightUnit = 'kg'
): WeightDelta {
  const diffKg = Math.round((currentWeightKg - previousWeightKg) * 100) / 100;

  if (Math.abs(diffKg) < 0.01) {
    return {
      diff: 0,
      status: 'same',
      label: '= Mantido',
    };
  }

  const displayDiff = Math.abs(convertFromKg(diffKg, unit));
  const formatted = Number.isInteger(displayDiff)
    ? displayDiff.toString()
    : displayDiff.toFixed(1).replace(/\.0$/, '');

  if (diffKg > 0) {
    return {
      diff: diffKg,
      status: 'up',
      label: `▲ +${formatted} ${unit}`,
    };
  }

  return {
    diff: diffKg,
    status: 'down',
    label: `▼ -${formatted} ${unit}`,
  };
}

/**
 * Converte rótulo RIR ("1-2") para RPE aproximado ("8-9") quando escala é RPE.
 */
export function formatEffortTarget(targetRir: string, scale: 'RIR' | 'RPE'): string {
  if (scale === 'RIR') return `${targetRir} RIR`;

  const nums = targetRir
    .split(/[–-]/)
    .map((n) => parseFloat(n.trim()))
    .filter((n) => !Number.isNaN(n));

  if (nums.length === 0) return `RPE ${targetRir}`;
  if (nums.length === 1) {
    const rpe = Math.max(5, Math.min(10, 10 - nums[0]));
    return `RPE ${rpe}`;
  }
  const rpeLow = Math.max(5, Math.min(10, 10 - nums[1]));
  const rpeHigh = Math.max(5, Math.min(10, 10 - nums[0]));
  return `RPE ${rpeLow}–${rpeHigh}`;
}
