export type CourseId = 'easy' | 'normal' | 'hard' | 'oni' | 'ura';

export const COURSE_ORDER: CourseId[] = ['easy', 'normal', 'hard', 'oni', 'ura'];

export const COURSE_LABELS: Record<CourseId, { ja: string; zh: string; color: string; iconIndex: number }> = {
  easy: { ja: 'かんたん', zh: '梅 · 简单', color: '#e85d3f', iconIndex: 0 },
  normal: { ja: 'ふつう', zh: '竹 · 普通', color: '#6cb33f', iconIndex: 1 },
  hard: { ja: 'むずかしい', zh: '松 · 困难', color: '#3b8ec4', iconIndex: 2 },
  oni: { ja: 'おに', zh: '鬼 · 达人', color: '#d4368a', iconIndex: 3 },
  ura: { ja: 'おに(裏)', zh: '里鬼 · 隐藏', color: '#7a42d4', iconIndex: 4 },
};

export type NoteSymbol = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type NoteKind =
  | 'don'
  | 'kat'
  | 'bigDon'
  | 'bigKat'
  | 'drumroll'
  | 'bigDrumroll'
  | 'balloon'
  | 'kusudama';

export type MeasureCommand =
  | { type: 'BPMCHANGE'; bpm: number; cellIndex: number }
  | { type: 'MEASURE'; numerator: number; denominator: number; cellIndex: number }
  | { type: 'SCROLL'; scroll: number; cellIndex: number }
  | { type: 'DELAY'; delaySec: number; cellIndex: number }
  | { type: 'GOGOSTART'; cellIndex: number }
  | { type: 'GOGOEND'; cellIndex: number }
  | { type: 'BARLINEON'; cellIndex: number }
  | { type: 'BARLINEOFF'; cellIndex: number };

/**
 * Structured measure node inside ChartDocument.
 * Designed so a future visual chart editor can mutate cells & commands
 * and round-trip cleanly via serializeTja().
 */
export interface ChartMeasure {
  index: number;
  cells: NoteSymbol[];
  commands: MeasureCommand[];
}

export interface CourseDocument {
  courseId: CourseId;
  level: number;
  balloons: number[];
  scoreInit?: number;
  scoreDiff?: number;
  measures: ChartMeasure[];
}

export interface ChartMetadata {
  title: string;
  subtitle: string;
  bpm: number;
  wave: string;
  offset: number; // TJA OFFSET in seconds (negative = song starts before beat 0)
  demoStart: number;
  genre: string;
}

export interface ChartDocument {
  meta: ChartMetadata;
  courses: Partial<Record<CourseId, CourseDocument>>;
}

export interface GameMods {
  speed: number; // 0.5, 1, 1.5, 2, 3, 4
  autoPlay: boolean;
  doron: boolean; // stealth notes
  swap: boolean; // abekobe: swap don <-> kat
  random: 'none' | 'kimagure' | 'detarame';
  donOnly: boolean;
  katOnly: boolean;
}

export const DEFAULT_MODS: GameMods = {
  speed: 1,
  autoPlay: false,
  doron: false,
  swap: false,
  random: 'none',
  donOnly: false,
  katOnly: false,
};

export interface PlayableNote {
  id: number;
  kind: NoteKind;
  timeMs: number;
  endTimeMs: number; // > timeMs for drumroll / balloon / kusudama
  bpm: number;
  scroll: number;
  gogo: boolean;
  balloonHits: number; // > 0 for balloon / kusudama
  // Runtime mutable state (reset on play)
  judged: boolean;
  hitCount: number;
  doubleHitAwarded: boolean;
  firstHitTimeMs: number | null;
  firstHitHand: 'left' | 'right' | null;
}

export interface PlayableBarline {
  timeMs: number;
  bpm: number;
  scroll: number;
  measureIndex: number;
}

export interface GogoRange {
  startMs: number;
  endMs: number;
}

export interface BpmEvent {
  timeMs: number;
  bpm: number;
}

export interface PlayableChart {
  meta: ChartMetadata;
  courseId: CourseId;
  level: number;
  notes: PlayableNote[];
  barlines: PlayableBarline[];
  gogoRanges: GogoRange[];
  bpmEvents: BpmEvent[];
  totalComboNotes: number;
  baseScore: number; // Shin-uchi per-good base score
  endTimeMs: number;
}
