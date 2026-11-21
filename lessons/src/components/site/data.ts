// 사이트 화면이 같이 쓰는 셈. 차시표(allBundles)와 이번 빌드에 실리는 차시(visibleLessons)를 맞대어 준다.
// 빌드할 때만 돈다 (lib/content.ts 는 파일을 읽으므로 브라우저에서 돌지 않는다).
import {
  allBundles, deckCards, lessonRoute, lessonsLabel, loadRegistry, pagesLabel, printJobs, semesterLabel, visibleLessons,
} from '#lib/content.ts';
import type { BundleRef, PrintJob } from '#lib/content.ts';
import { ASSET_LABEL, DUPLEX_FLIP, PER_LABEL, printLine } from '#lib/site.ts';
import type { AssetKind, Lesson } from '#schema/lesson.ts';
import { factUses } from '#schema/lesson.ts';
import { href } from '#src/lib/url.ts';
import type { FinderSemester } from './finder.ts';

/** 차시표의 묶음 하나와, 이번 빌드에 실리면 그 명세 */
export interface Row {
  ref: BundleRef;
  /** 이번 빌드에 실리는 차시 (공개 빌드에서는 공개된 차시만). 없으면 차시 번호와 쪽수만 보여 준다. */
  lesson?: Lesson;
}

/** 차시표 전체. 공개되지 않은 묶음에는 lesson 이 없다. */
export function allRows(): Row[] {
  const visible = new Map(visibleLessons().map((l) => [l.id, l]));
  return allBundles().map((ref) => ({ ref, lesson: visible.get(ref.id) }));
}

/** 차시 번호와 쪽수가 따르는 교과서. 출판사마다 쪽수가 달라서 쪽수를 말하는 자리에 함께 밝힌다. */
export function textbookLabel(): string {
  const { publisher, author } = loadRegistry().textbook;
  return `${publisher}(${author}) 교과서`;
}

/** 쪽수·차시로 찾기에 실어 보낼 값. semester 를 주면 그 학기만. 차시표가 없는 학기는 빠진다. focus 는 싣지 않는다. */
export function finderData(semester?: string): FinderSemester[] {
  const rows = allRows();
  return loadRegistry().semesters
    .filter((s) => s.units.length > 0 && (!semester || s.id === semester))
    .map((s) => ({
      id: s.id,
      label: semesterLabel(s.id),
      bundles: rows.filter((r) => r.ref.semester.id === s.id).map(({ ref, lesson }) => ({
        unit: ref.unit.no,
        lessons: ref.lessons,
        pages: ref.pages,
        where: `${ref.unit.no}단원 ${lessonsLabel(ref.lessons)} · ${pagesLabel(ref.pages)}`,
        ...(lesson ? { href: href(lessonRoute(lesson.id)), title: lesson.title } : {}),
      })),
    }));
}

// ───────────── 차시 자료실 ─────────────

/** 흐름의 어느 단계에서든 쓴다고 적은 자료 */
export function usedInFlow(lesson: Lesson): Set<AssetKind> {
  return new Set(lesson.flow.flatMap((s) => s.uses));
}

/** 인쇄 안내 한 줄: "학생마다 1부 · A4 세로 2쪽 · 양면 · 흑백으로 뽑아도 됩니다 · A4 보통 용지". 인쇄 페이지의 안내와 같은 말이다. */
export const jobLine = (job: PrintJob) => `${printLine(job.print, job.pages).replace(' · 양면 · ', ` · 양면(${DUPLEX_FLIP[job.print.orientation]} 넘김) · `)} · ${job.print.paper}`;

/** 준비물과 '더 해 볼 자료'에 놓는 인쇄물 한 줄 */
export interface PrintRow {
  job: PrintJob;
  /** 명세에 적은 그 자료의 이름. 예: "유물 탐정 수첩" */
  title: string;
  /** 카드이면 장수 */
  cards?: number;
  /** 카드의 놀이 방법. 카드 줄 아래에 보여 준다 (docs/CONTRACT.md 6절). */
  games: { name: string; how: string }[];
  /** 명세의 prepare 가운데 이 인쇄물을 가리키는 항목에서 덧붙인 말. 따로 한 줄을 만들지 않고 이 줄에 합친다 (docs/CONTRACT.md 6절). */
  notes: string[];
}

