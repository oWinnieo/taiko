import {
  CustomSongRecord,
  DEFAULT_SETTINGS,
  GameSettings,
  PlatformAdapter,
  ScoreKey,
  ScoreRecord,
  SongCatalogEntry,
} from './types';

const DB_NAME = 'taiko-web-db';
const DB_VERSION = 1;
const SONGS_STORE = 'custom_songs';
const SETTINGS_KEY = 'taiko_web_settings_v1';
const SCORES_KEY = 'taiko_web_scores_v1';

const CROWN_WEIGHT: Record<ScoreRecord['crown'], number> = {
  none: 0,
  clear: 1,
  fullcombo: 2,
  donderful: 3,
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SONGS_STORE)) {
        db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class WebPlatformAdapter implements PlatformAdapter {
  readonly kind = 'web' as const;

  async listCustomSongs(): Promise<SongCatalogEntry[]> {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readonly');
        const store = tx.objectStore(SONGS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as CustomSongRecord[]).sort((a, b) => b.addedAt - a.addedAt);
          resolve(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              subtitle: r.subtitle,
              genre: r.genre,
              genreId: r.genreId,
              bpm: r.bpm,
              demoStart: r.demoStart,
              courses: r.courses,
              source: 'custom',
            })),
          );
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getCustomSong(id: string): Promise<CustomSongRecord | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SONGS_STORE, 'readonly');
      const req = tx.objectStore(SONGS_STORE).get(id);
      req.onsuccess = () => resolve((req.result as CustomSongRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveCustomSong(record: CustomSongRecord): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SONGS_STORE, 'readwrite');
      tx.objectStore(SONGS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteCustomSong(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SONGS_STORE, 'readwrite');
      tx.objectStore(SONGS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  loadSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, keyBindings: { ...DEFAULT_SETTINGS.keyBindings } };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        keyBindings: {
          ...DEFAULT_SETTINGS.keyBindings,
          ...(parsed.keyBindings ?? {}),
        },
      };
    } catch {
      return { ...DEFAULT_SETTINGS, keyBindings: { ...DEFAULT_SETTINGS.keyBindings } };
    }
  }

  saveSettings(settings: GameSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage quota issues
    }
  }

  loadScores(): Record<ScoreKey, ScoreRecord> {
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<ScoreKey, ScoreRecord>;
    } catch {
      return {};
    }
  }

  saveScore(record: ScoreRecord): ScoreRecord {
    const all = this.loadScores();
    const key: ScoreKey = `${record.songId}::${record.courseId}`;
    const prev = all[key];
    const best: ScoreRecord = prev
      ? {
          ...record,
          score: Math.max(prev.score, record.score),
          maxCombo: Math.max(prev.maxCombo, record.maxCombo),
          crown:
            CROWN_WEIGHT[record.crown] >= CROWN_WEIGHT[prev.crown] ? record.crown : prev.crown,
          updatedAt: Date.now(),
        }
      : record;
    all[key] = best;
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    return best;
  }
}

export const platform: PlatformAdapter = new WebPlatformAdapter();
