// 산출물 검사 (checks/outputs.mjs, docs/CONTRACT.md 11절).
// 계약의 시험용 사이트(tests/contract/fixtures/site)를 .cache/tests/ 아래에 빌드하고, PDF 는 Chromium 으로, PPTX 는 손으로 만든 zip 으로 채운 뒤
// 멀쩡한 것은 통과하고 일부러 틀리게 만든 것은 걸리는지 본다. Chromium 이 없으면 빌드해 보는 시험은 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { buildSite, FIXTURES, noChromium } from '../contract/helpers.ts';
import { pngHeader, pptxWith, runNode, scratch } from './helpers.ts';
import { cssLoads, externalLoads } from '../../checks/outputs.mjs';
import { imageSize, readPptx } from '../../checks/files.mjs';

const skip = await noChromium();
const OUT = path.join(scratch('outputs'), 'site');
after(() => fs.rmSync(path.dirname(OUT), { recursive: true, force: true }));

test('사이트 밖에서 불러오는 것만 잡고, 링크(<a>)와 주소를 알리는 <link> 는 그대로 둔다', () => {
  const html = `<link rel="stylesheet" href="https://fonts.example/a.css"><link rel="canonical" href="https://nalssam.github.io/x/">
    <script src="//cdn.example/x.js"></script><script src="/_astro/a.js"></script><img src="/media/a.png" srcset="/a.png 1x, https://cdn.example/b.png 2x">
    <a href="https://github.com/nalssam">깃허브</a><iframe src="https://video.example/embed"></iframe>
    <style>@font-face{src:url("https://fonts.example/f.woff2")} .a{background:url(/media/a.png)}</style>`;
  assert.deepEqual(externalLoads(html), [
    '<link> https://fonts.example/a.css', '<script> //cdn.example/x.js', '<img> https://cdn.example/b.png', '<iframe> https://video.example/embed',
    'CSS https://fonts.example/f.woff2',
  ]);
  assert.deepEqual(cssLoads('@import url("https://x.example/a.css"); @import "/b.css";'), ['https://x.example/a.css']);
});

