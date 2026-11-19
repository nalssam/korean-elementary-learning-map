// content/registry.yaml 형식: 학기 → 단원 → 차시 묶음 (차시표).
//
// 명세(lesson.yaml)가 아직 없는 묶음도 여기에는 올라 있어서, 사이트가 전체 차시표를 보여 줄 수 있다.
// 교과서에서 가져오는 것은 단원명·차시 번호·쪽수뿐이고, 그것은 이 파일에만 적는다.
// 같은 것을 두 번 적지 않는다: 차시 번호는 묶음 id 에서, 학년·학기는 학기 id 에서, 단원 쪽수는 묶음들의 쪽수에서 나온다.
import { z } from 'zod';
import { BundleId, DateStr, SchemaVersion, Seal, SemesterId, StandardCode, Text, lessonsOf } from './common.ts';

export const RegistryBundle = z.strictObject({
  /** "01" 또는 "03-04". 차시 번호가 여기에서 나온다. 폴더 이름이자 주소라서, 공개한 뒤에는 바꾸지 않는다. */
  id: BundleId,
  /** 교과서 쪽수 [시작, 끝]. 쪽수로 찾기와 안내 페이지에 쓴다. */
  pages: z.tuple([z.number().int().min(1), z.number().int().min(1)], { error: '쪽수는 [시작, 끝]처럼 숫자 두 개로 씁니다. 예: [6, 9]' }),
  /** 우리 말로 쓴 한 줄 초점 (계획 글). 교과서의 차시 제목을 옮겨 적지 않는다. 검수를 거치지 않으므로 사이트에는 찍지 않는다. */
  focus: Text,
  /**
   * intro 단원 도입 · content 내용 차시 · review 단원 정리.
   * review 묶음의 명세에 단원 카드 덱·단원 정리지를 적는다. 단원마다 review 는 하나까지다.
   */
  role: z.enum(['intro', 'content', 'review']).default('content'),
  /** 이 묶음이 특히 다루는 성취기준. 단원 것 가운데에서만 고른다. 비워 두면 단원의 성취기준을 그대로 보여 준다. */
  standards: z.array(StandardCode).default([]),
});

export const RegistryUnit = z.strictObject({
  /** 단원 번호. 1부터 차례대로 */
  no: z.number().int().min(1),
  /** 단원명 (교과서의 것) */
  title: Text,
  /** 이 단원의 성취기준. 단원과 성취기준의 짝만 확인되어 있어서 단원에 적는다. */
  standards: z.array(StandardCode, { error: '단원의 성취기준 코드를 하나 이상 적습니다. 예: ["6사04-01"]' })
    .min(1, '단원의 성취기준 코드를 하나 이상 적습니다. 예: ["6사04-01"]'),
  bundles: z.array(RegistryBundle).min(1),
});

export const RegistrySemester = z.strictObject({
  id: SemesterId,
  /** 한 줄 소개 (학기 타일에 쓴다). 사실을 말하는 문장이 아니라 무엇을 배우는 학기인지만 적는다. 차시표가 아직 없는 학기는 units 를 비워 둔다. */
  blurb: Text.optional(),
  units: z.array(RegistryUnit).default([]),
});

export const Registry = z.strictObject({
  schema_version: SchemaVersion,
  /** 교육과정 이름 (사이트 소개에 쓴다) */
  curriculum: Text,
  /** 차시 번호와 쪽수가 따르는 교과서 */
  textbook: z.strictObject({ publisher: Text, author: Text }),
  semesters: z.array(RegistrySemester).length(8, '3-1 부터 6-2 까지 여덟 학기를 모두 적습니다 (차시표가 없는 학기는 units: [])'),
  /**
   * 차시표의 글(blurb, focus)을 비공개 교과서 자료와 견준 베끼기 검사 기록. `npm run check:originality -- --registry --record` 가 적는다. 손으로 적지 않는다.
   * seal 이 지금 글과 다르면(검사한 뒤에 글을 고쳤으면) 없는 기록으로 친다 (lib/content.ts 의 registryOriginality).
   */
  originality: z.strictObject({
    by: z.string().regex(/^copy-guard@[0-9a-f]{8}$/, '이 기록은 손으로 적지 않습니다. npm run check:originality -- --registry --record 가 적습니다'),
    date: DateStr,
    seal: Seal,
  }).optional(),
}).superRefine((r, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  r.semesters.forEach((s, si) => {
    if (r.semesters.findIndex((x) => x.id === s.id) !== si) issue(['semesters', si, 'id'], `학기 id 가 겹칩니다: ${s.id}`);
    // 3~4학년은 4사…, 5~6학년은 6사… 코드를 쓴다
    const band = Number(s.id[0]) <= 4 ? '4사' : '6사';
    let lastPage = 0;
    s.units.forEach((u, ui) => {
      const at = ['semesters', si, 'units', ui];
      if (u.no !== ui + 1) issue([...at, 'no'], `단원 번호는 1부터 차례대로 씁니다 (여기는 ${ui + 1})`);
      u.standards.forEach((c, ci) => {
        if (!c.startsWith(band)) issue([...at, 'standards', ci], `${s.id} 학기의 성취기준은 "${band}"로 시작합니다`);
        if (u.standards.indexOf(c) !== ci) issue([...at, 'standards', ci], `성취기준이 겹칩니다: ${c}`);
      });
      let nextLesson = 1;
      let reviews = 0;
      u.bundles.forEach((b, bi) => {
        const bat = [...at, 'bundles', bi];
        const ls = lessonsOf(b.id);
        if (ls.length && ls[0] !== nextLesson) issue([...bat, 'id'], `차시 번호가 이어지지 않습니다. ${nextLesson}차시로 시작하는 묶음이 올 자리입니다`);
        if (ls.length) nextLesson = ls[ls.length - 1] + 1;
        if (b.pages[0] > b.pages[1]) issue([...bat, 'pages'], '쪽수는 [시작, 끝] 순서로 씁니다');
        else if (b.pages[0] < lastPage) issue([...bat, 'pages'], `쪽수가 앞 묶음(${lastPage}쪽까지)보다 앞에서 시작합니다`);
        lastPage = Math.max(lastPage, b.pages[1]);
        if (b.role === 'review' && ++reviews > 1) issue([...bat, 'role'], '단원마다 review 묶음은 하나까지입니다');
        b.standards.forEach((c, ci) => {
          if (!u.standards.includes(c)) issue([...bat, 'standards', ci], `단원의 성취기준(${u.standards.join(', ')}) 가운데에서 고릅니다`);
        });
      });
    });
  });
});
export type Registry = z.infer<typeof Registry>;
export type RegistrySemester = z.infer<typeof RegistrySemester>;
export type RegistryUnit = z.infer<typeof RegistryUnit>;
export type RegistryBundle = z.infer<typeof RegistryBundle>;