/**
 * prepare 항목이 인쇄물 줄을 가리키는지 본다. 항목이 그 인쇄물의 이름(ASSET_LABEL)이나 명세에 적은 제목으로 시작하면 같은 것이다.
 * 가리키면 덧붙인 말(이름 뒤의 괄호 글과 qty)을 돌려준다. 덧붙인 말이 없으면 빈 문자열, 가리키지 않으면 undefined.
 * qty 가 인쇄 안내와 같은 단위(모둠마다 1부 ↔ 모둠마다 1벌)로 시작하면 한 줄에 같은 말이 두 번 서므로 뺀다.
 */
export function prepareNote(item: { item: string; qty?: string }, row: Pick<PrintRow, 'job' | 'title'>): string | undefined {
  const text = item.item.trim();
  const name = [row.job.label, row.title].find((n) => text === n || text.startsWith(`${n} `) || text.startsWith(`${n}(`));
  if (name === undefined) return undefined;
  const rest = text.slice(name.length).trim().replace(/^\((.*)\)$/, '$1').trim();
  const per = PER_LABEL[row.job.print.per].split(' ')[0];
  const qty = item.qty && !item.qty.startsWith(per) ? item.qty : '';
  return [rest, qty].filter(Boolean).join(' · ');
}

/**
 * 인쇄물을 준비물과 '더 해 볼 자료'로 나눈다 (docs/CONTRACT.md 5절).
 * 준비물: 학습지와, 흐름의 uses 에 나오는 인쇄물. 나머지 인쇄물은 '더 해 볼 자료'.
 * 명세의 prepare 가운데 준비물의 인쇄물 줄을 가리키는 항목은 그 줄의 notes 로 옮기고, 나머지만 extra 로 돌려준다 (6절).
 */
export function printRows(lesson: Lesson): { prepare: PrintRow[]; more: PrintRow[]; extra: Lesson['prepare'] } {
  const used = usedInFlow(lesson);
  const a = lesson.assets;
  const row = (job: PrintJob): PrintRow => {
    if (job.kind === 'cards' && a.cards.state === 'ready') return { job, title: a.cards.title, cards: deckCards(lesson).length, games: a.cards.games, notes: [] };
    if (job.kind === 'papercraft' && a.papercraft.state === 'ready') return { job, title: a.papercraft.title, games: [], notes: [] };
    if (job.kind === 'coloring' && a.coloring.state === 'ready') return { job, title: a.coloring.title, games: [], notes: [] };
    return { job, title: lesson.worksheet.title, games: [], notes: [] };
  };
  const rows = printJobs(lesson).map(row);
  const inPrepare = (r: PrintRow) => r.job.kind === 'worksheet' || used.has(r.job.kind);
  const prepare = rows.filter(inPrepare);
  const extra = lesson.prepare.filter((p) => {
    for (const r of prepare) {
      const note = prepareNote(p, r);
      if (note === undefined) continue;
      if (note) r.notes.push(note);
      return false;
    }
    return true;
  });
  return { prepare, more: rows.filter((r) => !inPrepare(r)), extra };
}

/** 흐름 단계의 '쓰는 자료'를 우리말 이름으로 */
export const usesLabel = (uses: AssetKind[]) => uses.map((u) => ASSET_LABEL[u]).join(' · ');

/** 이 묶음이 가리키는 사실 전부 (겹치지 않게): 이 묶음의 사실 다음에 앞 묶음에서 빌려 온 사실. 안내 페이지의 '사실과 출처'에 쓴다. */
export function factRefs(lesson: Lesson): string[] {
  const borrowed = factUses(lesson).map((u) => u.ref).filter((ref) => ref.includes('/'));
  return [...lesson.facts.map((f) => f.id), ...new Set(borrowed)];
}

/**
 * 한 사실 아래의 출처를 이름·제목·주소가 같은 것끼리 한 줄로 묶는다 (docs/CONTRACT.md 6절).
 * 같은 문서의 다른 구절을 따로 적은 출처가 화면에 두 번 서지 않게 한다. 확인한 날은 가장 늦은 날을 남긴다. 차례는 처음 나온 차례다.
 */
export function uniqueSources<S extends { name: string; title?: string; url: string; accessed: string }>(sources: readonly S[]): S[] {
  const seen = new Map<string, S>();
  for (const s of sources) {
    const key = JSON.stringify([s.name, s.title ?? '', s.url]);
    const hit = seen.get(key);
    if (!hit) seen.set(key, s);
    else if (s.accessed > hit.accessed) seen.set(key, { ...hit, accessed: s.accessed });
  }
  return [...seen.values()];
}
