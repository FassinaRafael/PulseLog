import { useCallback, useEffect, useReducer, useRef } from 'react';

function playRestCompleteFeedback() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([150, 80, 150]);
    }
  } catch {
    // Ignorar se vibração for bloqueada
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // AudioContext pode exigir interação prévia
  }
}

export function formatTimerSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const s = (safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export interface RestTimerState {
  defaultSeconds: number;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

export type RestTimerAction =
  | { type: 'SYNC_DEFAULT'; seconds: number }
  | { type: 'TICK' }
  | { type: 'TOGGLE' }
  | { type: 'RESET' }
  | { type: 'START_WITH_SECONDS'; seconds: number }
  | { type: 'ADJUST'; delta: number };

export function createRestTimerState(initialSeconds = 120): RestTimerState {
  const safe = Math.max(0, Math.floor(initialSeconds));
  return {
    defaultSeconds: safe,
    totalSeconds: safe,
    remainingSeconds: safe,
    isRunning: false,
  };
}

/**
 * Transições puras do timer de descanso, preservando `defaultSeconds`
 * para que `RESET` restaure o valor padrão mesmo após ajustes (+/-15s).
 */
export function restTimerReducer(
  state: RestTimerState,
  action: RestTimerAction
): RestTimerState {
  switch (action.type) {
    case 'SYNC_DEFAULT': {
      const safe = Math.max(0, Math.floor(action.seconds));
      if (!state.isRunning) {
        return {
          ...state,
          defaultSeconds: safe,
          totalSeconds: safe,
          remainingSeconds: safe,
        };
      }
      return {
        ...state,
        defaultSeconds: safe,
      };
    }

    case 'TICK': {
      if (!state.isRunning) return state;
      if (state.remainingSeconds <= 1) {
        return {
          ...state,
          remainingSeconds: 0,
          isRunning: false,
        };
      }
      return {
        ...state,
        remainingSeconds: state.remainingSeconds - 1,
      };
    }

    case 'TOGGLE': {
      if (!state.isRunning && state.remainingSeconds <= 0) {
        return {
          ...state,
          totalSeconds: state.defaultSeconds,
          remainingSeconds: state.defaultSeconds,
          isRunning: true,
        };
      }
      return {
        ...state,
        isRunning: !state.isRunning,
      };
    }

    case 'RESET':
      return {
        ...state,
        isRunning: false,
        totalSeconds: state.defaultSeconds,
        remainingSeconds: state.defaultSeconds,
      };

    case 'START_WITH_SECONDS': {
      const safe = Math.max(0, Math.floor(action.seconds));
      return {
        defaultSeconds: safe,
        totalSeconds: safe,
        remainingSeconds: safe,
        isRunning: safe > 0,
      };
    }

    case 'ADJUST': {
      const next = Math.max(0, state.remainingSeconds + action.delta);
      if (next <= 0) {
        return {
          ...state,
          remainingSeconds: 0,
          isRunning: false,
        };
      }
      return {
        ...state,
        remainingSeconds: next,
        totalSeconds: Math.max(state.totalSeconds, next),
      };
    }
  }
}

export function useRestTimer(initialSeconds = 120) {
  const [state, dispatch] = useReducer(
    restTimerReducer,
    initialSeconds,
    createRestTimerState
  );
  const intervalRef = useRef<number | null>(null);
  const prevRunningRef = useRef(state.isRunning);
  const prevRemainingRef = useRef(state.remainingSeconds);

  useEffect(() => {
    dispatch({ type: 'SYNC_DEFAULT', seconds: initialSeconds });
  }, [initialSeconds]);

  useEffect(() => {
    if (
      prevRunningRef.current &&
      prevRemainingRef.current > 0 &&
      state.remainingSeconds === 0 &&
      !state.isRunning
    ) {
      playRestCompleteFeedback();
    }
    prevRunningRef.current = state.isRunning;
    prevRemainingRef.current = state.remainingSeconds;
  }, [state.isRunning, state.remainingSeconds]);

  useEffect(() => {
    if (!state.isRunning) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      dispatch({ type: 'TICK' });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning]);

  const toggle = useCallback(() => dispatch({ type: 'TOGGLE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const selectPreset = useCallback(
    (seconds: number) => dispatch({ type: 'START_WITH_SECONDS', seconds }),
    []
  );
  const addThirtySeconds = useCallback(
    () => dispatch({ type: 'ADJUST', delta: 30 }),
    []
  );
  const adjustSeconds = useCallback(
    (delta: number) => dispatch({ type: 'ADJUST', delta }),
    []
  );
  const triggerAutoRest = useCallback(
    (seconds: number) => dispatch({ type: 'START_WITH_SECONDS', seconds }),
    []
  );

  const progressPercent =
    state.totalSeconds > 0
      ? Math.max(
          0,
          Math.min(100, (state.remainingSeconds / state.totalSeconds) * 100)
        )
      : 0;

  return {
    remainingSeconds: state.remainingSeconds,
    totalSeconds: state.totalSeconds,
    defaultSeconds: state.defaultSeconds,
    isRunning: state.isRunning,
    progressPercent,
    formattedTime: formatTimerSeconds(state.remainingSeconds),
    toggle,
    reset,
    selectPreset,
    addThirtySeconds,
    adjustSeconds,
    triggerAutoRest,
  };
}
