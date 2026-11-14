import { Plus, PlusCircle, Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { convertToKg } from '../domain/progression';
import type {
  ExerciseTemplate,
  MuscleGroup,
  WeightUnit,
} from '../domain/types';
import { NumericInput } from './NumericInput';

interface AddExerciseModalProps {
  isOpen: boolean;
  catalog: ExerciseTemplate[];
  weightUnit?: WeightUnit;
  onClose: () => void;
  onSelectExercise: (template: ExerciseTemplate) => void;
  onCreateCustomExercise: (template: ExerciseTemplate) => Promise<void>;
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  'Peitoral',
  'Costas',
  'Pernas',
  'Ombros',
  'Braços',
  'Core',
];

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({
  isOpen,
  catalog,
  weightUnit = 'kg',
  onClose,
  onSelectExercise,
  onCreateCustomExercise,
}) => {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | 'Todos'>(
    'Todos'
  );
  const [isCreating, setIsCreating] = useState(false);

  const [customName, setCustomName] = useState('');
  const [customSubtitle, setCustomSubtitle] = useState('');
  const [customGroup, setCustomGroup] = useState<MuscleGroup>('Peitoral');
  const [customSets, setCustomSets] = useState(3);
  const [customMinReps, setCustomMinReps] = useState(8);
  const [customMaxReps, setCustomMaxReps] = useState(12);
  const [customWeight, setCustomWeight] = useState(
    weightUnit === 'lb' ? 45 : 20
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesGroup =
        selectedGroup === 'Todos' || item.muscleGroup === selectedGroup;
      const matchesText =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q);
      return matchesGroup && matchesText;
    });
  }, [catalog, search, selectedGroup]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const safeMin = Math.max(1, customMinReps);
    const safeMax = Math.max(safeMin, customMaxReps);
    const weightKg = convertToKg(Math.max(0, customWeight), weightUnit);

    const created: ExerciseTemplate = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      subtitle: customSubtitle.trim() || `${customGroup} Movement`,
      muscleGroup: customGroup,
      defaultSets: Math.max(1, customSets),
      minReps: safeMin,
      maxReps: safeMax,
      targetRir: '1-2',
      defaultWeightKg: weightKg,
    };
    await onCreateCustomExercise(created);
    onSelectExercise(created);
    setCustomName('');
    setCustomSubtitle('');
    setCustomSets(3);
    setCustomMinReps(8);
    setCustomMaxReps(12);
    setIsCreating(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isCreating ? 'Novo Exercício' : 'Adicionar Exercício'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="animate-modal w-full max-w-[440px] bg-[#141417] border border-[#27272A] rounded-t-2xl sm:rounded-2xl max-h-[88dvh] flex flex-col overflow-hidden pb-safe">
        <div className="px-4 py-3 border-b border-[#1F1F23] flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#10B981]">
              Catálogo PulseLog
            </span>
            <h3 className="font-headline text-[17px] font-bold text-[#F4F4F5]">
              {isCreating ? 'Novo Exercício' : 'Adicionar Exercício'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="w-11 h-11 rounded-lg bg-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5] flex items-center justify-center active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isCreating ? (
          <form
            onSubmit={handleCreate}
            className="p-4 flex flex-col gap-3.5 overflow-y-auto"
          >
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                Nome do Movimento
              </label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Supino Inclinado Halteres"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] placeholder-[#71717A] text-[14px] outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                Subtítulo / Variação (opcional)
              </label>
              <input
                type="text"
                value={customSubtitle}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                placeholder="Ex: Incline DB Press 30°"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] placeholder-[#71717A] text-[14px] outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                  Grupamento
                </label>
                <select
                  value={customGroup}
                  onChange={(e) =>
                    setCustomGroup(e.target.value as MuscleGroup)
                  }
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] text-[14px] outline-none"
                >
                  {MUSCLE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                  Carga Inicial ({weightUnit})
                </label>
                <NumericInput
                  mode="decimal"
                  min={0}
                  value={customWeight}
                  onCommit={setCustomWeight}
                  ariaLabel={`Carga Inicial em ${weightUnit}`}
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] font-mono text-[15px] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                  Séries
                </label>
                <NumericInput
                  mode="numeric"
                  min={1}
                  max={10}
                  value={customSets}
                  onCommit={setCustomSets}
                  ariaLabel="Séries"
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] font-mono text-[15px] text-center outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                  Reps Min
                </label>
                <NumericInput
                  mode="numeric"
                  min={1}
                  max={50}
                  value={customMinReps}
                  onCommit={setCustomMinReps}
                  ariaLabel="Repetições mínimas"
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] font-mono text-[15px] text-center outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-[#A1A1AA]">
                  Reps Máx
                </label>
                <NumericInput
                  mode="numeric"
                  min={1}
                  max={50}
                  value={customMaxReps}
                  onCommit={setCustomMaxReps}
                  ariaLabel="Repetições máximas"
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0A0C] border border-[#27272A] focus:border-[#10B981] text-[#F4F4F5] font-mono text-[15px] text-center outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="flex-1 h-11 rounded-lg bg-[#1F1F23] text-[#F4F4F5] font-headline text-[14px] font-semibold active:scale-95 transition-all"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-lg bg-[#10B981] text-[#052E16] font-headline text-[14px] font-bold active:scale-95 transition-all"
              >
                Criar e Adicionar
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="p-3 border-b border-[#1F1F23] flex flex-col gap-2.5">
              <div className="flex items-center gap-2 bg-[#0A0A0C] border border-[#27272A] focus-within:border-[#10B981] rounded-lg pl-3 pr-1 h-11">
                <Search className="w-4 h-4 text-[#A1A1AA] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar exercício..."
                  className="w-full bg-transparent text-[#F4F4F5] text-[14px] outline-none placeholder-[#71717A]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="w-10 h-10 flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] active:scale-95 transition-all shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {(['Todos', ...MUSCLE_GROUPS] as const).map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setSelectedGroup(group)}
                    className={`min-h-[44px] px-3.5 rounded-lg font-mono text-[11px] uppercase whitespace-nowrap transition-all active:scale-95 ${
                      selectedGroup === group
                        ? 'bg-[#10B981] text-[#052E16] font-bold'
                        : 'bg-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectExercise(item);
                    onClose();
                  }}
                  className="w-full min-h-[56px] text-left p-3 rounded-xl bg-[#1C1C20]/70 border border-[#1F1F23] hover:border-[#10B981]/60 flex items-center justify-between gap-2 active:scale-[0.98] transition-all"
                >
                  <div className="min-w-0">
                    <p className="font-headline text-[15px] font-semibold text-[#F4F4F5] truncate">
                      {item.name}
                    </p>
                    <p className="text-[12px] text-[#A1A1AA] truncate">
                      {item.subtitle} • {item.muscleGroup}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[12px] text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded">
                      {item.defaultSets}×{item.minReps}-{item.maxReps}
                    </span>
                    <PlusCircle className="w-5 h-5 text-[#10B981]" />
                  </div>
                </button>
              ))}

              {filtered.length === 0 && (
                <p className="text-center text-[13px] text-[#A1A1AA] py-6">
                  Nenhum exercício encontrado no catálogo.
                </p>
              )}
            </div>

            <div className="p-3 border-t border-[#1F1F23] bg-[#0A0A0C]">
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full h-11 rounded-xl bg-[#1F1F23] border border-[#27272A] hover:border-[#10B981]/60 text-[#10B981] font-headline text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Exercício Personalizado</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
