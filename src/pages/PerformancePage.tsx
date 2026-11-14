import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildExerciseProgressionSeries,
  calculateWeeklyMuscleVolume,
} from '../domain/metrics';
import { convertFromKg, formatWeightValue } from '../domain/progression';
import type {
  ExerciseTemplate,
  MuscleGroup,
  Routine,
  UserPreferences,
  WorkoutSession,
} from '../domain/types';

interface PerformancePageProps {
  routine: Routine;
  sessions: WorkoutSession[];
  preferences: UserPreferences;
  catalog: ExerciseTemplate[];
}

type TimeframeKey = '4S' | '3M' | '6M' | 'TUDO';

const TIMEFRAME_DAYS: Record<TimeframeKey, number | null> = {
  '4S': 28,
  '3M': 90,
  '6M': 180,
  TUDO: null,
};

const SHORT_MUSCLE_LABEL: Record<MuscleGroup, string> = {
  Peitoral: 'Peito',
  Costas: 'Costas',
  Pernas: 'Pernas',
  Ombros: 'Ombros',
  Braços: 'Braços',
  Core: 'Core',
};

function formatDateCompact(iso?: string): string {
  if (!iso) return 'Hoje';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recente';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const PerformancePage: React.FC<PerformancePageProps> = ({
  sessions,
  preferences,
  catalog,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeKey>('4S');
  const [selectedExerciseId, setSelectedExerciseId] =
    useState<string>('supino-reto');
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const unit = preferences.weightUnit;

  useEffect(() => {
    if (!isExercisePickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsExercisePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isExercisePickerOpen]);

  const completedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.startedAt).getTime() -
            new Date(a.completedAt ?? a.startedAt).getTime()
        ),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    const days = TIMEFRAME_DAYS[timeframe];
    if (!days) return completedSessions;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inRange = completedSessions.filter((s) => {
      const t = new Date(s.completedAt ?? s.startedAt).getTime();
      return Number.isNaN(t) || t >= cutoff;
    });
    return inRange.length > 0 ? inRange : completedSessions;
  }, [completedSessions, timeframe]);

  const availableExercises = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const s of completedSessions) {
      for (const ex of s.exercises) {
        if (!map.has(ex.exerciseId)) {
          map.set(ex.exerciseId, { id: ex.exerciseId, name: ex.name });
        }
      }
    }
    for (const item of catalog) {
      if (!map.has(item.id)) {
        map.set(item.id, { id: item.id, name: item.name });
      }
    }
    return Array.from(map.values());
  }, [completedSessions, catalog]);

  const activeExerciseName =
    availableExercises.find((e) => e.id === selectedExerciseId)?.name ??
    'Supino Reto com Barra';

  const progressionPoints = useMemo(
    () => buildExerciseProgressionSeries(filteredSessions, selectedExerciseId),
    [filteredSessions, selectedExerciseId]
  );

  const activePoint =
    selectedPointIdx !== null && progressionPoints[selectedPointIdx]
      ? progressionPoints[selectedPointIdx]
      : progressionPoints[progressionPoints.length - 1];

  const firstPoint = progressionPoints[0];
  const rmDeltaPct =
    activePoint && firstPoint && firstPoint.estimated1RM > 0
      ? Math.round(
          ((activePoint.estimated1RM - firstPoint.estimated1RM) /
            firstPoint.estimated1RM) *
            1000
        ) / 10
      : 0;

  const latestSession = completedSessions[0];
  const weeklyMuscleVolume = useMemo(
    () => calculateWeeklyMuscleVolume(completedSessions),
    [completedSessions]
  );

  // Smooth minimalist emerald sparkline geometry
  const chartGeometry = useMemo(() => {
    if (progressionPoints.length === 0) return null;

    const values = progressionPoints.map((p) =>
      convertFromKg(p.topWeightKg, unit)
    );
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max(4, Math.round((rawMax - rawMin) * 0.25));
    const minY = Math.max(0, rawMin - pad);
    const maxY = rawMax + pad;
    const span = Math.max(5, maxY - minY);

    const leftX = 8;
    const rightX = 332;
    const topY = 14;
    const bottomY = 106;
    const count = progressionPoints.length;

    const coords = progressionPoints.map((p, idx) => {
      const x =
        count === 1
          ? (leftX + rightX) / 2
          : leftX + (idx / (count - 1)) * (rightX - leftX);
      const val = convertFromKg(p.topWeightKg, unit);
      const y = bottomY - ((val - minY) / span) * (bottomY - topY);
      return { x, y, val, point: p, index: idx };
    });

    // Build smooth cubic curve through points
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx = (prev.x + curr.x) / 2;
      linePath += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const last = coords[coords.length - 1];
    const areaPath = `${linePath} L ${last.x} ${bottomY} L ${coords[0].x} ${bottomY} Z`;

    return { coords, linePath, areaPath };
  }, [progressionPoints, unit]);

  const est1RmDisplay = activePoint
    ? formatWeightValue(activePoint.estimated1RM, unit)
    : '—';

  const latestVolumeDisplay = latestSession
    ? Math.round(convertFromKg(latestSession.totalVolumeKg, unit)).toLocaleString(
        'pt-BR'
      )
    : '0';

  return (
    <div className="flex flex-col w-full pt-3">
      {/* CLEAN EDITORIAL HEADER */}
      <header className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#1F1F23]">
        <h1 className="font-headline text-[18px] font-semibold tracking-tight text-[#F4F4F5]">
          Performance
        </h1>

        <div className="flex items-center gap-0.5 bg-[#141417] border border-[#1F1F23] rounded-lg p-0.5">
          {(['4S', '3M', '6M', 'TUDO'] as TimeframeKey[]).map((key) => {
            const active = timeframe === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTimeframe(key);
                  setSelectedPointIdx(null);
                }}
                className={`min-h-[44px] px-2.5 rounded-md text-[11px] font-mono transition-all active:scale-95 ${
                  active
                    ? 'bg-[#1F1F23] text-[#F4F4F5] font-medium'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </header>

      {/* INLINE EXERCISE SELECTOR PILL */}
      <div className="py-3 relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setIsExercisePickerOpen((o) => !o)}
          className="min-h-[44px] inline-flex items-center gap-2 px-3.5 rounded-full bg-[#141417] border border-[#1F1F23] hover:border-[#27272A] text-[13px] font-medium text-[#F4F4F5] active:scale-95 transition-all"
        >
          <span className="truncate max-w-[240px]">{activeExerciseName}</span>
          <ChevronDown className="w-4 h-4 text-[#A1A1AA] shrink-0" />
        </button>

        {isExercisePickerOpen && (
          <div className="animate-reveal absolute left-0 mt-1.5 w-72 max-h-64 overflow-y-auto rounded-lg bg-[#141417] border border-[#27272A] shadow-2xl py-1 z-40">
            {availableExercises.map((ex) => {
              const selected = ex.id === selectedExerciseId;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(ex.id);
                    setSelectedPointIdx(null);
                    setIsExercisePickerOpen(false);
                  }}
                  className={`w-full min-h-[44px] px-3 text-left text-[13px] flex items-center justify-between transition-colors ${
                    selected
                      ? 'text-[#10B981] font-medium bg-[#1F1F23]/50'
                      : 'text-[#F4F4F5] hover:bg-[#1F1F23]/40'
                  }`}
                >
                  <span className="truncate">{ex.name}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* UNIFIED BORDERLESS HERO METRIC HEADER */}
      <section className="grid grid-cols-2 divide-x divide-[#1F1F23] py-4 border-y border-[#1F1F23]">
        <div className="pr-4 flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
            Est. 1RM
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#F4F4F5] tabular-nums leading-none">
              {est1RmDisplay}
            </span>
            <span className="font-mono text-[12px] text-[#A1A1AA]">
              {unit}
            </span>
          </div>
          <span
            className={`font-mono text-[11px] mt-1.5 ${
              rmDeltaPct > 0 ? 'text-[#10B981]' : 'text-[#A1A1AA]'
            }`}
          >
            {rmDeltaPct > 0 ? `↑ +${rmDeltaPct}% no período` : 'Estável'}
          </span>
        </div>

        <div className="pl-5 flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
            Volume / Sessão
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#F4F4F5] tabular-nums leading-none">
              {latestVolumeDisplay}
            </span>
            <span className="font-mono text-[12px] text-[#A1A1AA]">
              {unit}
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#A1A1AA] mt-1.5">
            {latestSession
              ? `${latestSession.validSetsCount} séries válidas`
              : 'Sem sessão'}
          </span>
        </div>
      </section>

      {/* MINIMALIST EMERALD TREND CHART (NO GRIDLINES / NO BOXES) */}
      <section className="py-5 border-b border-[#1F1F23]">
        {chartGeometry ? (
          <div className="flex flex-col gap-2">
            <svg
              viewBox="0 0 340 120"
              className="w-full h-32 overflow-visible"
              aria-label="Evolução de carga"
            >
              <defs>
                <linearGradient
                  id="sparkEmeraldFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={chartGeometry.areaPath} fill="url(#sparkEmeraldFill)" />
              <path
                d={chartGeometry.linePath}
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {chartGeometry.coords.map((c) => {
                const isSelected =
                  selectedPointIdx !== null
                    ? selectedPointIdx === c.index
                    : c.index === chartGeometry.coords.length - 1;
                return (
                  <g
                    key={c.index}
                    onClick={() => setSelectedPointIdx(c.index)}
                    className="cursor-pointer"
                  >
                    <circle cx={c.x} cy={c.y} r="22" fill="transparent" />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={isSelected ? 4.5 : 3}
                      fill={isSelected ? '#10B981' : '#0A0A0C'}
                      stroke="#10B981"
                      strokeWidth="1.75"
                    />
                  </g>
                );
              })}
            </svg>

            <div className="flex items-center justify-between font-mono text-[11px] text-[#A1A1AA]">
              <span>
                Início:{' '}
                {formatWeightValue(firstPoint?.topWeightKg ?? 0, unit)} {unit}
              </span>
              <span className="text-[#F4F4F5]">
                {activePoint?.dateLabel ?? 'Atual'} •{' '}
                <span className="text-[#10B981]">
                  {formatWeightValue(activePoint?.topWeightKg ?? 0, unit)}{' '}
                  {unit}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-[12px] text-[#A1A1AA]">
            Conclua sessões com este exercício para acompanhar a curva.
          </div>
        )}
      </section>

      {/* COMPACT MUSCLE VOLUME LIST (4PX HAIRLINE PROGRESS BARS) */}
      <section className="py-5 border-b border-[#1F1F23] flex flex-col gap-3.5">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#A1A1AA]">
          Volume Semanal
        </h2>

        <div className="flex flex-col gap-3">
          {weeklyMuscleVolume.map((item) => (
            <div key={item.muscleGroup} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#F4F4F5] font-medium">
                  {SHORT_MUSCLE_LABEL[item.muscleGroup] ?? item.label}
                </span>
                <span
                  className={`font-mono text-[11px] ${
                    item.targetHit ? 'text-[#10B981]' : 'text-[#A1A1AA]'
                  }`}
                >
                  {item.completedSets}/{item.targetSets}
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-[#1F1F23] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    item.targetHit ? 'bg-[#10B981]' : 'bg-[#F4F4F5]/75'
                  }`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BORDERLESS 2-COLUMN SESSION HISTORY FEED */}
      <section className="pt-5 flex flex-col">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#A1A1AA] mb-2">
          Sessões Recentes
        </h2>

        <div className="flex flex-col divide-y divide-[#1F1F23]">
          {filteredSessions.map((sess) => {
            const expanded = expandedSessionId === sess.id;
            const volDisplay = Math.round(
              convertFromKg(sess.totalVolumeKg, unit)
            ).toLocaleString('pt-BR');

            return (
              <div key={sess.id} className="py-1.5 flex flex-col">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSessionId(expanded ? null : sess.id)
                  }
                  className="w-full min-h-[48px] py-2 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[#F4F4F5] truncate">
                      {sess.dayTitle || sess.dayShortLabel}
                    </p>
                    <p className="font-mono text-[11px] text-[#A1A1AA] mt-0.5">
                      {formatDateCompact(sess.completedAt ?? sess.startedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[12px] text-[#A1A1AA]">
                      {sess.durationMin}m • {volDisplay} {unit}
                    </span>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-[#A1A1AA]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#A1A1AA]" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="animate-reveal mb-2.5 pl-3 border-l border-[#1F1F23] flex flex-col gap-1.5">
                    {sess.exercises.map((ex) => {
                      const topSet = ex.sets[0];
                      const doneCount = ex.sets.filter((s) => s.completed).length;
                      const weightDisplay = topSet
                        ? formatWeightValue(topSet.weightKg, unit)
                        : '0';
                      return (
                        <div
                          key={ex.plannedExerciseId}
                          className="flex items-center justify-between text-[12px]"
                        >
                          <span className="text-[#A1A1AA] truncate pr-2">
                            {ex.name}
                          </span>
                          <span className="font-mono text-[#A1A1AA] shrink-0">
                            {doneCount}×{topSet?.reps ?? ex.minReps} •{' '}
                            {weightDisplay} {unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="py-8 text-center text-[13px] text-[#A1A1AA]">
              Nenhuma sessão concluída registrada ainda.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
