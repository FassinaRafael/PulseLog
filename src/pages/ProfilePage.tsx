import { Check, ChevronRight, Pencil, X } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import {
  exportBackupJson,
  exportHistoryCsv,
  importBackupJson,
  resetToSeedData,
} from '../db/backup';
import { updatePreferences } from '../db/database';
import { calculateAthleteStats } from '../domain/metrics';
import { formatWeightValue } from '../domain/progression';
import type {
  EffortScale,
  RestPresetSeconds,
  Routine,
  UserPreferences,
  WeightIncrementKg,
  WeightUnit,
  WorkoutSession,
} from '../domain/types';

interface ProfilePageProps {
  routine: Routine;
  sessions: WorkoutSession[];
  preferences: UserPreferences;
}

const REST_OPTIONS: { label: string; seconds: RestPresetSeconds }[] = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2m', seconds: 120 },
  { label: '3m', seconds: 180 },
];

const INCREMENT_OPTIONS: WeightIncrementKg[] = [1.25, 2.5, 5];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  routine,
  sessions,
  preferences,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(preferences.athleteName);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const stats = useMemo(() => calculateAthleteStats(sessions), [sessions]);

  const initials = useMemo(() => {
    const parts = preferences.athleteName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) || 'PL').toUpperCase();
  }, [preferences.athleteName]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2800);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim() || 'Atleta PulseLog';
    await updatePreferences({ athleteName: trimmed });
    setIsEditingName(false);
    showToast('Nome atualizado.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await importBackupJson(file);
      showToast(
        `Restaurado: ${res.sessionsCount} sessões e ${res.routinesCount} rotina(s).`
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Falha ao importar backup.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmReset = async () => {
    await resetToSeedData();
    setIsConfirmingReset(false);
    showToast('Dados restaurados para o padrão inicial.');
  };

  return (
    <div className="flex flex-col w-full pt-3 pb-8">
      {/* CLEAN HEADER */}
      <header className="flex items-center justify-between pb-4 border-b border-[#1F1F23]">
        <h1 className="font-headline text-[18px] font-semibold tracking-tight text-[#F4F4F5]">
          Perfil
        </h1>
        {feedback && (
          <span className="font-mono text-[11px] text-[#10B981]">
            {feedback}
          </span>
        )}
      </header>

      {/* SINGLE BORDERLESS ATHLETE ROW */}
      <section className="py-4 border-b border-[#1F1F23] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-full bg-[#141417] border border-[#1F1F23] flex items-center justify-center font-mono text-[12px] font-semibold text-[#10B981] shrink-0">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  autoFocus
                  className="w-full max-w-[200px] min-h-[44px] bg-transparent border-b border-[#10B981] text-[14px] font-medium text-[#F4F4F5] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  aria-label="Salvar nome"
                  className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg text-[12px] font-semibold text-[#10B981] hover:bg-[#141417] flex items-center justify-center gap-1 active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Ok</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  aria-label="Cancelar edição"
                  className="w-11 h-11 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] flex items-center justify-center active:scale-95 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameInput(preferences.athleteName);
                  setIsEditingName(true);
                }}
                className="min-h-[44px] -my-1.5 text-left group flex items-center gap-2 active:scale-[0.99] transition-all"
              >
                <span className="text-[15px] font-semibold text-[#F4F4F5] truncate">
                  {preferences.athleteName}
                </span>
                <Pencil className="w-3.5 h-3.5 text-[#A1A1AA] group-hover:text-[#F4F4F5] shrink-0" />
              </button>
            )}

            <p className="font-mono text-[11px] text-[#A1A1AA] mt-0.5 truncate">
              {stats.totalWorkouts} treinos • {stats.activeWeeks} sem •{' '}
              {stats.streakWeeks} seq • {routine.name}
            </p>
          </div>
        </div>
      </section>

      {/* SINGLE-LINE PREFERENCES LIST */}
      <section className="pt-5">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#A1A1AA] mb-1">
          Preferências
        </h2>

        <div className="flex flex-col divide-y divide-[#1F1F23]">
          {/* Unidade de Peso */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">Unidade de Peso</span>
            <div className="flex items-center bg-[#141417] border border-[#1F1F23] rounded-lg p-0.5">
              {(['kg', 'lb'] as WeightUnit[]).map((u) => {
                const active = preferences.weightUnit === u;
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => updatePreferences({ weightUnit: u })}
                    className={`min-h-[44px] min-w-[44px] px-3 rounded-md text-[12px] font-mono uppercase transition-all active:scale-95 ${
                      active
                        ? 'bg-[#1F1F23] text-[#F4F4F5] font-medium'
                        : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    {u}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Descanso Padrão */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">Descanso Padrão</span>
            <div className="flex items-center gap-1">
              {REST_OPTIONS.map((opt) => {
                const active = preferences.defaultRestSeconds === opt.seconds;
                return (
                  <button
                    key={opt.seconds}
                    type="button"
                    onClick={() =>
                      updatePreferences({ defaultRestSeconds: opt.seconds })
                    }
                    className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg text-[12px] font-mono border transition-all active:scale-95 ${
                      active
                        ? 'bg-[#141417] border-[#10B981]/60 text-[#10B981]'
                        : 'border-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Incremento de Carga */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">
              Incremento de Carga
            </span>
            <div className="flex items-center gap-1">
              {INCREMENT_OPTIONS.map((inc) => {
                const active = preferences.weightIncrementKg === inc;
                const display = formatWeightValue(
                  inc,
                  preferences.weightUnit
                );
                return (
                  <button
                    key={inc}
                    type="button"
                    onClick={() =>
                      updatePreferences({ weightIncrementKg: inc })
                    }
                    className={`min-h-[44px] min-w-[44px] px-2.5 rounded-lg text-[12px] font-mono border transition-all active:scale-95 ${
                      active
                        ? 'bg-[#141417] border-[#10B981]/60 text-[#10B981]'
                        : 'border-[#1F1F23] text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    +{display}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Escala de Esforço */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">
              Escala de Esforço
            </span>
            <div className="flex items-center bg-[#141417] border border-[#1F1F23] rounded-lg p-0.5">
              {(['RIR', 'RPE'] as EffortScale[]).map((scale) => {
                const active = preferences.effortScale === scale;
                return (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => updatePreferences({ effortScale: scale })}
                    className={`min-h-[44px] min-w-[44px] px-3 rounded-md text-[12px] font-mono transition-all active:scale-95 ${
                      active
                        ? 'bg-[#1F1F23] text-[#F4F4F5] font-medium'
                        : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    {scale}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timer Automático */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">Timer Automático</span>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.autoStartRestTimer}
              onClick={() =>
                updatePreferences({
                  autoStartRestTimer: !preferences.autoStartRestTimer,
                })
              }
              className="min-h-[44px] min-w-[56px] flex items-center justify-end active:scale-95 transition-transform"
            >
              <span
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                  preferences.autoStartRestTimer
                    ? 'bg-[#10B981]'
                    : 'bg-[#27272A] border border-[#3F3F46]'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-[#F4F4F5] shadow transition-transform duration-200 ${
                    preferences.autoStartRestTimer
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Sobrecarga Automática */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[#F4F4F5]">
              Sobrecarga Automática
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.doubleProgressionEnabled}
              onClick={() =>
                updatePreferences({
                  doubleProgressionEnabled:
                    !preferences.doubleProgressionEnabled,
                })
              }
              className="min-h-[44px] min-w-[56px] flex items-center justify-end active:scale-95 transition-transform"
            >
              <span
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                  preferences.doubleProgressionEnabled
                    ? 'bg-[#10B981]'
                    : 'bg-[#27272A] border border-[#3F3F46]'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-[#F4F4F5] shadow transition-transform duration-200 ${
                    preferences.doubleProgressionEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* SINGLE-LINE DATA & BACKUP LIST */}
      <section className="pt-6">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#A1A1AA] mb-1">
          Dados & Backup
        </h2>

        <div className="flex flex-col divide-y divide-[#1F1F23]">
          <button
            type="button"
            onClick={async () => {
              await exportBackupJson();
              showToast('Backup JSON baixado.');
            }}
            className="min-h-[48px] py-3 flex items-center justify-between text-left text-[14px] text-[#F4F4F5] hover:text-[#10B981] active:scale-[0.99] transition-all"
          >
            <span>Exportar Backup (JSON)</span>
            <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
          </button>

          <button
            type="button"
            onClick={async () => {
              await exportHistoryCsv();
              showToast('Planilha CSV baixada.');
            }}
            className="min-h-[48px] py-3 flex items-center justify-between text-left text-[14px] text-[#F4F4F5] hover:text-[#10B981] active:scale-[0.99] transition-all"
          >
            <span>Exportar Planilha (CSV)</span>
            <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[48px] py-3 flex items-center justify-between text-left text-[14px] text-[#F4F4F5] hover:text-[#10B981] active:scale-[0.99] transition-all"
          >
            <span>Restaurar Backup (JSON)</span>
            <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />

          <div className="pt-3">
            {isConfirmingReset ? (
              <div className="animate-reveal p-3 rounded-lg bg-[#141417] border border-red-400/30 flex flex-col gap-2.5">
                <p className="text-[12px] text-[#A1A1AA]">
                  Limpar seus treinos atuais e restaurar os dados iniciais de
                  exemplo?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingReset(false)}
                    className="flex-1 h-11 rounded-lg bg-[#1F1F23] text-[13px] font-medium text-[#F4F4F5] active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReset}
                    className="flex-1 h-11 rounded-lg bg-red-500/20 border border-red-400/50 text-[13px] font-semibold text-red-300 active:scale-95 transition-all"
                  >
                    Confirmar Reset
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingReset(true)}
                className="min-h-[44px] px-2 -ml-2 rounded-lg text-[13px] font-medium text-red-400 hover:text-red-300 active:scale-95 transition-all"
              >
                Limpar Dados Locais
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