test('PPTX 를 읽어 장 수, 글, 그림의 표시 크기와 자르기 값을 꺼낸다', () => {
  const deck = readPptx(pptxWith([
    { cx: 1600, cy: 900, image: pngHeader(1600, 900) },
    { cx: 1600, cy: 1600, image: pngHeader(1600, 900), crop: '<a:srcRect l="1000" r="0"/>' },
  ], '검수 전 초안입니다. &amp; 끝', 3));
  assert.equal(deck.slides, 3);
  assert.ok(deck.text.startsWith('검수 전 초안입니다. & 끝'));
  assert.deepEqual(deck.pictures.map((p) => [p.slide, p.cx, p.cy, p.size, p.crop]), [
    [1, 1600, 900, { w: 1600, h: 900 }, {}],
    [1, 1600, 1600, { w: 1600, h: 900 }, { l: 1000, r: 0 }],
  ]);
  assert.deepEqual(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 249"></svg>'), 'a.svg'), { w: 190, h: 249 });
});

/** printJobs() 의 쪽수와 방향대로 PDF 를 찍고(바닥글은 sheetFooter()), 수업 화면 장 수에 그림 출처 한 장을 더한 PPTX 를 만든다 */
async function fillFiles(out: string, page: import('playwright').Page) {
  for (const lesson of c.visibleLessons()) {
    for (const job of c.printJobs(lesson)) {
      const sheets = Array.from({ length: job.pages }, (_, i) => `<section style="height:100vh;break-after:page">${job.label} ${i + 1}쪽<footer>${c.sheetFooter(lesson)}</footer></section>`).join('');
      await page.setContent(`<style>@page{size:A4 ${job.print.orientation};margin:0}body{margin:0}</style>${sheets}`);
      const file = path.join(out, job.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    }
    const pics = c.shownMedia(lesson, 'slides').map(() => ({ cx: 1600, cy: 900, image: pngHeader(1600, 900) }));
    fs.writeFileSync(path.join(out, c.pptxFile(lesson).file), pptxWith(pics, c.footerNotice(lesson), lesson.slides.length, 1));
  }
}

test('미리 보기 빌드: 멀쩡한 산출물은 통과하고, 틀린 쪽수·쪽 크기·바깥 주소·focus·늘어난 그림·잘못 그린 그림·빠진 파일을 잡는다', { skip }, async () => {
  const env = { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' };
  buildSite(OUT, env, { root: path.join(c.ROOT, 'tests', 'contract', 'fixtures', 'site') });
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const l of c.visibleLessons()) for (const m of l.media) {
      const to = path.join(OUT, c.mediaRoute(l, m.id));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(c.mediaFile(l, m.id), to);
    }
    const page = await browser.newPage();
    await fillFiles(OUT, page);
    const outputs = () => runNode('checks/outputs.mjs', ['--out', OUT], env);
    let r = outputs();
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^산출물 검사 · .* · 미리 보기 빌드\(SHOW_DRAFTS=1\) · 묶음 4개 · html \d+쪽/);
    assert.match(r.out, /통과했습니다\.$/m);

    // ── 일부러 틀리게 만든다 ──
    const lesson = c.loadLesson('5-2/1/01');
    const ws = path.join(OUT, c.printJobs(lesson)[0].file);
    await page.setContent('<style>@page{size:A4 landscape;margin:0}</style>쪽 크기가 틀린 학습지');
    fs.writeFileSync(ws, await page.pdf({ preferCSSPageSize: true }));
    const cards = c.printJobs(lesson).find((j) => j.kind === 'cards')!;
    await page.setContent(`<style>@page{size:A4;margin:0}</style>${SITE.draftNotice}`);
    fs.writeFileSync(path.join(OUT, cards.file), await page.pdf({ preferCSSPageSize: true }));
    const index = path.join(OUT, '5-2', '1', '01', 'index.html');
    const focus = c.findBundle('5-2/1/01')!.bundle.focus;
    fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('</main>', `<p>${focus}</p><img src="/media/5-2/1/01/stone.svg" alt="" style="object-fit:cover;width:10px;height:50px"><script src="https://cdn.example/x.js"></script></main>`));
    fs.writeFileSync(path.join(OUT, c.pptxFile(lesson).file), pptxWith([{ cx: 1600, cy: 1600, image: pngHeader(1600, 900) }], SITE.aiNotice, lesson.slides.length, 1));
    fs.rmSync(path.join(OUT, c.pptxFile(c.loadLesson('5-2/1/04')).file));
    r = outputs();
    assert.equal(r.code, 1);
    const lines = r.out.split('\n');
    const has = (re: RegExp) => assert.ok(lines.some((l) => re.test(l)), `${re} 가 없습니다:\n${r.out}`);
    has(/files\/5-2\/1\/01\/worksheet\.pdf: 1쪽의 크기가 297 × 210mm 입니다\. A4 세로\(210 × 297mm\)여야 합니다/);
    has(/files\/5-2\/1\/01\/cards\.pdf: 1쪽입니다\. 2쪽이어야 합니다 \(printJobs\)/);
    has(/files\/5-2\/1\/01\/worksheet\.pdf: 초안의 PDF 에 "검수 전 초안입니다\. 수업에 쓰지 마세요\." 가 없습니다/);
    has(/5-2\/1\/01\/index\.html: 사이트 밖 주소를 불러옵니다: <script> https:\/\/cdn\.example\/x\.js/);
    has(/5-2\/1\/01\/index\.html: 차시표의 focus\(5-2\/1\/01\)가 실렸습니다/);
    has(/5-2\/1\/01\/index\.html: 그림이 object-fit: contain 으로 그려지지 않습니다: \/media\/5-2\/1\/01\/stone\.svg \(cover\)/);
    has(/slides\.pptx 1번 장 그림 "그림 1": 가로세로 비율이 원본과 다릅니다 \(원본 1\.778, PPTX 1\.000\)/);
    has(/files\/5-2\/1\/01\/slides\.pptx: 초안의 PPTX 에 "AI 도구로 초안을 만들고 교사가 검수한 자료입니다\." 가 있습니다/);
    has(/files\/5-2\/1\/04\/slides\.pptx: PPTX 가 없습니다 \(빌드 4단계 generators\/pptx\/build\.mjs 가 만듭니다\)/);

    // ── 같은 dist 를 공개 빌드로 보면: 초안의 페이지·그림·파일과 localhost 주소가 걸린다 ──
    r = runNode('checks/outputs.mjs', ['--out', OUT], { CONTENT_DIR: FIXTURES, SITE_URL: 'https://example.org' });
    assert.equal(r.code, 1);
    assert.match(r.out, /공개 빌드 · 묶음 0개/);
    assert.match(r.out, /5-2\/1\/01: 이번 빌드에 실리지 않는 묶음의 페이지입니다 \(공개 빌드에 초안이 섞였거나 visibleLessons\(\) 에 없습니다\)/);
    assert.match(r.out, /media\/5-2\/1\/01: 이번 빌드에 실리지 않는 묶음의 그림입니다/);
    assert.match(r.out, /files\/5-2\/1\/01: 이번 빌드에 실리지 않는 묶음의 파일입니다/);
    assert.match(r.out, /index\.html: 공개 빌드에 초안의 페이지가 들어 있습니다 \(data-draft\)/);
    assert.match(r.out, /index\.html: localhost·127\.0\.0\.1 주소가 있습니다/);
  } finally {
    await browser.close();
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
