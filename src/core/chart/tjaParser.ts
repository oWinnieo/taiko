import {
  ChartDocument,
  ChartMeasure,
  CourseDocument,
  CourseId,
  MeasureCommand,
  NoteSymbol,
} from './types';

const VALID_SYMBOLS = new Set<string>(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/**
 * Decode raw TJA bytes trying strict UTF-8 first, then Shift-JIS, then GBK.
 */
export function decodeTjaBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Strip UTF-8 BOM if present
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Fallback for Japanese community TJA files encoded in Shift-JIS
    for (const enc of ['shift-jis', 'gbk', 'utf-8']) {
      try {
        return new TextDecoder(enc).decode(bytes);
      } catch {
        continue;
      }
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function normalizeCourseId(raw: string): CourseId {
  const s = raw.trim().toLowerCase();
  if (s === '0' || s === 'easy' || s === 'kantan') return 'easy';
  if (s === '1' || s === 'normal' || s === 'futsuu') return 'normal';
  if (s === '2' || s === 'hard' || s === 'muzukashii') return 'hard';
  if (s === '4' || s === 'edit' || s === 'ura' || s === 'inner') return 'ura';
  return 'oni';
}

function stripComment(line: string): string {
  const idx = line.indexOf('//');
  return (idx >= 0 ? line.slice(0, idx) : line).trim();
}

export function parseTja(text: string): ChartDocument {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const meta = {
    title: 'Untitled Song',
    subtitle: '',
    bpm: 120,
    wave: '',
    offset: 0,
    demoStart: 0,
    genre: 'Namco Original',
  };

  const courses: Partial<Record<CourseId, CourseDocument>> = {};

  let currentCourse: CourseId = 'oni';
  let currentLevel = 5;
  let currentBalloons: number[] = [];
  let currentScoreInit: number | undefined;
  let currentScoreDiff: number | undefined;

  let inChart = false;
  let measures: ChartMeasure[] = [];
  let pendingCells: NoteSymbol[] = [];
  let pendingCommands: MeasureCommand[] = [];

  // Branch handling: keep default/master branch cleanly without duplicating measures
  let inBranch = false;
  let activeBranch: 'none' | 'N' | 'E' | 'M' = 'none';
  let branchCaptureTarget: 'N' | 'M' = 'M';

  const flushMeasure = () => {
    measures.push({
      index: measures.length,
      cells: pendingCells.slice(),
      commands: pendingCommands.slice(),
    });
    pendingCells = [];
    pendingCommands = [];
  };

  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    if (!line) continue;

    if (!inChart) {
      if (line.toUpperCase().startsWith('#START')) {
        inChart = true;
        measures = [];
        pendingCells = [];
        pendingCommands = [];
        inBranch = false;
        activeBranch = 'none';
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toUpperCase();
        const val = line.slice(colonIdx + 1).trim();
        switch (key) {
          case 'TITLE':
            if (val) meta.title = val;
            break;
          case 'SUBTITLE':
            meta.subtitle = val.replace(/^--/, '').replace(/^\+\+/, '').trim();
            break;
          case 'BPM': {
            const n = parseFloat(val);
            if (!Number.isNaN(n) && n > 0) meta.bpm = n;
            break;
          }
          case 'WAVE':
            meta.wave = val;
            break;
          case 'OFFSET': {
            const n = parseFloat(val);
            if (!Number.isNaN(n)) meta.offset = n;
            break;
          }
          case 'DEMOSTART': {
            const n = parseFloat(val);
            if (!Number.isNaN(n) && n >= 0) meta.demoStart = n;
            break;
          }
          case 'GENRE':
            if (val) meta.genre = val;
            break;
          case 'COURSE':
            currentCourse = normalizeCourseId(val);
            currentLevel = 5;
            currentBalloons = [];
            currentScoreInit = undefined;
            currentScoreDiff = undefined;
            break;
          case 'LEVEL': {
            const n = parseInt(val, 10);
            if (!Number.isNaN(n)) currentLevel = Math.max(1, Math.min(10, n));
            break;
          }
          case 'BALLOON':
            currentBalloons = val
              .split(',')
              .map((x) => parseInt(x.trim(), 10))
              .filter((x) => !Number.isNaN(x) && x > 0);
            break;
          case 'SCOREINIT': {
            const first = val.split(',')[0];
            const n = parseInt(first, 10);
            if (!Number.isNaN(n) && n > 0) currentScoreInit = n;
            break;
          }
          case 'SCOREDIFF': {
            const n = parseInt(val, 10);
            if (!Number.isNaN(n) && n > 0) currentScoreDiff = n;
            break;
          }
        }
      }
      continue;
    }

    // Inside #START ... #END
    if (line.startsWith('#')) {
      const upper = line.toUpperCase();
      if (upper.startsWith('#END')) {
        if (pendingCells.length > 0 || pendingCommands.length > 0) {
          flushMeasure();
        }
        courses[currentCourse] = {
          courseId: currentCourse,
          level: currentLevel,
          balloons: currentBalloons.slice(),
          scoreInit: currentScoreInit,
          scoreDiff: currentScoreDiff,
          measures,
        };
        inChart = false;
        continue;
      }

      if (upper.startsWith('#BRANCHSTART')) {
        inBranch = true;
        activeBranch = 'none';
        // Prefer normal branch for easy/normal, master for hard/oni/ura
        branchCaptureTarget = currentCourse === 'easy' || currentCourse === 'normal' ? 'N' : 'M';
        continue;
      }
      if (upper === '#N') {
        activeBranch = 'N';
        continue;
      }
      if (upper === '#E') {
        activeBranch = 'E';
        continue;
      }
      if (upper === '#M') {
        activeBranch = 'M';
        continue;
      }
      if (upper.startsWith('#BRANCHEND')) {
        inBranch = false;
        activeBranch = 'none';
        continue;
      }

      if (inBranch && activeBranch !== branchCaptureTarget && activeBranch !== 'none') {
        continue;
      }

      const cellIndex = pendingCells.length;
      if (upper.startsWith('#BPMCHANGE')) {
        const bpm = parseFloat(line.slice(10).trim());
        if (!Number.isNaN(bpm) && bpm > 0) {
          pendingCommands.push({ type: 'BPMCHANGE', bpm, cellIndex });
        }
      } else if (upper.startsWith('#MEASURE')) {
        const parts = line.slice(8).trim().split('/');
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1] ?? '4');
        if (!Number.isNaN(num) && !Number.isNaN(den) && num > 0 && den > 0) {
          pendingCommands.push({ type: 'MEASURE', numerator: num, denominator: den, cellIndex });
        }
      } else if (upper.startsWith('#SCROLL')) {
        const scroll = parseFloat(line.slice(7).trim());
        if (!Number.isNaN(scroll)) {
          pendingCommands.push({ type: 'SCROLL', scroll, cellIndex });
        }
      } else if (upper.startsWith('#DELAY')) {
        const delaySec = parseFloat(line.slice(6).trim());
        if (!Number.isNaN(delaySec)) {
          pendingCommands.push({ type: 'DELAY', delaySec, cellIndex });
        }
      } else if (upper.startsWith('#GOGOSTART')) {
        pendingCommands.push({ type: 'GOGOSTART', cellIndex });
      } else if (upper.startsWith('#GOGOEND')) {
        pendingCommands.push({ type: 'GOGOEND', cellIndex });
      } else if (upper.startsWith('#BARLINEON')) {
        pendingCommands.push({ type: 'BARLINEON', cellIndex });
      } else if (upper.startsWith('#BARLINEOFF')) {
        pendingCommands.push({ type: 'BARLINEOFF', cellIndex });
      }
      continue;
    }

    if (inBranch && activeBranch !== branchCaptureTarget && activeBranch !== 'none') {
      continue;
    }

    // Note data line (may contain multiple commas)
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ',') {
        flushMeasure();
      } else if (VALID_SYMBOLS.has(ch)) {
        pendingCells.push(ch as NoteSymbol);
      }
    }
  }

  return { meta, courses };
}
