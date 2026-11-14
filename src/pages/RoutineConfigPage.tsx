import {
  ChevronDown,
  ChevronUp,
  Link2,
  Plus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddExerciseModal } from '../components/AddExerciseModal';
import { NumericInput } from '../components/NumericInput';
import { addExerciseToCatalog, saveRoutine } from '../db/database';
import { convertFromKg, convertToKg } from '../domain/progression';
import type {
  AppTab,
  DurationTarget,
  ExerciseTemplate,
  PlannedExercise,
  Routine,
  UserPreferences,
} from '../domain/types';

interface RoutineConfigPageProps {
  routine: Routine;
  catalog: ExerciseTemplate[];
  preferences: UserPreferences;
  onNavigateTab: (tab: AppTab) => void;
}

const DURATIONS: DurationTarget[] = [40, 45, 50, 60];
const RIR_OPTIONS = ['0-1', '1', '1-2', '2', '2-3'];

function formatDisplayWeight(val: number): string {
  return Number.isInteger(val) ? val.toFixed(1) : String(val);
}

export const RoutineConfigPage: React.FC<RoutineConfigPageProps> = ({
  routine,
  catalog,
  preferences,
}) => {
  const [draft, setDraft] = useState<Routine>(routine);
  const [selectedDayId, setSelectedDayId] = useState<string>(
    routine.activeDayId || routine.days[0]?.id
  );
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(
    null
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [confirmRemoveDayId, setConfirmRemoveDayId] = useState<string | null>(
    null
  );
  const [undoRemoved, setUndoRemoved] = useState<{
    dayId: string;
    index: number;
    exercise: PlannedExercise;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const unit = preferences.weightUnit;
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(routine),
    [draft, routine]
  );

  useEffect(() => {
    setDraft(routine);
  }, [routine]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const activeDay = useMemo(
    () => draft.days.find((d) => d.id === selectedDayId) ?? draft.days[0],
    [draft.days, selectedDayId]
  );

  const updateDayExercises = (
    updater: (exercises: PlannedExercise[]) => PlannedExercise[]
  ) => {
    if (!activeDay) return;
    setDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.id === activeDay.id
          ? { ...day, exercises: updater(day.exercises) }
          : day
      ),
    }));
  };

  const handleMoveExercise = (index: number, direction: -1 | 1) => {
    if (!activeDay) return;
    const target = index + direction;
    if (target < 0 || target >= activeDay.exercises.length) return;
    updateDayExercises((list) => {
      const next = [...list];
      const item = next[index];
      next[index] = next[target];
      next[target] = item;
      return next;
    });
  };

  const handleRemoveExercise = (id: string) => {
    if (!activeDay) return;
    const index = activeDay.exercises.findIndex((ex) => ex.id === id);
    const removed = activeDay.exercises[index];
    updateDayExercises((list) => list.filter((ex) => ex.id !== id));
    if (editingExerciseId === id) {
      setEditingExerciseId(null);
    }

    if (removed) {
      setUndoRemoved({ dayId: activeDay.id, index, exercise: removed });
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => {
        setUndoRemoved(null);
      }, 5000);
    }
  };

  const handleUndoRemove = () => {
    if (!undoRemoved) return;
    setDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.id !== undoRemoved.dayId) return day;
        const next = [...day.exercises];
        const insertAt = Math.min(undoRemoved.index, next.length);
        next.splice(insertAt, 0, undoRemoved.exercise);
        return { ...day, exercises: next };
      }),
    }));
    setUndoRemoved(null);
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const handleUpdateExercise = (
    id: string,
    patch: Partial<PlannedExercise>
  ) => {
    updateDayExercises((list) =>
      list.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex))
    );
  };

  const handleToggleSupersetWithNext = (index: number) => {
    if (!activeDay) return;
    const current = activeDay.exercises[index];
    const next = activeDay.exercises[index + 1];
    if (!current || !next) return;

    const alreadyLinked =
      Boolean(current.supersetGroupId) &&
      current.supersetGroupId === next.supersetGroupId;

    updateDayExercises((list) =>
      list.map((ex, idx) => {
        if (alreadyLinked) {
          if (idx === index || idx === index + 1) {
            return { ...ex, supersetGroupId: undefined };
          }
          return ex;
        }
        const groupId = current.supersetGroupId || `ss-${Date.now()}`;
        if (idx === index || idx === index + 1) {
          return { ...ex, supersetGroupId: groupId };
        }
        return ex;
      })
    );
  };

  const handleAddPlannedExercise = (template: ExerciseTemplate) => {
    const id = `p-${Date.now()}`;
    const newPlanned: PlannedExercise = {
      id,
      exerciseId: template.id,
      name: template.name,
      subtitle: template.subtitle,
      muscleGroup: template.muscleGroup,
      sets: template.defaultSets,
      minReps: template.minReps,
      maxReps: template.maxReps,
      targetRir: template.targetRir,
      targetWeightKg: template.defaultWeightKg,
      previousWeightKg: template.defaultWeightKg,
      previousReps: template.minReps,
    };
    updateDayExercises((list) => [...list, newPlanned]);
    setEditingExerciseId(id);
  };

  const handleAddDay = () => {
    const num = draft.days.length + 1;
    const newDayId = `day-${num}-${Date.now()}`;
    setDraft((prev) => ({
      ...prev,
      days: [
        ...prev.days,
        {
          id: newDayId,
          shortLabel: `Dia ${num} • Extra`,
          fullTitle: `Dia ${num}: Sessão Personalizada`,
          exercises: [],
        },
      ],
    }));
    setSelectedDayId(newDayId);
    setConfirmRemoveDayId(null);
  };

  const handleRemoveActiveDay = () => {
    if (!activeDay || draft.days.length <= 1) return;
    const remaining = draft.days.filter((d) => d.id !== activeDay.id);
    setDraft((prev) => ({
      ...prev,
      days: remaining,
      activeDayId:
        prev.activeDayId === activeDay.id
          ? remaining[0].id
          : prev.activeDayId,
    }));
    setSelectedDayId(remaining[0].id);
    setConfirmRemoveDayId(null);
  };

  const handleSave = async () => {
    await saveRoutine({
      ...draft,
      activeDayId: activeDay?.id ?? selectedDayId,
    });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 1800);
  };

  const handleDiscard = () => {
    setDraft(routine);
    setSelectedDayId(routine.activeDayId || routine.days[0]?.id);
    setConfirmRemoveDayId(null);
  };

  const handleCycleDuration = () => {
    const idx = DURATIONS.indexOf(draft.durationTargetMin);
    const next = DURATIONS[(idx + 1) % DURATIONS.length];
    setDraft((prev) => ({ ...prev, durationTargetMin: next }));
  };

  const groupedItems = useMemo(() => {
    const blocks: Array<
      | { type: 'single'; index: number; exercise: PlannedExercise }
      | {
          type: 'superset';
          groupId: string;
          items: { index: number; exercise: PlannedExercise }[];
        }
    > = [];

    let i = 0;
    const list = activeDay?.exercises ?? [];
    while (i < list.length) {
      const cur = list[i];
      const next = list[i + 1];
      if (
        cur.supersetGroupId &&
        next &&
        next.supersetGroupId === cur.supersetGroupId
      ) {
        const gid = cur.supersetGroupId;
        const items: { index: number; exercise: PlannedExercise }[] = [];
        while (i < list.length && list[i].supersetGroupId === gid) {
          items.push({ index: i, exercise: list[i] });
          i++;
        }
        blocks.push({ type: 'superset', groupId: gid, items });
      } else {
        blocks.push({ type: 'single', index: i, exercise: cur });
        i++;
      }
    }
    return blocks;
  }, [activeDay]);

  const renderExerciseRow = (exercise: PlannedExercise, index: number) => {
    const isEditing = editingExerciseId === exercise.id;
    const nextEx = activeDay.exercises[index + 1];
    const isLinkedWithNext =
      Boolean(exercise.supersetGroupId) &&
      nextEx?.supersetGroupId === exercise.supersetGroupId;

    return (
      <div key={exercise.id} className="py-3 flex flex-col gap-1">
        {/* Line 1: Name + Core Pills */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-medium text-[#F4F4F5] truncate min-w-0 flex-1">
            {exercise.name}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setEditingExerciseId(isEditing ? null : exercise.id)
              }
              className={`min-h-[44px] px-3 rounded-lg text-[12px] font-mono border transition-all active:scale-95 ${
                isEditing
                  ? 'border-[#10B981] text-[#10B981] bg-[#141417]'
                  : 'border-[#1F1F23] text-[#A1A1AA] hover:border-[#27272A] hover:text-[#F4F4F5]'
              }`}
            >
              {exercise.sets} × {exercise.minReps}–{exercise.maxReps}
            </button>

            <button
              type="button"
              onClick={() => {
                const idx = RIR_OPTIONS.indexOf(exercise.targetRir);
                const nextRir = RIR_OPTIONS[(idx + 1) % RIR_OPTIONS.length];
                handleUpdateExercise(exercise.id, { targetRir: nextRir });
              }}
              title="Alternar alvo RIR"
              className="min-h-[44px] px-3 rounded-lg text-[12px] font-mono border border-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5] hover:border-[#27272A] transition-all active:scale-95"
            >
              RIR {exercise.targetRir}
            </button>
          </div>
        </div>

        {/* Line 2: Ergonomic 44x44 Action Controls (separated link & remove) */}
        <div className="flex items-center justify-between gap-2 -mx-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => handleMoveExercise(index, -1)}
              aria-label="Mover para cima"
              className="w-11 h-11 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-20 active:scale-95 transition-all"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={index === activeDay.exercises.length - 1}
              onClick={() => handleMoveExercise(index, 1)}
              aria-label="Mover para baixo"
              className="w-11 h-11 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-20 active:scale-95 transition-all"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {index < activeDay.exercises.length - 1 && (
              <button
                type="button"
                onClick={() => handleToggleSupersetWithNext(index)}
                title={
                  isLinkedWithNext
                    ? 'Desvincular Superset'
                    : 'Vincular Superset com o próximo'
                }
                aria-label="Vincular Superset"
                className={`min-h-[44px] px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-mono transition-all active:scale-95 ${
                  isLinkedWithNext
                    ? 'text-[#10B981] bg-[#10B981]/10'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>{isLinkedWithNext ? 'Superset' : 'Vincular'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleRemoveExercise(exercise.id)}
            aria-label={`Remover ${exercise.name}`}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-400 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inline Parameter Editor (Progressive Disclosure) */}
        {isEditing && (
          <div className="animate-reveal mt-1 p-3 rounded-lg bg-[#141417] border border-[#1F1F23] grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-[#A1A1AA]">
                Séries
              </span>
              <NumericInput
                mode="numeric"
                min={1}
                max={10}
                value={exercise.sets}
                onCommit={(val) =>
                  handleUpdateExercise(exercise.id, { sets: val })
                }
                ariaLabel="Séries"
                className="w-full h-11 bg-[#0A0A0C] rounded-md border border-[#27272A] focus:border-[#10B981] px-3 font-mono text-[14px] text-[#F4F4F5] focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-[#A1A1AA]">
                Reps Min
              </span>
              <NumericInput
                mode="numeric"
                min={1}
                max={50}
                value={exercise.minReps}
                onCommit={(val) =>
                  handleUpdateExercise(exercise.id, { minReps: val })
                }
                ariaLabel="Repetições mínimas"
                className="w-full h-11 bg-[#0A0A0C] rounded-md border border-[#27272A] focus:border-[#10B981] px-3 font-mono text-[14px] text-[#F4F4F5] focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-[#A1A1AA]">
                Reps Máx
              </span>
              <NumericInput
                mode="numeric"
                min={1}
                max={50}
                value={exercise.maxReps}
                onCommit={(val) =>
                  handleUpdateExercise(exercise.id, { maxReps: val })
                }
                ariaLabel="Repetições máximas"
                className="w-full h-11 bg-[#0A0A0C] rounded-md border border-[#27272A] focus:border-[#10B981] px-3 font-mono text-[14px] text-[#F4F4F5] focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-[#A1A1AA]">
                Carga ({unit})
              </span>
              <NumericInput
                mode="decimal"
                min={0}
                value={convertFromKg(exercise.targetWeightKg, unit)}
                formatValue={formatDisplayWeight}
                onCommit={(val) =>
                  handleUpdateExercise(exercise.id, {
                    targetWeightKg: convertToKg(val, unit),
                  })
                }
                ariaLabel={`Carga em ${unit}`}
                className="w-full h-11 bg-[#0A0A0C] rounded-md border border-[#27272A] focus:border-[#10B981] px-3 font-mono text-[14px] text-[#F4F4F5] focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full pt-3">
      {/* CLEAN HEADER */}
      <header className="flex items-center justify-between pb-3.5 border-b border-[#1F1F23]">
        <h1 className="font-headline text-[18px] font-semibold tracking-tight text-[#F4F4F5]">
          Editar Rotina
        </h1>

        <button
          type="button"
          onClick={handleSave}
          className="min-h-[44px] px-3 -mr-3 rounded-lg text-[13px] font-semibold text-[#10B981] hover:text-[#34D399] active:scale-95 transition-all"
        >
          {savedToast ? 'Salvo ✓' : 'Salvar'}
        </button>
      </header>

      {/* ROUTINE NAME & DURATION PILL */}
      <div className="py-3.5 border-b border-[#1F1F23] flex items-center justify-between gap-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="Nome da rotina"
          className="flex-1 min-h-[44px] bg-transparent text-[15px] font-medium text-[#F4F4F5] focus:outline-none border-b border-transparent focus:border-[#10B981]"
        />
        <button
          type="button"
          onClick={handleCycleDuration}
          className="min-h-[44px] px-3 rounded-full bg-[#141417] border border-[#1F1F23] font-mono text-[11px] text-[#A1A1AA] hover:border-[#27272A] hover:text-[#F4F4F5] shrink-0 active:scale-95 transition-all"
        >
          {draft.durationTargetMin}m alvo
        </button>
      </div>

      {/* COMPACT DAY PILLS */}
      <div className="py-3.5 border-b border-[#1F1F23] flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {draft.days.map((day, idx) => {
            const isSelected = day.id === activeDay?.id;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setSelectedDayId(day.id);
                  setConfirmRemoveDayId(null);
                }}
                className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-[#141417] border border-[#10B981]/60 text-[#10B981]'
                    : 'border border-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5]'
                }`}
              >
                Dia {idx + 1}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleAddDay}
            aria-label="Adicionar dia de treino"
            className="w-11 h-11 rounded-full border border-dashed border-[#27272A] text-[#A1A1AA] hover:text-[#F4F4F5] flex items-center justify-center shrink-0 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {activeDay && (
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={activeDay.fullTitle}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((prev) => ({
                  ...prev,
                  days: prev.days.map((d) =>
                    d.id === activeDay.id
                      ? { ...d, fullTitle: value, shortLabel: value }
                      : d
                  ),
                }));
              }}
              placeholder="Título da sessão"
              className="flex-1 min-h-[44px] bg-transparent text-[13px] text-[#A1A1AA] focus:text-[#F4F4F5] focus:outline-none"
            />

            {draft.days.length > 1 &&
              (confirmRemoveDayId === activeDay.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleRemoveActiveDay}
                    className="min-h-[44px] px-3 rounded-lg text-[11px] font-mono text-red-400 bg-red-400/10 active:scale-95 transition-all"
                  >
                    Excluir dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveDayId(null)}
                    className="min-h-[44px] px-2.5 rounded-lg text-[11px] font-mono text-[#A1A1AA] active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveDayId(activeDay.id)}
                  aria-label="Remover dia selecionado"
                  className="w-11 h-11 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-400 shrink-0 active:scale-95 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ))}
          </div>
        )}
      </div>

      {/* UNDO REMOVE TOAST */}
      {undoRemoved && (
        <div className="animate-reveal mt-3 px-3 py-1 rounded-lg bg-[#141417] border border-[#27272A] flex items-center justify-between gap-2">
          <span className="text-[12px] text-[#A1A1AA] truncate">
            Removido: {undoRemoved.exercise.name}
          </span>
          <button
            type="button"
            onClick={handleUndoRemove}
            className="min-h-[44px] px-3 flex items-center gap-1.5 text-[12px] font-medium text-[#10B981] shrink-0 active:scale-95 transition-all"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Desfazer
          </button>
        </div>
      )}

      {/* BORDERLESS EXERCISE LIST */}
      <div className="flex flex-col divide-y divide-[#1F1F23]">
        {groupedItems.map((block) => {
          if (block.type === 'single') {
            return renderExerciseRow(block.exercise, block.index);
          }
          return (
            <div key={block.groupId} className="py-1.5">
              <div className="border-l-2 border-[#10B981]/50 pl-3 flex flex-col">
                <span className="font-mono text-[10px] font-semibold tracking-wider text-[#10B981] uppercase pt-1">
                  SS • Superset
                </span>
                <div className="divide-y divide-[#1F1F23]">
                  {block.items.map((item) =>
                    renderExerciseRow(item.exercise, item.index)
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {(!activeDay || activeDay.exercises.length === 0) && (
          <div className="py-10 text-center text-[13px] text-[#A1A1AA]">
            Nenhum exercício configurado neste dia.
          </div>
        )}
      </div>

      {/* SINGLE ADD EXERCISE BUTTON */}
      <button
        type="button"
        onClick={() => setIsAddModalOpen(true)}
        className="mt-4 h-11 rounded-lg border border-dashed border-[#27272A] hover:border-[#10B981]/60 text-[13px] font-medium text-[#A1A1AA] hover:text-[#10B981] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
      >
        <Plus className="w-4 h-4" />
        Adicionar Exercício
      </button>

      {/* THUMB-ZONE FLOATING SAVE BAR WHEN DIRTY */}
      {isDirty && (
        <div className="fixed bottom-nav-offset left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2.5rem)] max-w-[440px]">
          <div className="animate-reveal p-1.5 rounded-xl bg-[#141417]/95 border border-[#27272A] shadow-2xl backdrop-blur-md flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              className="h-11 px-4 rounded-lg bg-[#1F1F23] text-[13px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] active:scale-95 transition-all"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 h-11 rounded-lg bg-[#10B981] text-[#052E16] text-[13px] font-semibold active:scale-[0.98] transition-all"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      <AddExerciseModal
        isOpen={isAddModalOpen}
        catalog={catalog}
        weightUnit={unit}
        onClose={() => setIsAddModalOpen(false)}
        onSelectExercise={handleAddPlannedExercise}
        onCreateCustomExercise={addExerciseToCatalog}
      />
    </div>
  );
};
