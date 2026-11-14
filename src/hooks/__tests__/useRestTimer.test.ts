import { describe, expect, it } from 'vitest';
import {
  createRestTimerState,
  restTimerReducer,
} from '../useRestTimer';

describe('useRestTimer state transitions', () => {
  it('restaura o valor padrão após +15s e Reset', () => {
    let state = createRestTimerState(120);

    state = restTimerReducer(state, { type: 'START_WITH_SECONDS', seconds: 120 });
    expect(state.remainingSeconds).toBe(120);
    expect(state.isRunning).toBe(true);

    state = restTimerReducer(state, { type: 'ADJUST', delta: 15 });
    expect(state.remainingSeconds).toBe(135);
    expect(state.totalSeconds).toBe(135);
    expect(state.defaultSeconds).toBe(120);

    state = restTimerReducer(state, { type: 'ADJUST', delta: -15 });
    expect(state.remainingSeconds).toBe(120);

    state = restTimerReducer(state, { type: 'RESET' });
    expect(state.isRunning).toBe(false);
    expect(state.remainingSeconds).toBe(120);
    expect(state.totalSeconds).toBe(120);
  });

  it('retoma com valor padrão quando toggle é acionado após zerar', () => {
    let state = createRestTimerState(90);
    state = restTimerReducer(state, { type: 'START_WITH_SECONDS', seconds: 90 });
    state = restTimerReducer(state, { type: 'ADJUST', delta: 15 });
    state = restTimerReducer(state, { type: 'ADJUST', delta: -120 });

    expect(state.remainingSeconds).toBe(0);
    expect(state.isRunning).toBe(false);

    state = restTimerReducer(state, { type: 'TOGGLE' });
    expect(state.isRunning).toBe(true);
    expect(state.remainingSeconds).toBe(90);
    expect(state.totalSeconds).toBe(90);
  });
});
