// 지문: 검수 기록이 '무엇을' 검수했는지 묶어 두는 값.
// 내용이 한 글자라도 바뀌면 지문이 달라지고, 옛 지문이 적힌 기록은 없는 것으로 친다.
// 그래서 검수한 뒤에 문장이나 그림을 고치면 그 검수를 다시 받아야 공개할 수 있다.
//
// 지문은 값만 본다. YAML 의 주석, 따옴표, 칸의 차례, 줄 끝(LF·CRLF)은 지문에 들지 않는다 (docs/CONTRACT.md 12·13절).
// 값은 형식이 읽은 값이다. 형식이 같은 값으로 읽는 것(1392 와 "1392", 한 줄 글과 여러 줄 글)은 지문도 같다.
// 지문은 손으로 적지 않는다. `npm run sign` 과 `npm run check:originality` 가 lib/content.ts 의 sealsOf()·registrySeal() 로 얻어 적는다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hash = (s: string | Uint8Array) =>
  createHash('sha256').update(typeof s === 'string' ? s.normalize('NFC') : s).digest('hex').slice(0, 12);

// 칸의 순서가 달라도 같은 지문이 나오게 한다.
// 적는 꼴만 다른 값도 같은 지문이 나오게 한다:
//  - 숫자는 글로 바꿔 넣는다. YAML 은 따옴표 없는 1392 를 숫자로, "1392" 를 글로 읽지만 형식은 둘을 같은 글로 받는다 (연도, 정답, 표의 칸).
//  - 글은 앞뒤 빈칸과 줄바꿈을 뗀다. 여러 줄 글(|)로 바꿔 적으면 끝에 줄바꿈이 붙지만 형식은 떼고 받는다.
// lib/content.ts 는 여기에 형식이 읽은 값을 넘긴다 (sealsOf). 이 두 가지는 YAML 을 읽은 그대로의 값으로 lessonSeal() 을 불러도 같은 지문이 나오게 한다.
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : x));

// 글 파일(SVG, 전개도 모듈)은 줄 끝을 LF 로 맞춘 뒤에 지문을 낸다.
// Windows 의 Git 은 기본 설정으로 글 파일을 CRLF 로 꺼내 놓는다. 그대로 두면 같은 커밋의 지문이 컴퓨터마다 달라져서,
// 한쪽에서 적은 검수 기록이 다른 쪽에서는 '내용이 바뀐 것'으로 읽힌다. (.gitattributes 도 줄 끝을 LF 로 둔다.)
const TEXT_FILE = /\.(?:svg|ts)$/;
const fileBytes = (file: string): Uint8Array => {
  const bytes = fs.readFileSync(file);
  // latin1 은 바이트를 그대로 글자로 옮기므로 CRLF 말고는 한 바이트도 바뀌지 않는다
  return TEXT_FILE.test(file) ? Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : bytes;
};

/** 파일 내용의 지문. 파일이 없으면 빈 글. 글 파일(svg·ts)은 줄 끝이 CRLF 여도 LF 일 때와 같은 지문이 나온다. */
export const fileSeal = (file: string): string => (fs.existsSync(file) ? hash(fileBytes(file)) : '');

/** 사실 하나의 지문: 문장과 출처 주소. 다른 사실이나 문장을 고쳐도 이 지문은 그대로다. */
export function factSeal(f: { claim: unknown; sources?: { url?: unknown }[] | null }): string {
  const urls = (f.sources ?? []).map((s) => String(s?.url ?? '')).sort();
  return hash(String(f.claim ?? '').trim() + '\n' + urls.join('\n'));
}

/** 명세 파일 밖에 있지만 명세의 지문에 들어가는 것. lib/content.ts 가 모아서 넘긴다. */
export interface SealExtra {
  /** 같은 단원 앞 묶음에서 빌려 온 것: 사실의 지문, 그림(권리 정보와 파일 내용), 단원 덱에 모은 카드. 차례가 정해진 목록이어야 한다. */
  borrowed?: unknown[];
  /** 명세 밖에 있지만 이 차시의 내용인 파일 (전개도 모듈). 절대 경로 */
  files?: string[];
}

/**
 * 명세 전체의 지문.
 * raw 는 명세에 적은 칸만 담은 값(기본값을 채우기 전)이다. 형식에 기본값이 새로 생겨도 지문이 바뀌지 않게 하려는 것이다.
 * lib/content.ts 는 적은 칸마다 형식이 읽은 값을 넣어 넘긴다 (1392 → "1392", 따옴표 없는 묶음 id 01 → "01"). 적는 꼴만 바꾼 것은 지문을 바꾸지 않는다.
 * 빼는 것:
 *  - status·reviews·facts[].checks (검수 기록을 적는 일이 지문을 바꾸면 안 된다)
 *  - schema_version (내용이 아니라 형식의 판이다. 판만 올리는 옮김이 검수 기록을 모두 무효로 만들지 않게 한다)
 * dir 을 주면 media 파일의 내용도 넣는다 (검수 뒤에 그림 파일만 바꿔 끼우는 일을 잡는다).
 * extra 는 앞 묶음에서 빌려 온 것과 전개도 모듈 파일이다. 없는 묶음의 지문은 extra 를 주지 않은 것과 같다.
 */
export function lessonSeal(raw: unknown, dir?: string, extra: SealExtra = {}): string {
  const { status: _status, reviews: _reviews, schema_version: _version, ...rest } = (raw ?? {}) as Record<string, unknown>;
  const facts = Array.isArray(rest.facts) ? rest.facts.map((f) => { const { checks: _checks, ...keep } = (f ?? {}) as Record<string, unknown>; return keep; }) : rest.facts;
  const media = Array.isArray(rest.media) ? (rest.media as { id?: unknown; file?: unknown }[]) : [];
  const files = dir
    ? media
        .filter((m) => typeof m?.file === 'string' && fs.existsSync(path.join(dir, m.file)))
        .map((m) => [String(m.id), fileSeal(path.join(dir, m.file as string))])
    : [];
  const borrowed = extra.borrowed ?? [];
  const more = (extra.files ?? []).map((f) => [path.basename(f), fileSeal(f)]);
  return hash(stable({
    body: { ...rest, facts }, files,
    ...(borrowed.length ? { borrowed } : {}),
    ...(more.length ? { more } : {}),
  }));
}

/**
 * 차시표의 글의 지문: 학기 소개(blurb)와 묶음의 초점(focus)을 파일에 적힌 차례대로.
 * 단원명·쪽수·차시 번호는 교과서에서 가져오는 값이라 넣지 않는다. 베끼기 검사 기록(차시표의 originality)이 이 지문을 적는다.
 */
export function registrySeal(registry: { semesters: { blurb?: string; units: { bundles: { focus: string }[] }[] }[] }): string {
  const texts = registry.semesters.flatMap((s) => [s.blurb ?? '', ...s.units.flatMap((u) => u.bundles.map((b) => b.focus))]);
  return hash(stable(texts.map((t) => t.trim())));
}
