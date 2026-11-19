// 저장소의 인쇄 페이지(학습지·카드·컬러링)를 시험용 명세로 빌드하고 scripts/render-pdf.mjs 로 찍어 본다 (docs/CONTRACT.md 7·10절).
//  - 가장 긴 글(제목 30자, 부제 40자, 카드 앞 14자·뒤 50자, 보기 30자 …)과 모든 블록 종류를 실은 학습지가 일곱 조건을 통과한다.
//  - 찍은 PDF 는 printJobs() 의 쪽수와 A4 크기이고, Type 3 글꼴이 없으며, 다시 돌리면 캐시에서 복사만 한다. --only 는 한 묶음만 찍는다.
//  - 일부러 넘치게 만든 쪽은 차시·인쇄물·쪽을 짚는 한국어 알림과 함께 빌드를 멈춘다.
// 만든 것은 .cache/tests/print-render-<pid>/ 아래에만 둔다. Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';
import { type3Fonts } from './fonts.ts';

const skip = await noChromium();
const ROOT_OUT = path.join(c.ROOT, '.cache', 'tests', `print-render-${process.pid}`);
after(() => fs.rmSync(ROOT_OUT, { recursive: true, force: true }));

const LONG = (n: number) => '가나다라마바사아자차카타파하'.repeat(5).slice(0, n);

/** 그림을 dist 로 복사한다 (빌드 2단계 scripts/sync-media.mjs 가 하는 일. 이 시험은 그 스크립트에 기대지 않는다). */
function copyMedia(out: string) {
  for (const l of c.visibleLessons()) for (const m of l.media) {
    const to = path.join(out, c.mediaRoute(l, m.id));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(c.mediaFile(l, m.id), to);
  }
}

function renderPdf(env: Record<string, string>, args: string[]) {
  const r = spawnSync(process.execPath, [path.join(c.ROOT, 'scripts', 'render-pdf.mjs'), ...args], { cwd: c.ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

async function pdfInfo(file: string): Promise<{ pages: number; sizes: [number, number][]; text: string }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 });
  try {
    const doc = await task.promise;
    const sizes: [number, number][] = [];
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const [x0, y0, x1, y1] = p.view;
      sizes.push([((x1 - x0) / 72) * 25.4, ((y1 - y0) / 72) * 25.4]);
      text += (await p.getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join('');
    }
    return { pages: doc.numPages, sizes, text: text.replace(/\s+/g, '') };
  } finally {
    await task.destroy();
  }
}

