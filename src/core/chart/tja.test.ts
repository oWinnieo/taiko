import { describe, expect, it } from 'vitest';
import { compileCourse } from './compiler';
import { parseTja } from './tjaParser';
import { serializeTja } from './tjaSerializer';

const SAMPLE_TJA = `
TITLE:Test Matsuri
SUBTITLE:--Unit Test Track
BPM:120
WAVE:test.ogg
OFFSET:-1.0
DEMOSTART:4.0
GENRE:Namco Original

COURSE:Oni
LEVEL:8
BALLOON:10
#START
1020,
#GOGOSTART
#SCROLL 1.5
3040,
#BPMCHANGE 180
5008,
#GOGOEND
7008,
#END
`;

describe('TJA parser, serializer & compiler', () => {
  it('parses metadata, courses, notes and commands accurately', () => {
    const doc = parseTja(SAMPLE_TJA);
    expect(doc.meta.title).toBe('Test Matsuri');
    expect(doc.meta.subtitle).toBe('Unit Test Track');
    expect(doc.meta.bpm).toBe(120);
    expect(doc.meta.offset).toBe(-1.0);
    expect(doc.courses.oni?.level).toBe(8);
    expect(doc.courses.oni?.balloons).toEqual([10]);
    expect(doc.courses.oni?.measures).toHaveLength(4);
  });

  it('round-trips cleanly through serializeTja -> parseTja for future editor support', () => {
    const doc1 = parseTja(SAMPLE_TJA);
    const tjaOut = serializeTja(doc1);
    const doc2 = parseTja(tjaOut);

    expect(doc2.meta).toEqual(doc1.meta);
    expect(doc2.courses.oni?.level).toBe(doc1.courses.oni?.level);
    expect(doc2.courses.oni?.balloons).toEqual(doc1.courses.oni?.balloons);
    expect(doc2.courses.oni?.measures).toEqual(doc1.courses.oni?.measures);
  });

  it('compiles exact timestamps, BPM changes, Go-Go ranges, drumrolls and balloons', () => {
    const doc = parseTja(SAMPLE_TJA);
    const chart = compileCourse(doc, 'oni');

    // Measure 0 starts at -OFFSET * 1000 = +1000ms, BPM 120 -> 2000ms per 4/4 measure -> 500ms per cell
    expect(chart.notes[0].kind).toBe('don');
    expect(chart.notes[0].timeMs).toBeCloseTo(1000, 1);
    expect(chart.notes[1].kind).toBe('kat');
    expect(chart.notes[1].timeMs).toBeCloseTo(2000, 1);

    // Measure 1 starts at 3000ms, gogo=true, scroll=1.5
    expect(chart.notes[2].kind).toBe('bigDon');
    expect(chart.notes[2].gogo).toBe(true);
    expect(chart.notes[2].scroll).toBe(1.5);
    expect(chart.notes[2].timeMs).toBeCloseTo(3000, 1);

    // Measure 2 starts at 5000ms, BPM 180 -> 4 beats = 1333.33ms, 4 cells -> 333.33ms/cell
    const roll = chart.notes.find((n) => n.kind === 'drumroll');
    expect(roll).toBeDefined();
    expect(roll!.timeMs).toBeCloseTo(5000, 1);
    expect(roll!.endTimeMs).toBeCloseTo(6000, 1);

    // Balloon picks count from BALLOON:10
    const balloon = chart.notes.find((n) => n.kind === 'balloon');
    expect(balloon).toBeDefined();
    expect(balloon!.balloonHits).toBe(10);

    // Gogo ranges captured
    expect(chart.gogoRanges).toHaveLength(1);
    expect(chart.gogoRanges[0].startMs).toBeCloseTo(3000, 1);
    expect(chart.totalComboNotes).toBe(4);
  });

  it('applies GameMods (swap / speed / donOnly)', () => {
    const doc = parseTja(SAMPLE_TJA);
    const swapped = compileCourse(doc, 'oni', { swap: true, speed: 2 });
    expect(swapped.notes[0].kind).toBe('kat');
    expect(swapped.notes[1].kind).toBe('don');
    expect(swapped.notes[0].scroll).toBe(2);

    const donOnly = compileCourse(doc, 'oni', { donOnly: true });
    expect(donOnly.notes[1].kind).toBe('don');
    expect(donOnly.notes[3].kind).toBe('bigDon');
  });
});
