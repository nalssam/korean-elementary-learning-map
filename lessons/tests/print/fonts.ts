// PDF 에 든 Type 3 글꼴을 찾는다 (docs/CONTRACT.md 7절 '글꼴').
// 인쇄 페이지를 가변 글꼴로 찍으면 Chromium 이 글자 모양을 Type 3 글꼴 수십 벌로 넣어, 글을 고르거나 찾기 어렵다.
// pdffonts(poppler)가 있으면 그것으로 글꼴 이름과 종류를 읽고, 없으면 PDF 의 글꼴 사전(/Subtype /Type3)을 글자로 찾는다.
// Chromium(Skia)이 찍은 PDF 는 글꼴 사전을 압축하지 않은 채 두므로 글자로 찾아도 빠뜨리지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** PDF 파일에 든 Type 3 글꼴의 이름 목록. 없으면 빈 배열이다. */
export function type3Fonts(file: string): string[] {
  const r = spawnSync('pdffonts', [file], { encoding: 'utf8' });
  if (!r.error && r.status === 0) {
    // 머리 두 줄(이름표와 ----) 뒤로 한 줄에 글꼴 하나. 종류 칸에 "Type 3" 이 적힌다.
    return r.stdout.split('\n').slice(2).filter((line) => /\sType 3\s/.test(line)).map((line) => line.split(/\s+/)[0]);
  }
  const raw = fs.readFileSync(file).toString('latin1');
  return [...raw.matchAll(/\/Subtype\s*\/Type3\b/g)].map((_, i) => `Type3#${i + 1}`);
}
