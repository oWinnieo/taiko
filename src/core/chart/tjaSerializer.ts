import { ChartDocument, COURSE_ORDER, CourseId, MeasureCommand } from './types';

const COURSE_HEADER_MAP: Record<CourseId, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  oni: 'Oni',
  ura: 'Edit',
};

function formatCommand(cmd: MeasureCommand): string {
  switch (cmd.type) {
    case 'BPMCHANGE':
      return `#BPMCHANGE ${cmd.bpm}`;
    case 'MEASURE':
      return `#MEASURE ${cmd.numerator}/${cmd.denominator}`;
    case 'SCROLL':
      return `#SCROLL ${cmd.scroll}`;
    case 'DELAY':
      return `#DELAY ${cmd.delaySec}`;
    case 'GOGOSTART':
      return '#GOGOSTART';
    case 'GOGOEND':
      return '#GOGOEND';
    case 'BARLINEON':
      return '#BARLINEON';
    case 'BARLINEOFF':
      return '#BARLINEOFF';
  }
}

/**
 * Serialize a ChartDocument back into valid standard .tja text.
 * Provides the persistence backbone for future chart editor support.
 */
export function serializeTja(doc: ChartDocument): string {
  const out: string[] = [];
  out.push(`TITLE:${doc.meta.title}`);
  if (doc.meta.subtitle) out.push(`SUBTITLE:--${doc.meta.subtitle}`);
  out.push(`BPM:${doc.meta.bpm}`);
  if (doc.meta.wave) out.push(`WAVE:${doc.meta.wave}`);
  out.push(`OFFSET:${doc.meta.offset}`);
  if (doc.meta.demoStart > 0) out.push(`DEMOSTART:${doc.meta.demoStart}`);
  if (doc.meta.genre) out.push(`GENRE:${doc.meta.genre}`);

  for (const courseId of COURSE_ORDER) {
    const course = doc.courses[courseId];
    if (!course) continue;
    out.push('');
    out.push(`COURSE:${COURSE_HEADER_MAP[courseId]}`);
    out.push(`LEVEL:${course.level}`);
    if (course.balloons.length > 0) {
      out.push(`BALLOON:${course.balloons.join(',')}`);
    }
    if (course.scoreInit !== undefined) out.push(`SCOREINIT:${course.scoreInit}`);
    if (course.scoreDiff !== undefined) out.push(`SCOREDIFF:${course.scoreDiff}`);
    out.push('#START');

    for (const measure of course.measures) {
      const byCell = new Map<number, MeasureCommand[]>();
      for (const cmd of measure.commands) {
        const list = byCell.get(cmd.cellIndex) ?? [];
        list.push(cmd);
        byCell.set(cmd.cellIndex, list);
      }

      if (measure.cells.length === 0) {
        const cmds = byCell.get(0) ?? [];
        for (const c of cmds) out.push(formatCommand(c));
        out.push(',');
        continue;
      }

      let chunk = '';
      for (let i = 0; i < measure.cells.length; i++) {
        const cmds = byCell.get(i);
        if (cmds && cmds.length > 0) {
          if (chunk.length > 0) {
            out.push(chunk);
            chunk = '';
          }
          for (const c of cmds) out.push(formatCommand(c));
        }
        chunk += measure.cells[i];
      }
      const trailing = byCell.get(measure.cells.length);
      if (trailing && trailing.length > 0) {
        if (chunk.length > 0) {
          out.push(chunk);
          chunk = '';
        }
        for (const c of trailing) out.push(formatCommand(c));
      }
      out.push(`${chunk},`);
    }

    out.push('#END');
  }

  return `${out.join('\n')}\n`;
}
