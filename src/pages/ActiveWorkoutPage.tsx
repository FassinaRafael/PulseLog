import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddExerciseModal } from '../components/AddExerciseModal';
import { NumericInput } from '../components/NumericInput';
import {
  addExerciseToCatalog,
  completeActiveSession,
  switchActiveDay,
  updateActiveSession,
} from '../db/database';
import {
  calculateSessionMetrics,
  isExerciseCompleted,
} from '../domain/metrics';
import {
  convertFromKg,
  convertToKg,
  evaluateDoubleProgression,
  formatEffortTarget,
  formatWeightValue,
} from '../domain/progression';
import type {
  AppTab,
  ExerciseTemplate,
  Routine,
  UserPreferences,
  WorkoutExerciseLog,
  WorkoutSession,
} from '../domain/types';
import { formatTimerSeconds, useRestTimer } from '../hooks/useRestTimer';

interface ActiveWorkoutPageProps {
  routine: Routine;
  session: WorkoutSession;
  preferences: UserPreferences;
  catalog: ExerciseTemplate[];
  onNavigateTab: (tab: AppTab) => void;
}

function formatDisplayWeight(val: number): string {
  return Number.isInteger(val) ? val.toFixed(1) : String(val);
}

export const ActiveWorkoutPage: React.FC<ActiveWorkoutPageProps> = ({
  routine,
  session,
  preferences,
  catalog,
  onNavigateTab,
}) => {
  const timer = useRestTimer(preferences.defaultRestSeconds);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(() => {
    const firstPending = session.exercises.find((ex) => !isExerciseCompleted(ex));
    return (firstPending ?? session.exercises[0])?.plannedExerciseId ?? null;
  });
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const getElapsedFromStart = () => {
    const startMs = new Date(session.startedAt).getTime();
    if (Number.isNaN(startMs)) return 0;
    return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  };

  const [elapsedSeconds, setElapsedSeconds] = useState(getElapsedFromStart);
  const [completionSummary, setCompletionSummary] = useState<{
    volumeKg: number;
    validSets: number;
    progressed: string[];
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setElapsedSeconds(getElapsedFromStart());
    const id = window.setInterval(() => {
      setElapsedSeconds(getElapsedFromStart());
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.startedAt, session.id]);

  // Keep an active exercise valid when day switches or exercises change
  useEffect(() => {
    if (
      !activeExerciseId ||
      !session.exercises.some((ex) => ex.plannedExerciseId === activeExerciseId)
    ) {
      const firstPending = session.exercises.find(
        (ex) => !isExerciseCompleted(ex)
      );
      setActiveExerciseId(
        (firstPending ?? session.exercises[0])?.plannedExerciseId ?? null
      );
    }
  }, [session.exercises, activeExerciseId]);

  useEffect(() => {
    if (!dayDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDayDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dayDropdownOpen]);

  const metrics = useMemo(
    () => calculateSessionMetrics(session.exercises),
    [session.exercises]
  );

  const activeDayIndex = Math.max(
    0,
    routine.days.findIndex((d) => d.id === routine.activeDayId)
  );
  const activeDay = routine.days[activeDayIndex] ?? routine.days[0];
  const allCompleted =
    metrics.totalExercisesCount > 0 &&
    metrics.completedExercisesCount === metrics.totalExercisesCount;

  const handleToggleExerciseComplete = async (exerciseIdx: number) => {
    const target = session.exercises[exerciseIdx];
    if (!target) return;
    const currentlyDone = isExerciseCompleted(target);
    const nextDone = !currentlyDone;

    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, completed: nextDone })),
      };
    });

    await updateActiveSession({ ...session, exercises: nextExercises });
    if (nextDone) {
      if (preferences.autoStartRestTimer) {
        timer.triggerAutoRest(preferences.defaultRestSeconds);
      }
      const nextPending = nextExercises.find(
        (ex, idx) => idx !== exerciseIdx && !isExerciseCompleted(ex)
      );
      if (nextPending) {
        setActiveExerciseId(nextPending.plannedExerciseId);
      }
    }
  };

  const handleToggleSingleSet = async (exerciseIdx: number, setIdx: number) => {
    let becameDone = false;
    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, sI) => {
          if (sI !== setIdx) return s;
          becameDone = !s.completed;
          return { ...s, completed: becameDone };
        }),
      };
    });

    await updateActiveSession({ ...session, exercises: nextExercises });
    if (becameDone && preferences.autoStartRestTimer) {
      timer.triggerAutoRest(preferences.defaultRestSeconds);
    }

    // Auto-advance focus to next uncompleted exercise when the active one finishes
    const updatedTarget = nextExercises[exerciseIdx];
    if (becameDone && updatedTarget && isExerciseCompleted(updatedTarget)) {
      const nextPending = nextExercises.find(
        (ex, idx) => idx !== exerciseIdx && !isExerciseCompleted(ex)
      );
      if (nextPending) {
        setActiveExerciseId(nextPending.plannedExerciseId);
      }
    }
  };

  const handleAdjustExerciseWeight = async (
    exerciseIdx: number,
    deltaDisplay: number
  ) => {
    const stepKg = convertToKg(Math.abs(deltaDisplay), preferences.weightUnit);
    const signedKg = deltaDisplay >= 0 ? stepKg : -stepKg;

    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weightKg: Math.max(0, Math.round((s.weightKg + signedKg) * 100) / 100),
        })),
      };
    });

    await updateActiveSession({ ...session, exercises: nextExercises });
  };

  const handleUpdateSetField = async (
    exerciseIdx: number,
    setIdx: number,
    field: 'weightKg' | 'reps' | 'rir',
    value: number
  ) => {
    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, sI) =>
          sI === setIdx ? { ...s, [field]: Math.max(0, value) } : s
        ),
      };
    });

    await updateActiveSession({ ...session, exercises: nextExercises });
  };

  const handleAddSetToExercise = async (exerciseIdx: number) => {
    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return {
        ...ex,
        sets: [
          ...ex.sets,
          {
            setNumber: ex.sets.length + 1,
            weightKg: last?.weightKg ?? ex.previousWeightKg,
            reps: last?.reps ?? ex.minReps,
            rir: last?.rir ?? (parseInt(ex.targetRir, 10) || 1),
            completed: false,
          },
        ],
      };
    });
    await updateActiveSession({ ...session, exercises: nextExercises });
  };

  const handleRemoveLastSet = async (exerciseIdx: number) => {
    const target = session.exercises[exerciseIdx];
    if (!target || target.sets.length <= 1) return;
    const nextExercises = session.exercises.map((ex, idx) => {
      if (idx !== exerciseIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.slice(0, -1),
      };
    });
    await updateActiveSession({ ...session, exercises: nextExercises });
  };

  const handleSwapSupersetPair = async (firstIdx: number, secondIdx: number) => {
    const copy = [...session.exercises];
    const tmp = copy[firstIdx];
    copy[firstIdx] = copy[secondIdx];
    copy[secondIdx] = tmp;
    await updateActiveSession({ ...session, exercises: copy });
  };

  const handleAddExerciseToSession = async (template: ExerciseTemplate) => {
    const plannedExerciseId = `adhoc-${Date.now()}`;
    const newLog: WorkoutExerciseLog = {
      plannedExerciseId,
      exerciseId: template.id,
      name: template.name,
      subtitle: template.subtitle,
      muscleGroup: template.muscleGroup,
      minReps: template.minReps,
      maxReps: template.maxReps,
      targetRir: template.targetRir,
      previousWeightKg: template.defaultWeightKg,
      previousReps: template.minReps,
      sets: Array.from({ length: template.defaultSets }, (_, i) => ({
        setNumber: i + 1,
        weightKg: template.defaultWeightKg,
        reps: template.minReps,
        rir: parseInt(template.targetRir, 10) || 1,
        completed: false,
      })),
    };

    await updateActiveSession({
      ...session,
      exercises: [...session.exercises, newLog],
    });
    setActiveExerciseId(plannedExerciseId);
  };

  const handleFinishWorkout = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      const { completedSession, progressedExercises } =
        await completeActiveSession(session);
      setCompletionSummary({
        volumeKg: completedSession.totalVolumeKg,
        validSets: completedSession.validSetsCount,
        progressed: progressedExercises,
      });
    } finally {
      setIsFinishing(false);
    }
  };

  const groupedBlocks = useMemo(() => {
    const blocks: Array<
      | { type: 'single'; index: number; exercise: WorkoutExerciseLog }
      | {
          type: 'superset';
          groupId: string;
          items: { index: number; exercise: WorkoutExerciseLog }[];
        }
    > = [];

    let i = 0;
    while (i < session.exercises.length) {
      const cur = session.exercises[i];
      const next = session.exercises[i + 1];
      if (
        cur.supersetGroupId &&
        next &&
        next.supersetGroupId === cur.supersetGroupId
      ) {
        const groupId = cur.supersetGroupId;
        const items: { index: number; exercise: WorkoutExerciseLog }[] = [];
        while (
          i < session.exercises.length &&
          session.exercises[i].supersetGroupId === groupId
        ) {
          items.push({ index: i, exercise: session.exercises[i] });
          i++;
        }
        blocks.push({ type: 'superset', groupId, items });
      } else {
        blocks.push({ type: 'single', index: i, exercise: cur });
        i++;
      }
    }
    return blocks;
  }, [session.exercises]);

  const unit = preferences.weightUnit;
  const incrementDisplay = convertFromKg(preferences.weightIncrementKg, unit);

  const renderExerciseRow = (exercise: WorkoutExerciseLog, index: number) => {
    const isCompleted = isExerciseCompleted(exercise);
    const isExpanded = activeExerciseId === exercise.plannedExerciseId;
    const primaryWeightKg =
      exercise.sets[0]?.weightKg ?? exercise.previousWeightKg;
    const primaryDisplay = formatWeightValue(primaryWeightKg, unit);
    const prevDisplay = formatWeightValue(exercise.previousWeightKg, unit);
    const progression = evaluateDoubleProgression(
      exercise,
      preferences.weightIncrementKg
    );
    const effortLabel = formatEffortTarget(
      exercise.targetRir,
      preferences.effortScale
    );

    if (!isExpanded) {
      return (
        <div
          key={exercise.plannedExerciseId}
          className="py-2 flex items-center justify-between gap-2 cursor-pointer group"
          onClick={() => setActiveExerciseId(exercise.plannedExerciseId)}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExerciseComplete(index);
              }}
              aria-label={
                isCompleted
                  ? `Desmarcar ${exercise.name}`
                  : `Concluir ${exercise.name}`
              }
              className="w-11 h-11 -ml-2.5 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isCompleted
                    ? 'bg-[#10B981] text-[#052E16]'
                    : 'border border-[#3F3F46] group-hover:border-[#A1A1AA]'
                }`}
              >
                {isCompleted && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
            </button>
            <span
              className={`text-[14px] font-medium truncate transition-colors ${
                isCompleted
                  ? 'line-through text-[#A1A1AA]/70'
                  : 'text-[#F4F4F5] group-hover:text-white'
              }`}
            >
              {exercise.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {preferences.doubleProgressionEnabled &&
              progression.eligibleForOverload && (
                <span className="font-mono text-[11px] font-medium text-[#10B981]">
                  +{formatWeightValue(preferences.weightIncrementKg, unit)}
                </span>
              )}
            <span className="font-mono text-[12px] text-[#A1A1AA]">
              {exercise.sets.length} × {exercise.minReps}–{exercise.maxReps} •{' '}
              {primaryDisplay} {unit}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        key={exercise.plannedExerciseId}
        className="animate-reveal my-2 rounded-lg bg-[#141417] border border-[#1F1F23] p-3.5 flex flex-col gap-3"
      >
        {/* Active Header */}
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer"
            onClick={() => setActiveExerciseId(null)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExerciseComplete(index);
              }}
              aria-label={
                isCompleted
                  ? `Desmarcar ${exercise.name}`
                  : `Concluir ${exercise.name}`
              }
              className="w-11 h-11 -ml-2 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isCompleted
                    ? 'bg-[#10B981] text-[#052E16]'
                    : 'border border-[#10B981]'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                )}
              </span>
            </button>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-[#F4F4F5] truncate leading-snug">
                {exercise.name}
              </h3>
              <p className="font-mono text-[11px] text-[#A1A1AA] mt-0.5">
                Ant: {prevDisplay} {unit} × {exercise.previousReps} •{' '}
                {effortLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleAdjustExerciseWeight(index, -incrementDisplay)}
              aria-label="Diminuir carga"
              className="w-11 h-11 rounded-md border border-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5] hover:border-[#27272A] flex items-center justify-center text-base active:scale-95 transition-all"
            >
              −
            </button>
            <span className="font-mono text-[12px] text-[#F4F4F5] min-w-[48px] text-center">
              {primaryDisplay} {unit}
            </span>
            <button
              type="button"
              onClick={() => handleAdjustExerciseWeight(index, incrementDisplay)}
              aria-label="Aumentar carga"
              className="w-11 h-11 rounded-md border border-[#1F1F23] text-[#10B981] hover:border-[#10B981]/50 flex items-center justify-center text-base active:scale-95 transition-all"
            >
              +
            </button>
          </div>
        </div>

        {/* Set-by-Set Matrix (without redundant Anterior column) */}
        <div className="flex flex-col divide-y divide-[#1F1F23]">
          <div className="grid grid-cols-[28px_1fr_1fr_44px] gap-2.5 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-[#A1A1AA]">
            <span>S</span>
            <span className="text-center">{unit}</span>
            <span className="text-center">Reps</span>
            <span className="text-center">Ok</span>
          </div>

          {exercise.sets.map((s, sIdx) => {
            const setWeightInUnit = convertFromKg(s.weightKg, unit);
            return (
              <div
                key={s.setNumber}
                className="grid grid-cols-[28px_1fr_1fr_44px] gap-2.5 items-center py-1.5"
              >
                <span className="font-mono text-[12px] text-[#A1A1AA]">
                  {s.setNumber}
                </span>

                <NumericInput
                  mode="decimal"
                  min={0}
                  value={setWeightInUnit}
                  formatValue={formatDisplayWeight}
                  onCommit={(val) =>
                    handleUpdateSetField(
                      index,
                      sIdx,
                      'weightKg',
                      convertToKg(val, unit)
                    )
                  }
                  ariaLabel={`Carga da série ${s.setNumber} em ${unit}`}
                  className="w-full h-11 bg-[#0A0A0C]/60 rounded-md border border-[#27272A] focus:border-[#10B981] text-center font-mono text-[14px] font-medium text-[#F4F4F5] focus:outline-none transition-colors"
                />

                <NumericInput
                  mode="numeric"
                  min={0}
                  value={s.reps}
                  onCommit={(val) =>
                    handleUpdateSetField(index, sIdx, 'reps', val)
                  }
                  ariaLabel={`Repetições da série ${s.setNumber}`}
                  className="w-full h-11 bg-[#0A0A0C]/60 rounded-md border border-[#27272A] focus:border-[#10B981] text-center font-mono text-[14px] font-medium text-[#F4F4F5] focus:outline-none transition-colors"
                />

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleToggleSingleSet(index, sIdx)}
                    aria-label={`Concluir série ${s.setNumber}`}
                    className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                        s.completed
                          ? 'bg-[#10B981] text-[#052E16]'
                          : 'border border-[#3F3F46] text-transparent hover:border-[#A1A1AA]'
                      }`}
                    >
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions & Double Progression Hint */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleAddSetToExercise(index)}
              className="min-h-[44px] px-3 rounded-md text-[12px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1F1F23]/60 active:scale-95 transition-all"
            >
              + Série
            </button>
            {exercise.sets.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveLastSet(index)}
                className="min-h-[44px] px-3 rounded-md text-[12px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1F1F23]/60 active:scale-95 transition-all"
              >
                − Série
              </button>
            )}
          </div>

          {preferences.doubleProgressionEnabled && (
            <span
              className={`font-mono text-[11px] text-right ${
                progression.eligibleForOverload
                  ? 'text-[#10B981] font-medium'
                  : 'text-[#A1A1AA]'
              }`}
            >
              {progression.eligibleForOverload
                ? `↑ +${formatWeightValue(preferences.weightIncrementKg, unit)} ${unit} na próxima`
                : `Meta: ${exercise.sets.length}×${exercise.maxReps} (+${formatWeightValue(preferences.weightIncrementKg, unit)} ${unit})`}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full pt-3">
      {/* SINGLE CLEAN TOP BAR */}
      <header className="flex flex-col gap-1 pb-3.5 border-b border-[#1F1F23]">
        <div className="flex items-center justify-between gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDayDropdownOpen((o) => !o)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-full bg-[#141417] border border-[#1F1F23] hover:border-[#27272A] text-[12px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] active:scale-95 transition-all"
            >
              <span>
                Dia {activeDayIndex + 1} de {routine.days.length}
              </span>
              <ChevronDown className="w-4 h-4 text-[#A1A1AA]" />
            </button>

            {dayDropdownOpen && (
              <div className="animate-reveal absolute left-0 mt-1.5 w-56 rounded-lg bg-[#141417] border border-[#27272A] shadow-2xl py-1 z-50">
                {routine.days.map((day) => {
                  const isCurrent = day.id === routine.activeDayId;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => {
                        setDayDropdownOpen(false);
                        setCompletionSummary(null);
                        switchActiveDay(day.id);
                      }}
                      className={`w-full min-h-[44px] px-3 text-left text-[13px] flex items-center justify-between transition-colors ${
                        isCurrent
                          ? 'text-[#10B981] font-medium bg-[#1F1F23]/50'
                          : 'text-[#F4F4F5] hover:bg-[#1F1F23]/40'
                      }`}
                    >
                      <span className="truncate">{day.shortLabel}</span>
                      {isCurrent && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-[#1F1F23]" />
                <button
                  type="button"
                  onClick={() => {
                    setDayDropdownOpen(false);
                    onNavigateTab('rotinas');
                  }}
                  className="w-full min-h-[44px] px-3 text-left text-[13px] text-[#A1A1AA] hover:text-[#F4F4F5] flex items-center gap-2 transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Editar Rotina
                </button>
              </div>
            )}
          </div>

          <span className="font-mono text-[13px] text-[#A1A1AA] tabular-nums">
            {formatTimerSeconds(elapsedSeconds)}
          </span>
        </div>

        <h1 className="font-headline text-[18px] font-semibold tracking-tight text-[#F4F4F5] leading-snug">
          {activeDay?.fullTitle ?? routine.name}
        </h1>
      </header>

      {/* COMPLETION NOTICE (INLINE MINIMAL) */}
      {completionSummary && (
        <div className="animate-reveal py-2.5 border-b border-[#1F1F23] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
            <p className="text-[12px] text-[#F4F4F5] truncate">
              Salvo:{' '}
              <span className="font-mono text-[#10B981]">
                {Math.round(convertFromKg(completionSummary.volumeKg, unit))}{' '}
                {unit}
              </span>{' '}
              • {completionSummary.validSets} séries
              {completionSummary.progressed.length > 0 &&
                ` • +Carga em ${completionSummary.progressed.length}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCompletionSummary(null)}
            aria-label="Fechar resumo"
            className="w-11 h-11 -mr-2 flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* EXERCISE LIST WITH HAIRLINE DIVIDERS & PROGRESSIVE DISCLOSURE */}
      <div className="flex flex-col divide-y divide-[#1F1F23]">
        {groupedBlocks.map((block) => {
          if (block.type === 'single') {
            return renderExerciseRow(block.exercise, block.index);
          }

          return (
            <div key={block.groupId} className="py-1.5">
              <div className="border-l-2 border-[#10B981]/50 pl-3 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-[#10B981] uppercase">
                    SS • Superset
                  </span>
                  {block.items.length >= 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSwapSupersetPair(
                          block.items[0].index,
                          block.items[1].index
                        )
                      }
                      aria-label="Inverter ordem do superset"
                      className="min-w-[44px] min-h-[44px] -mr-2 text-[#A1A1AA] hover:text-[#F4F4F5] flex items-center justify-center active:scale-95 transition-all"
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="divide-y divide-[#1F1F23]">
                  {block.items.map((item) =>
                    renderExerciseRow(item.exercise, item.index)
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {session.exercises.length === 0 && (
          <div className="py-12 text-center text-[13px] text-[#A1A1AA]">
            Nenhum exercício neste dia. Adicione abaixo ou configure a rotina.
          </div>
        )}
      </div>

      {/* BOTTOM WORKOUT ACTIONS */}
      <div className="pt-6 pb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="h-11 px-4 rounded-lg border border-[#1F1F23] text-[13px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:border-[#27272A] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Exercício
        </button>

        <button
          type="button"
          disabled={isFinishing}
          onClick={handleFinishWorkout}
          className={`flex-1 h-11 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 ${
            allCompleted
              ? 'bg-[#10B981] text-[#052E16]'
              : 'bg-[#F4F4F5] text-[#0A0A0C] hover:bg-white'
          }`}
        >
          <span>{isFinishing ? 'Salvando...' : 'Concluir Treino'}</span>
          {metrics.totalExercisesCount > 0 && (
            <span className="font-mono text-[11px] opacity-75">
              {metrics.completedExercisesCount}/{metrics.totalExercisesCount}
            </span>
          )}
        </button>
      </div>

      {/* FLOATING COMPACT BOTTOM TIMER PILL */}
      <div className="fixed bottom-nav-offset left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-24px)]">
        <div className="relative overflow-hidden min-h-[48px] px-2 rounded-full bg-[#141417]/95 border border-[#27272A] shadow-2xl backdrop-blur-md flex items-center gap-0.5">
          <button
            type="button"
            onClick={timer.toggle}
            className="min-h-[44px] px-2.5 flex items-center gap-1.5 text-[12px] font-mono text-[#F4F4F5] hover:text-[#10B981] active:scale-95 transition-all"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                timer.isRunning ? 'bg-[#10B981] animate-pulse' : 'bg-[#71717A]'
              }`}
            />
            <span className="text-[#A1A1AA] text-[11px] font-sans">
              Descanso
            </span>
            <span className="font-semibold tabular-nums">
              {timer.formattedTime}
            </span>
          </button>

          <div className="w-px h-4 bg-[#1F1F23] shrink-0" />

          <div className="flex items-center font-mono text-[11px]">
            <button
              type="button"
              onClick={() => timer.adjustSeconds(-15)}
              className="min-h-[44px] min-w-[44px] px-2 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1F1F23]/70 flex items-center justify-center active:scale-95 transition-all"
            >
              -15s
            </button>
            <button
              type="button"
              onClick={() => timer.adjustSeconds(15)}
              className="min-h-[44px] min-w-[44px] px-2 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1F1F23]/70 flex items-center justify-center active:scale-95 transition-all"
            >
              +15s
            </button>
            <button
              type="button"
              onClick={timer.reset}
              className="min-h-[44px] min-w-[44px] px-2.5 rounded-full text-[#A1A1AA] hover:text-[#10B981] font-sans font-medium flex items-center justify-center active:scale-95 transition-all"
            >
              {timer.isRunning ? 'Pular' : 'Reset'}
            </button>
          </div>

          <div className="absolute bottom-0 inset-x-0 h-[2px] bg-[#1F1F23]">
            <div
              className="h-full bg-[#10B981] transition-[width] duration-300 ease-linear"
              style={{ width: `${timer.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ADD EXERCISE MODAL */}
      <AddExerciseModal
        isOpen={isAddModalOpen}
        catalog={catalog}
        weightUnit={unit}
        onClose={() => setIsAddModalOpen(false)}
        onSelectExercise={handleAddExerciseToSession}
        onCreateCustomExercise={addExerciseToCatalog}
      />
    </div>
  );
};
