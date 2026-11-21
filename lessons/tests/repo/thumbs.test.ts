// 자료 카드의 미리보기 그림 (scripts/thumbs.mjs, 빌드 3단계. docs/CONTRACT.md 10절, R52).
// 시험용 명세 넷으로 사이트를 .cache/tests/ 아래에 빌드하고 render-pdf 를 돌려, 준비된 자료마다 정한 크기의 JPEG 이 생기는지,
// 캐시와 --kind 가 맞게 도는지, 남의 그림을 가리고 찍는지 본다. Chromium 이 없으면 건너뛴다 (16절).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_ROUTE } from '#lib/site.ts';
import type { RoutedKind } from '#lib/site.ts';
import { buildSite, FIXTURES, noChromium } from '../contract/helpers.ts';
import { runNode, scratch } from './helpers.ts';
import { THUMB_KINDS, THUMB_MAX, jpegSize, thumbJobs } from '../../scripts/thumbs.mjs';

const skip = await noChromium();
const OUT = path.join(scratch('thumbs'), 'site');
const ENV = { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' };
const render = (...args: string[]) => runNode('scripts/render-pdf.mjs', ['--out', OUT, ...args], ENV);
after(() => fs.rmSync(path.dirname(OUT), { recursive: true, force: true }));

/** 시험용 명세에서 미리보기가 있어야 하는 것: 차시마다 준비된 자료 가운데 페이지가 있는 것 */
function expected(): { id: string; kind: RoutedKind }[] {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    return c.visibleLessons().flatMap((l) => THUMB_KINDS.filter((k) => (c.readyKinds(l) as string[]).includes(k)).map((k) => ({ id: l.id, kind: k as RoutedKind })));
  } finally {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

/** 그 인쇄물이 가로 쪽인가 (printJobs() 의 방향) */
function landscape(id: string, kind: string): boolean {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    return c.printJobs(c.loadLesson(id)).find((j) => j.kind === kind)?.print.orientation === 'landscape';
  } finally {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('찍는 자료와 크기: 페이지가 있는 자료 일곱 가지, 인쇄물 480 × 360 · 수업 화면 480 × 270 · 학생 페이지 270 × 360', () => {
  assert.deepEqual([...THUMB_KINDS].sort(), Object.keys(ASSET_ROUTE).sort());
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    const jobs = thumbJobs(c.visibleLessons());
    const size = Object.fromEntries(jobs.map((j: { kind: string; shot: { size: number[] } }) => [j.kind, j.shot.size.join('x')]));
    assert.deepEqual(size, { slides: '480x270', worksheet: '480x360', quiz: '270x360', papercraft: '480x360', coloring: '480x360', cards: '480x360', web_activity: '270x360' });
    // --kind 를 주면 그 종류만
    assert.ok(thumbJobs(c.visibleLessons(), 'quiz').every((j: { kind: string }) => j.kind === 'quiz'));
  } finally {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

before(() => {
  if (skip) return;
  buildSite(OUT, ENV);
  const sync = runNode('scripts/sync-media.mjs', ['--out', OUT], ENV);
  assert.equal(sync.code, 0, sync.all);
});

test('준비된 자료마다 폭 480px·60KB 이하의 JPEG 을 찍고, 다시 돌리면 캐시에서 복사한다', { skip }, () => {
  let r = render();
  assert.equal(r.code, 0, r.all);
  const want = expected();
  assert.ok(want.length >= 10, `시험용 명세의 미리보기가 ${want.length}장뿐입니다`);
  assert.ok(want.some((w) => landscape(w.id, w.kind)), '시험용 명세에 가로 쪽 인쇄물이 없습니다');
  for (const { id, kind } of want) {
    const file = c.thumbFile(id, kind, ['--out', OUT]);
    assert.ok(fs.existsSync(file), `${id} ${kind} 미리보기가 없습니다`);
    const buf = fs.readFileSync(file);
    const size = jpegSize(buf);
    assert.ok(size, `${id} ${kind}: JPEG 이 아닙니다`);
    assert.ok(buf.length <= THUMB_MAX.bytes, `${id} ${kind}: ${buf.length}B`);
    // 인쇄물은 쪽의 윗부분 4:3 (480 × 360). 가로 쪽은 쪽 전체가 그보다 납작해서 쪽 전체(480 × 339)를 찍는다.
    const [w, h] = kind === 'slides' ? [480, 270] : kind === 'quiz' || kind === 'web_activity' ? [270, 360] : landscape(id, kind) ? [480, 339] : [480, 360];
    assert.deepEqual([size!.w, size!.h], [w, h], `${id} ${kind}`);
  }
  // 미리보기 그림의 자리에는 준비된 자료의 것만 있다
  const dirs = new Set(want.map((w) => path.dirname(c.thumbFile(w.id, w.kind, ['--out', OUT]))));
  const made = [...dirs].flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f))).sort();
  assert.deepEqual(made, want.map((w) => c.thumbFile(w.id, w.kind, ['--out', OUT])).sort());
  assert.match(r.out, new RegExp(`미리보기 그림 ${want.length}장: 새로 찍은 것 ${want.length}장, 그대로 쓴 것 0장`));

  // 입력이 그대로면 찍지 않고 복사한다. 지난 빌드에 남은 모르는 미리보기는 지운다.
  const stray = path.join(path.dirname(c.thumbFile(want[0].id, want[0].kind, ['--out', OUT])), 'escape.jpg');
  fs.writeFileSync(stray, 'old');
  r = render();
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, new RegExp(`미리보기 그림 ${want.length}장: 새로 찍은 것 0장, 그대로 쓴 것 ${want.length}장`));
  assert.ok(!fs.existsSync(stray), '목록에 없는 미리보기가 남았습니다');

  // --kind 는 그 종류의 미리보기만 다시 찍고, PDF 가 없는 종류(수업 화면)는 PDF 를 찍지 않는다
  r = render('--kind', 'slides', '--force');
  assert.equal(r.code, 0, r.all);
  assert.doesNotMatch(r.out, /인쇄물 \d+개를 PDF 로/);
  const slides = want.filter((w) => w.kind === 'slides').length;
  assert.match(r.out, new RegExp(`미리보기 그림 ${slides}장: 새로 찍은 것 ${slides}장`));
  r = render('--kind', 'nothing');
  assert.equal(r.code, 1);
  assert.match(r.err, /--kind 에는 worksheet · papercraft · coloring · cards · slides · quiz · web_activity 가운데 하나를 적습니다/);
});

test('남의 그림(data-licence)은 가리고 찍는다: 가린 그림과 그대로 둔 그림의 미리보기가 다르다', { skip }, () => {
  // 시험용 명세에서 남의 그림이 미리보기 자리에 실리는 페이지 (두 차시 묶음의 컬러링 도안 첫 쪽)
  const target = expected().find(({ id, kind }) => kind !== 'slides' && fs.readFileSync(path.join(OUT, c.lessonRoute(id, ASSET_ROUTE[kind]), 'index.html'), 'utf8').includes('data-licence='));
  assert.ok(target, '시험용 명세에 남의 그림(data-licence)이 실리는 자료 페이지가 없습니다');
  const { id, kind } = target;
  const page = path.join(OUT, c.lessonRoute(id, ASSET_ROUTE[kind]), 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  const hidden = fs.readFileSync(c.thumbFile(id, kind, ['--out', OUT]));
  // data-licence 를 떼면 가릴 것이 없어 그림이 찍힌다
  fs.writeFileSync(page, html.replace(/\sdata-licence="[^"]*"/g, ''));
  try {
    const r = render('--kind', kind, '--only', id, '--force');
    assert.equal(r.code, 0, r.all);
    const shown = fs.readFileSync(c.thumbFile(id, kind, ['--out', OUT]));
    assert.notDeepEqual(shown, hidden, `${id} ${kind}: 그림을 가려도 같은 미리보기가 나옵니다`);
  } finally {
    fs.writeFileSync(page, html);
  }
});
