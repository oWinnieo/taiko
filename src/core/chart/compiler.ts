import {
  BpmEvent,
  ChartDocument,
  CourseId,
  DEFAULT_MODS,
  GameMods,
  GogoRange,
  NoteKind,
  PlayableBarline,
  PlayableChart,
  PlayableNote,
} from './types';

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function applyNoteMods(kind: NoteKind, mods: GameMods, rand: () => number): NoteKind {
  if (kind !== 'don' && kind !== 'kat' && kind !== 'bigDon' && kind !== 'bigKat') {
    return kind;
  }
  const isBig = kind === 'bigDon' || kind === 'bigKat';
  let isDon = kind === 'don' || kind === 'bigDon';

  if (mods.donOnly) {
    isDon = true;
  } else if (mods.katOnly) {
    isDon = false;
  } else {
    if (mods.swap) isDon = !isDon;
    if (mods.random === 'kimagure' && rand() < 0.25) isDon = !isDon;
    if (mods.random === 'detarame' && rand() < 0.5) isDon = !isDon;
  }

  if (isBig) return isDon ? 'bigDon' : 'bigKat';
  return isDon ? 'don' : 'kat';
}

export function compileCourse(
  doc: ChartDocument,
  courseId: CourseId,
  partialMods?: Partial<GameMods>,
): PlayableChart {
  const course = doc.courses[courseId];
  if (!course) {
    throw new Error(`Course "${courseId}" not found in chart "${doc.meta.title}"`);
  }

  const mods: GameMods = { ...DEFAULT_MODS, ...partialMods };
  const rand = seededRandom(doc.meta.title.length * 997 + course.measures.length * 31);

  let bpm = doc.meta.bpm || 120;
  let measureNum = 4;
  let measureDen = 4;
  let scroll = 1;
  let gogo = false;
  let barlineVisible = true;

  // TJA OFFSET: negative offset means music starts BEFORE measure 0 (lead-in),
  // so measure 0 begins at timeMs = -offset * 1000.
  let currentTimeMs = -doc.meta.offset * 1000;

  const notes: PlayableNote[] = [];
  const barlines: PlayableBarline[] = [];
  const gogoRanges: GogoRange[] = [];
  const bpmEvents: BpmEvent[] = [{ timeMs: currentTimeMs, bpm }];

  let gogoOpenStart: number | null = null;
  let activeLongNote: PlayableNote | null = null;
  let balloonCursor = 0;
  let nextId = 1;

  for (const measure of course.measures) {
    const cmdMap = new Map<number, typeof measure.commands>();
    for (const cmd of measure.commands) {
      const list = cmdMap.get(cmd.cellIndex) ?? [];
      list.push(cmd);
      cmdMap.set(cmd.cellIndex, list);
    }

    const applyCommandsAt = (cellIdx: number) => {
      const cmds = cmdMap.get(cellIdx);
      if (!cmds) return;
      for (const cmd of cmds) {
        switch (cmd.type) {
          case 'BPMCHANGE':
            bpm = cmd.bpm;
            bpmEvents.push({ timeMs: currentTimeMs, bpm });
            break;
          case 'MEASURE':
            measureNum = cmd.numerator;
            measureDen = cmd.denominator;
            break;
          case 'SCROLL':
            scroll = cmd.scroll;
            break;
          case 'DELAY':
            currentTimeMs += cmd.delaySec * 1000;
            break;
          case 'GOGOSTART':
            if (!gogo) {
              gogo = true;
              gogoOpenStart = currentTimeMs;
            }
            break;
          case 'GOGOEND':
            if (gogo) {
              gogo = false;
              if (gogoOpenStart !== null) {
                gogoRanges.push({ startMs: gogoOpenStart, endMs: currentTimeMs });
                gogoOpenStart = null;
              }
            }
            break;
          case 'BARLINEON':
            barlineVisible = true;
            break;
          case 'BARLINEOFF':
            barlineVisible = false;
            break;
        }
      }
    };

    // Apply commands at start of measure before emitting barline
    applyCommandsAt(0);

    if (barlineVisible) {
      barlines.push({
        timeMs: currentTimeMs,
        bpm,
        scroll: scroll * mods.speed,
        measureIndex: measure.index,
      });
    }

    const cellCount = measure.cells.length;
    if (cellCount === 0) {
      const measureMs = (60000 / bpm) * 4 * (measureNum / measureDen);
      currentTimeMs += measureMs;
      continue;
    }

    for (let i = 0; i < cellCount; i++) {
      if (i > 0) applyCommandsAt(i);
      const sym = measure.cells[i];
      const effScroll = scroll * mods.speed;

      if (sym === '1' || sym === '2' || sym === '3' || sym === '4') {
        const baseKind: NoteKind =
          sym === '1' ? 'don' : sym === '2' ? 'kat' : sym === '3' ? 'bigDon' : 'bigKat';
        const kind = applyNoteMods(baseKind, mods, rand);
        notes.push({
          id: nextId++,
          kind,
          timeMs: currentTimeMs,
          endTimeMs: currentTimeMs,
          bpm,
          scroll: effScroll,
          gogo,
          balloonHits: 0,
          judged: false,
          hitCount: 0,
          doubleHitAwarded: false,
          firstHitTimeMs: null,
          firstHitHand: null,
        });
      } else if (sym === '5' || sym === '6' || sym === '7' || sym === '9') {
        // Close any unclosed previous long note gracefully
        if (activeLongNote) {
          activeLongNote.endTimeMs = Math.max(activeLongNote.timeMs + 50, currentTimeMs);
          activeLongNote = null;
        }
        const kind: NoteKind =
          sym === '5'
            ? 'drumroll'
            : sym === '6'
              ? 'bigDrumroll'
              : sym === '7'
                ? 'balloon'
                : 'kusudama';
        const hitsRequired =
          kind === 'balloon' || kind === 'kusudama'
            ? (course.balloons[balloonCursor++] ?? 5)
            : 0;
        const note: PlayableNote = {
          id: nextId++,
          kind,
          timeMs: currentTimeMs,
          endTimeMs: currentTimeMs + 250,
          bpm,
          scroll: effScroll,
          gogo,
          balloonHits: hitsRequired,
          judged: false,
          hitCount: 0,
          doubleHitAwarded: false,
          firstHitTimeMs: null,
          firstHitHand: null,
        };
        notes.push(note);
        activeLongNote = note;
      } else if (sym === '8') {
        if (activeLongNote) {
          activeLongNote.endTimeMs = Math.max(activeLongNote.timeMs + 40, currentTimeMs);
          activeLongNote = null;
        }
      }

      const stepMs = ((60000 / bpm) * 4 * (measureNum / measureDen)) / cellCount;
      currentTimeMs += stepMs;
    }

    applyCommandsAt(cellCount);
  }

  if (activeLongNote) {
    activeLongNote.endTimeMs = Math.max(activeLongNote.timeMs + 100, currentTimeMs);
    activeLongNote = null;
  }
  if (gogoOpenStart !== null) {
    gogoRanges.push({ startMs: gogoOpenStart, endMs: currentTimeMs });
  }

  const comboNotes = notes.filter(
    (n) => n.kind === 'don' || n.kind === 'kat' || n.kind === 'bigDon' || n.kind === 'bigKat',
  );

  // Shin-uchi base score: scale so a full-good play targets ~1,000,000 points
  let weightedUnits = 0;
  for (const n of comboNotes) {
    const bigMul = n.kind === 'bigDon' || n.kind === 'bigKat' ? 1.5 : 1;
    const gogoMul = n.gogo ? 1.2 : 1;
    weightedUnits += bigMul * gogoMul;
  }
  const rawBase = weightedUnits > 0 ? 1000000 / weightedUnits : 1000;
  const baseScore = Math.max(100, Math.ceil(rawBase / 10) * 10);

  const lastNoteEnd = notes.reduce((acc, n) => Math.max(acc, n.endTimeMs), 0);
  const endTimeMs = Math.max(currentTimeMs + 1500, lastNoteEnd + 2200);

  return {
    meta: doc.meta,
    courseId,
    level: course.level,
    notes,
    barlines,
    gogoRanges,
    bpmEvents,
    totalComboNotes: comboNotes.length,
    baseScore,
    endTimeMs,
  };
}
