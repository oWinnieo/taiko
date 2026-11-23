import { audioEngine } from '../core/audio/audioEngine';
import { compileCourse } from '../core/chart/compiler';
import { decodeTjaBuffer, parseTja } from '../core/chart/tjaParser';
import { CourseId, COURSE_ORDER, GameMods, PlayableChart } from '../core/chart/types';
import { CustomSongRecord, SongCatalogEntry } from '../platform/types';
import { platform } from '../platform/webPlatform';

interface BuiltinManifest {
  version: number;
  songs: Array<{
    id: string;
    title: string;
    subtitle: string;
    genre: string;
    genreId: number;
    bpm: number;
    chartUrl: string;
    audioUrl: string;
    demoStart: number;
    courses: Partial<Record<CourseId, number>>;
  }>;
}

const GENRE_ID_MAP: Record<string, number> = {
  pop: 0,
  'j-pop': 0,
  anime: 1,
  vocaloid: 2,
  variety: 3,
  classic: 4,
  'game music': 5,
  'namco original': 6,
};

function guessGenreId(genre: string): number {
  const key = genre.trim().toLowerCase();
  return GENRE_ID_MAP[key] ?? 6;
}

export async function loadAllSongs(): Promise<SongCatalogEntry[]> {
  let builtins: SongCatalogEntry[] = [];
  try {
    const res = await fetch('/songs/manifest.json');
    if (res.ok) {
      const data = (await res.json()) as BuiltinManifest;
      builtins = data.songs.map((s) => ({
        ...s,
        source: 'builtin' as const,
      }));
    }
  } catch {
    builtins = [];
  }

  const customs = await platform.listCustomSongs();
  return [...customs, ...builtins];
}

export async function loadSongAudioBuffer(entry: SongCatalogEntry): Promise<AudioBuffer | null> {
  if (entry.source === 'builtin' && entry.audioUrl) {
    return audioEngine.loadUrl(entry.audioUrl);
  }
  if (entry.source === 'custom') {
    const rec = await platform.getCustomSong(entry.id);
    if (!rec?.audioBlob) return null;
    try {
      const arr = await rec.audioBlob.arrayBuffer();
      return await audioEngine.decodeAudioBuffer(arr);
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadPlayableSong(
  entry: SongCatalogEntry,
  courseId: CourseId,
  mods: GameMods,
): Promise<{ chart: PlayableChart; audioBuffer: AudioBuffer | null }> {
  let tjaText = '';
  let audioBuffer: AudioBuffer | null = null;

  if (entry.source === 'builtin') {
    const [chartRes, buf] = await Promise.all([
      fetch(entry.chartUrl!),
      entry.audioUrl ? audioEngine.loadUrl(entry.audioUrl) : Promise.resolve(null),
    ]);
    if (!chartRes.ok) throw new Error(`Failed to load chart ${entry.chartUrl}`);
    tjaText = decodeTjaBuffer(await chartRes.arrayBuffer());
    audioBuffer = buf;
  } else {
    const rec = await platform.getCustomSong(entry.id);
    if (!rec) throw new Error('Custom song not found in storage');
    tjaText = rec.tjaText;
    if (rec.audioBlob) {
      try {
        audioBuffer = await audioEngine.decodeAudioBuffer(await rec.audioBlob.arrayBuffer());
      } catch {
        audioBuffer = null;
      }
    }
  }

  const doc = parseTja(tjaText);
  const available = COURSE_ORDER.filter((c) => Boolean(doc.courses[c]));
  const chosenCourse = doc.courses[courseId] ? courseId : available[0];
  if (!chosenCourse) {
    throw new Error('该 TJA 文件中未找到有效谱面 (#START ... #END)');
  }

  const chart = compileCourse(doc, chosenCourse, mods);
  return { chart, audioBuffer };
}

export async function importLocalTjaFiles(fileList: FileList | File[]): Promise<SongCatalogEntry[]> {
  const files = Array.from(fileList);
  const tjaFiles = files.filter((f) => f.name.toLowerCase().endsWith('.tja'));
  const audioFiles = files.filter((f) =>
    /\.(ogg|mp3|wav|m4a|flac|webm)$/i.test(f.name),
  );

  if (tjaFiles.length === 0) {
    throw new Error('请至少包含一个 .tja 谱面文件（可同时拖入配套 .ogg / .mp3 / .wav 音频）');
  }

  const imported: SongCatalogEntry[] = [];

  for (const tjaFile of tjaFiles) {
    const rawBuf = await tjaFile.arrayBuffer();
    const tjaText = decodeTjaBuffer(rawBuf);
    const doc = parseTja(tjaText);

    const courses: Partial<Record<CourseId, number>> = {};
    for (const cId of COURSE_ORDER) {
      const c = doc.courses[cId];
      if (c && c.measures.length > 0) {
        courses[cId] = c.level;
      }
    }
    if (Object.keys(courses).length === 0) {
      continue;
    }

    // Match WAVE filename first, otherwise pick first audio file if single-song import
    const waveName = doc.meta.wave.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    let matchedAudio = audioFiles.find((f) => f.name.toLowerCase() === waveName);
    if (!matchedAudio && waveName) {
      const waveBase = waveName.replace(/\.[^.]+$/, '');
      matchedAudio = audioFiles.find(
        (f) => f.name.toLowerCase().replace(/\.[^.]+$/, '') === waveBase,
      );
    }
    if (!matchedAudio && tjaFiles.length === 1 && audioFiles.length > 0) {
      matchedAudio = audioFiles[0];
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: CustomSongRecord = {
      id,
      title: doc.meta.title || tjaFile.name.replace(/\.tja$/i, ''),
      subtitle: doc.meta.subtitle || (matchedAudio ? matchedAudio.name : '仅谱面（无音频）'),
      genre: doc.meta.genre || 'Custom',
      genreId: guessGenreId(doc.meta.genre || ''),
      bpm: doc.meta.bpm || 120,
      demoStart: doc.meta.demoStart || 0,
      courses,
      tjaText,
      audioBlob: matchedAudio ? new Blob([await matchedAudio.arrayBuffer()], { type: matchedAudio.type }) : null,
      audioName: matchedAudio?.name ?? '',
      addedAt: Date.now(),
    };

    await platform.saveCustomSong(record);
    imported.push({
      id: record.id,
      title: record.title,
      subtitle: record.subtitle,
      genre: record.genre,
      genreId: record.genreId,
      bpm: record.bpm,
      demoStart: record.demoStart,
      courses: record.courses,
      source: 'custom',
    });
  }

  if (imported.length === 0) {
    throw new Error('未能从所选 .tja 文件中解析出有效谱面');
  }
  return imported;
}
