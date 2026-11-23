import { describe, expect, it } from 'vitest';
import {
  calculateHitScore,
  calculateSoulDelta,
  computeCrown,
  evaluateTiming,
  getJudgeWindows,
  SOUL_CLEAR_THRESHOLD,
} from './judge';

describe('Taiko judgement, scoring & crown logic', () => {
  it('evaluates arcade timing windows correctly', () => {
    const oniWin = getJudgeWindows('oni');
    expect(evaluateTiming(10, oniWin)).toBe('good');
    expect(evaluateTiming(25, oniWin)).toBe('good');
    expect(evaluateTiming(50, oniWin)).toBe('ok');
    expect(evaluateTiming(95, oniWin)).toBe('bad');
    expect(evaluateTiming(140, oniWin)).toBeNull();

    const easyWin = getJudgeWindows('easy');
    expect(evaluateTiming(30, easyWin)).toBe('good');
  });

  it('computes Shin-uchi hit scores with Go-Go and big note multipliers', () => {
    expect(calculateHitScore('good', 1000, false, false)).toBe(1000);
    expect(calculateHitScore('ok', 1000, false, false)).toBe(500);
    expect(calculateHitScore('good', 1000, true, false)).toBe(1200);
    expect(calculateHitScore('good', 1000, true, true)).toBe(2400);
    expect(calculateHitScore('bad', 1000, true, true)).toBe(0);
  });

  it('computes soul gauge delta and crown ranks accurately', () => {
    expect(calculateSoulDelta('good', 100, 'oni')).toBeGreaterThan(0);
    expect(calculateSoulDelta('bad', 100, 'oni')).toBeLessThan(0);

    expect(computeCrown(10000, 100, 0, 0, 100)).toBe('donderful');
    expect(computeCrown(9000, 90, 10, 0, 100)).toBe('fullcombo');
    expect(computeCrown(SOUL_CLEAR_THRESHOLD, 80, 15, 5, 100)).toBe('clear');
    expect(computeCrown(SOUL_CLEAR_THRESHOLD - 1, 50, 20, 30, 100)).toBe('none');
  });
});
