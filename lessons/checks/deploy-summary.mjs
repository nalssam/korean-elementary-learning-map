// 배포 요약 (docs/CONTRACT.md 12절). 배포 워크플로가 production 승인을 받기 전에 찍는다.
//
//   node checks/deploy-summary.mjs [--out <폴더>] [--current <주소 또는 파일>]
//
// 지금 사이트의 /published.json 과 새로 빌드한 /published.json 을 견주어, 이번에 새로 공개되는 묶음과 사이트에서 빠지는 묶음을 적는다.
// 둘 다 묶음 id 의 JSON 배열이다 (3절). --current 를 주지 않으면 SITE_URL + SITE_BASE 의 /published.json 을 읽는다.
// 사이트에서 빠지는 묶음은 종이에 박힌 QR 주소가 사라진다는 뜻이라 맨 위에 적는다. 마크다운을 표준 출력에 찍는다 ($GITHUB_STEP_SUMMARY 에 붙인다).
// 지금 사이트를 읽지 못해도(네트워크 오류, 404 가 아닌 HTTP 오류) 배포를 막지 않는다. 견주지 못했다는 줄과 새로 공개할 묶음 전부를 적고 0 으로 끝난다.
// 승인자가 그 줄을 보고 빠지는 묶음이 없는지 직접 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { UsageError, parseArgs } from './lib.mjs';

/** published.json 의 값이 묶음 id 의 배열인지 보고 돌려준다 */
function idsOf(text, where) {
  const v = JSON.parse(text);
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${where} 가 묶음 id 의 배열이 아닙니다`);
  return v;
}

/** 주소를 읽지 못했을 때 (요약에 까닭을 적고 배포는 이어 간다) */
export class Unreachable extends Error {}

async function readCurrent(source) {
  if (!/^https?:\/\//.test(source)) return idsOf(fs.readFileSync(source, 'utf8'), source);
  let res;
  try {
    res = await fetch(source, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Unreachable(`접속하지 못했습니다: ${e.cause?.code ?? e.cause?.message ?? e.message}`);
  }
  if (res.status === 404) return undefined; // 아직 배포한 적이 없다
  if (!res.ok) throw new Unreachable(`HTTP ${res.status}`);
  return idsOf(await res.text(), source);
}

const label = (id) => {
  const b = c.findBundle(id);
  return b ? `\`${id}\` ${c.semesterLabel(b.semester.id)} ${b.unit.no}단원 ${c.lessonsLabel(b.lessons)}` : `\`${id}\` (차시표에 없는 묶음)`;
};

/** 요약 마크다운. before 가 undefined 면 첫 배포다. unreachable(까닭)을 주면 지금 사이트를 읽지 못한 것이라 견주지 않고 이번 빌드의 공개 묶음만 적는다. */
export function summary(before, after, unreachable) {
  const was = new Set(before ?? []), now = new Set(after);
  const added = after.filter((id) => !was.has(id));
  const removed = (before ?? []).filter((id) => !now.has(id));
  const lines = ['## 배포 요약', ''];
  if (unreachable) lines.push(`지금 사이트의 \`/published.json\` 을 읽지 못해 견주지 못했습니다 (${unreachable}). 사이트에서 빠지는 묶음이 있는지 알 수 없으니, 승인하기 전에 지금 사이트와 아래 목록을 직접 견줍니다.`, '');
  else if (before === undefined) lines.push('지금 사이트에 `/published.json` 이 없습니다. 첫 배포로 봅니다.', '');
  if (removed.length) {
    lines.push(`### 사이트에서 빠지는 묶음 ${removed.length}개`, '', '종이에 박힌 QR 주소가 열리지 않게 됩니다. 고치는 중이라 draft 로 되돌린 것이면 다시 공개한 뒤에 배포합니다.', '');
    for (const id of removed) lines.push(`- ${label(id)}`);
    lines.push('');
  }
  if (unreachable) {
    lines.push(`### 이번 빌드에 실린 공개 묶음 ${after.length}개`, '');
    if (after.length) for (const id of after) lines.push(`- ${label(id)}`);
    else lines.push('없음');
    return lines.join('\n') + '\n';
  }
  lines.push(`### 새로 공개되는 묶음 ${added.length}개`, '');
  if (added.length) for (const id of added) lines.push(`- ${label(id)}`);
  else lines.push('없음');
  lines.push('', `공개된 묶음은 모두 ${after.length}개입니다 (그대로인 것 ${after.length - added.length}개).`);
  return lines.join('\n') + '\n';
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2), { flags: ['--out', '--current'] }); } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n쓰는 법: node checks/deploy-summary.mjs [--out <폴더>] [--current <주소 또는 파일>]`); return 2; }
    throw e;
  }
  const built = path.join(c.distDir(), 'published.json');
  if (!fs.existsSync(built)) { console.error(`새로 빌드한 ${built} 가 없습니다. npm run build 를 먼저 돌립니다`); return 1; }
  const after = idsOf(fs.readFileSync(built, 'utf8'), built);
  let source = args.flags['--current'];
  if (!source) {
    if (!process.env.SITE_URL) { console.error('SITE_URL 이 없어 지금 사이트를 읽을 수 없습니다. --current 로 주소나 파일을 줍니다'); return 1; }
    const base = (process.env.SITE_BASE ?? '').replace(/^\/*/, '/').replace(/\/+$/, '');
    source = new URL(`${base}/published.json`, process.env.SITE_URL).href;
  }
  try {
    process.stdout.write(summary(await readCurrent(source), after));
  } catch (e) {
    if (!(e instanceof Unreachable)) throw e;
    // 견주지 못한 것은 배포를 막을 까닭이 아니다 (빠지는 묶음은 승인자가 본다). 알림 한 줄을 CI 기록에도 남긴다.
    console.error(`지금 사이트(${source})를 읽지 못해 배포 요약에서 견주기를 건너뜁니다 (${e.message})`);
    process.stdout.write(summary(undefined, after, e.message));
  }
  return 0;
}

if (import.meta.main) process.exitCode = await main();
