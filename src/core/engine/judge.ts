import { CourseId, NoteKind } from '../chart/types';
import { CrownRank } from '../../platform/types';

export type JudgeGrade = 'good' | 'ok' | 'bad';

export interface JudgeWindows {
  good: number; // ms
  ok: number; // ms
  bad: number; // ms
}

/**
 * Standard Taiko judgement windows (ms).
 * Easy/Normal slightly wider than Hard/Oni/Ura matching arcade rules.
 */
export function getJudgeWindows(courseId: CourseId): JudgeWindows {
  if (courseId === 'easy' || courseId === 'normal') {
    return { good: 33, ok: 90, bad: 125 };
  }
  return { good: 25, ok: 75, bad: 108 };
}

export function evaluateTiming(absDeltaMs: number, windows: JudgeWindows): JudgeGrade | null {
  if (absDeltaMs <= windows.good) return 'good';
  if (absDeltaMs <= windows.ok) return 'ok';
  if (absDeltaMs <= windows.bad) return 'bad';
  return null;
}

export function isNoteDon(kind: NoteKind): boolean {
  return kind === 'don' || kind === 'bigDon';
}

export function isNoteKat(kind: NoteKind): boolean {
  return kind === 'kat' || kind === 'bigKat';
}

export function isBigTapNote(kind: NoteKind): boolean {
  return kind === 'bigDon' || kind === 'bigKat';
}

export function isTapNote(kind: NoteKind): boolean {
  return kind === 'don' || kind === 'kat' || kind === 'bigDon' || kind === 'bigKat';
}

export function isDrumrollNote(kind: NoteKind): boolean {
  return kind === 'drumroll' || kind === 'bigDrumroll';
}

export function isBalloonNote(kind: NoteKind): boolean {
  return kind === 'balloon' || kind === 'kusudama';
}

export const SOUL_MAX = 10000;
export const SOUL_CLEAR_THRESHOLD = 8000; // 80% = 40/50 segments

export function calculateSoulDelta(
  grade: JudgeGrade,
  totalComboNotes: number,
  courseId: CourseId,
): number {
  const safeTotal = Math.max(10, totalComboNotes);
  // Balance so ~75% Good rate reaches 8000 clear threshold on Oni, ~65% on Easy
  const factor =
    courseId === 'easy' ? 1.55 : courseId === 'normal' ? 1.42 : courseId === 'hard' ? 1.32 : 1.25;
  const goodGain = (SOUL_MAX / safeTotal) * factor;
  if (grade === 'good') return Math.round(goodGain);
  if (grade === 'ok') return Math.round(goodGain * 0.5);
  const badPenalty = courseId === 'easy' ? 0.9 : courseId === 'normal' ? 1.25 : 1.65;
  return -Math.round(goodGain * badPenalty);
}

export function calculateHitScore(
  grade: JudgeGrade,
  baseScore: number,
  gogo: boolean,
  isDoubleBig: boolean,
): number {
  if (grade === 'bad') return 0;
  let pts = grade === 'good' ? baseScore : Math.floor(baseScore / 2 / 10) * 10;
  if (gogo) pts = Math.floor((pts * 1.2) / 10) * 10;
  if (isDoubleBig) pts *= 2;
  return pts;
}

export function computeCrown(
  soul: number,
  good: number,
  ok: number,
  bad: number,
  totalComboNotes: number,
): CrownRank {
  if (totalComboNotes > 0 && bad === 0 && ok === 0 && good === totalComboNotes) {
    return 'donderful';
  }
  if (totalComboNotes > 0 && bad === 0 && good + ok === totalComboNotes) {
    return 'fullcombo';
  }
  if (soul >= SOUL_CLEAR_THRESHOLD) {
    return 'clear';
  }
  return 'none';
}
