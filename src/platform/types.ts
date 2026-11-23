import { CourseId } from '../core/chart/types';

export interface SongCatalogEntry {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  genreId: number;
  bpm: number;
  demoStart: number;
  courses: Partial<Record<CourseId, number>>;
  source: 'builtin' | 'custom';
  chartUrl?: string;
  audioUrl?: string;
}

export interface CustomSongRecord {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  genreId: number;
  bpm: number;
  demoStart: number;
  courses: Partial<Record<CourseId, number>>;
  tjaText: string;
  audioBlob: Blob | null;
  audioName: string;
  addedAt: number;
}

export interface KeyBindings {
  leftKat: string;
  leftDon: string;
  rightDon: string;
  rightKat: string;
}

export interface GameSettings {
  keyBindings: KeyBindings;
  drumPack: string; // 'default' | 'neiro_1' .. 'neiro_30'
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  voiceVolume: number; // 0..1
  audioOffsetMs: number; // -250..250
  gamepadDebounceMs: number; // 0..60 per-sensor debounce for drum controllers
  showTouchDrum: boolean;
  showDebugHud: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  keyBindings: {
    leftKat: 'KeyD',
    leftDon: 'KeyF',
    rightDon: 'KeyJ',
    rightKat: 'KeyK',
  },
  drumPack: 'default',
  musicVolume: 0.78,
  sfxVolume: 0.92,
  voiceVolume: 0.85,
  audioOffsetMs: 0,
  gamepadDebounceMs: 25,
  showTouchDrum: false,
  showDebugHud: false,
};

export type CrownRank = 'none' | 'clear' | 'fullcombo' | 'donderful';

export interface ScoreRecord {
  songId: string;
  courseId: CourseId;
  score: number;
  good: number;
  ok: number;
  bad: number;
  maxCombo: number;
  drumrollHits: number;
  crown: CrownRank;
  updatedAt: number;
}

export type ScoreKey = `${string}::${CourseId}`;

/**
 * Platform abstraction layer.
 * Web uses IndexedDB + localStorage; future Tauri 2.0 desktop client
 * implements this exact interface over native filesystem APIs.
 */
export interface PlatformAdapter {
  readonly kind: 'web' | 'desktop';
  listCustomSongs(): Promise<SongCatalogEntry[]>;
  getCustomSong(id: string): Promise<CustomSongRecord | null>;
  saveCustomSong(record: CustomSongRecord): Promise<void>;
  deleteCustomSong(id: string): Promise<void>;
  loadSettings(): GameSettings;
  saveSettings(settings: GameSettings): void;
  loadScores(): Record<ScoreKey, ScoreRecord>;
  saveScore(record: ScoreRecord): ScoreRecord;
}