test('인쇄 페이지를 찍는다: 가장 긴 글과 모든 블록, 캐시, --only, 넘침 알림', { skip, timeout: 240_000 }, async () => {
  const t = tempContent('print-render');
  try {
    // 5-2/1/01 을 가장 긴 글과 모든 블록 종류로 채운다
    t.edit('5-2/1/01', (l) => {
      l.worksheet.title = LONG(30);
      l.worksheet.subtitle = LONG(40);
      l.quiz.items[1].choices = [LONG(30), LONG(12), LONG(4)];
      l.worksheet.pages[0].heading = LONG(30);
      l.worksheet.pages.push(
        { heading: '두 번째 쪽', blocks: [
          { type: 'prompt', text: LONG(60) },
          { type: 'quiz', items: [1, 2, 3] },
          { type: 'match', pairs: Array.from({ length: 4 }, (_, i) => ({ left: LONG(20 - i), right: LONG(30 - i) })) },
          { type: 'table', columns: ['하나', '둘', '셋', '넷', '다섯'], rows: [['가', '', '', '', ''], ['나', '', '', '', '']] },
        ] },
        { blocks: [
          { type: 'note', title: '도움말', text: [LONG(50), LONG(30)], source: '시험용 출처' },
          { type: 'timeline', points: Array.from({ length: 8 }, (_, i) => ({ when: `${LONG(3)}${i + 1}`, what: LONG(30), blank: i % 3 === 1 })) },
          { type: 'box', label: '그려 봅시다', height_mm: 40 },
        ] },
        { blocks: [
          { type: 'observe_infer', target: '돌탑', media: 'stone', lines: 4 },
          { type: 'columns', columns: [
            [{ type: 'prompt', text: '왼쪽에 써 봅시다.', number: false }, { type: 'lines', count: 3 }],
            [{ type: 'figure', media: 'stone', width: 'full' }],
            [{ type: 'sentence_frame', frame: '나는 ___ 때문이라고 생각한다.' }],
          ] },
        ] },
      );
      const cards = l.assets.cards.cards;
      cards[0].front = LONG(14);
      cards[0].back = LONG(50);
      cards[2].front = LONG(13) + '끝';
      cards[2].back = LONG(50);
    });
    const env = { CONTENT_DIR: t.dir, SHOW_DRAFTS: '1' };
    const out = buildSite(path.join(ROOT_OUT, 'site'), env);
    Object.assign(process.env, env);
    copyMedia(out);

    const first = renderPdf(env, ['--out', out]);
    assert.equal(first.code, 0, first.out);
    for (const lesson of c.visibleLessons()) {
      for (const job of c.printJobs(lesson)) {
        if (job.kind === 'papercraft') continue; // 페이퍼크래프트 페이지는 다른 담당의 것이다
        const file = path.join(out, job.file);
        assert.ok(fs.existsSync(file), `${lesson.id} ${job.label} PDF 가 없습니다`);
        const info = await pdfInfo(file);
        assert.equal(info.pages, job.pages, `${lesson.id} ${job.label}`);
        const [w, h] = job.print.orientation === 'portrait' ? [210, 297] : [297, 210];
        for (const [pw, ph] of info.sizes) assert.ok(Math.abs(pw - w) <= 1 && Math.abs(ph - h) <= 1, `${lesson.id} ${job.label}: ${pw} × ${ph}mm`);
        // 고정 굵기 글꼴로 찍혀 Type 3 글꼴이 없다 (가변 글꼴로 찍으면 수십 벌이 들어간다)
        assert.deepEqual(type3Fonts(file), [], `${lesson.id} ${job.label} PDF 에 Type 3 글꼴이 있습니다`);
        // 초안의 바닥글과 쪽/전체
        assert.ok(info.text.includes(`${c.sheetFooter(lesson)}·1/${job.pages}`.replace(/\s+/g, '')), `${lesson.id} ${job.label} 바닥글`);
      }
    }
    // 학습지 풀이는 찍지 않고, 연표의 빈칸(what)은 비운다
    const ws = await pdfInfo(path.join(out, 'files', '5-2', '1', '01', 'worksheet.pdf'));
    assert.ok(!ws.text.includes('앞칸에본것이들어있으면됩니다'));
    // 눈으로 보려면 KEEP_PRINT_TEST=<폴더> 로 PDF 를 남긴다
    if (process.env.KEEP_PRINT_TEST) fs.cpSync(path.join(out, 'files'), process.env.KEEP_PRINT_TEST, { recursive: true });
    // 캐시: 그대로이면 다시 찍지 않는다
    const again = renderPdf(env, ['--out', out]);
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /새로 찍은 것 0개/);
    // --only: 한 묶음만
    const only = renderPdf(env, ['--out', out, '--only', '5-2/1/04']);
    assert.equal(only.code, 0, only.out);
    assert.ok(only.out.includes('5-2/1/04') && !only.out.includes('5-2/1/05'), only.out);

    // 넘침: 4차시 학습지에 줄을 더 넣어 본문을 넘긴다
    t.edit('5-2/1/04', (l) => { l.worksheet.pages[0].blocks.push({ type: 'box', height_mm: 120 }, { type: 'lines', count: 12 }); });
    buildSite(out, env);
    copyMedia(out);
    const over = renderPdf(env, ['--out', out, '--only', '5-2/1/04']);
    assert.equal(over.code, 1, over.out);
    assert.match(over.out, /5-2\/1\/04 「[^」]+」 학습지/);
    assert.match(over.out, /1쪽: 본문이 아래로 [\d.]+mm 넘칩니다/);
    assert.match(over.out, /번째 블록\((줄 쓰기 칸|빈 칸)\)부터 자리가 모자랍니다/);
    assert.ok(!fs.existsSync(path.join(out, 'files', '5-2', '1', '04', 'worksheet.pdf')), '고칠 곳이 있는 PDF 는 남기지 않습니다');
  } finally {
    for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS']) delete process.env[k];
    t.cleanup();
  }
});
