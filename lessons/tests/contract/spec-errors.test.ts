// 통과하면 안 되는 명세와 그때 교사가 읽게 되는 한국어 문구.
// 검토 때 "말없이 통과하던 실수"들을 하나씩 시험으로 묶어 둔 것이다. 명세 하나만 보고 알 수 있는 것들이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLessonText } from '#lib/content.ts';
import { failsWith, fixtureRaw, fixtureText, toYaml } from './helpers.ts';

type Raw = Record<string, any>;
const ONE = '5-2/1/01', TWO = '5-2/1/02-03', HEAVY = '5-2/1/04', REVIEW = '5-2/1/05';

/** 시험용 명세를 고친 뒤 형식 검사에 넣는다 */
const mutated = (id: string, change: (l: Raw) => void) => () => { const raw = fixtureRaw(id); change(raw); return parseLessonText(toYaml(raw), id); };
const passes = (id: string, change: (l: Raw) => void) => assert.doesNotThrow(mutated(id, change));

const photo = (over: Raw = {}): Raw => ({
  id: 'photo', kind: 'photo', file: 'media/photo.jpg', alt: '시험용 사진',
  credit: { holder: '시험용 박물관', title: '시험용 유물', source_url: 'https://example.org/item/9', licence: 'KOGL-1', checked: '2026-11-18' },
  ...over,
});

/** 수업 화면을 n 장으로 늘린다 (마지막 단계가 늘어난 장을 쓴다) */
const moreSlides = (l: Raw, n: number) => {
  while (l.slides.length < n) l.slides.push({ layout: 'closing', title: '더한 장' });
  const last = l.flow.findLast((s: Raw) => s.slides);
  last.slides = [last.slides[0], n];
};
/** 피해를 담은 사실 f3 과, 그것을 그린 그림 harm 을 더한다 (care 차시) */
const harm = (l: Raw) => {
  l.facts.push({ id: 'f3', claim: '시험용 규칙 때문에 사람들이 어려움을 겪었다.', painful: true });
  l.media.push({ id: 'harm', kind: 'drawing', file: 'media/harm.svg', alt: '시험용 그림', credit: { holder: '시험용 그린이', licence: 'original' }, facts: ['f3'] });
};

const papercraft = (print: Raw): Raw => ({ state: 'ready', title: '시험용 만들기', module: 'test-shape', pages: 2, print, steps: ['자릅니다.', '붙입니다.'] });
const scene = { kind: 'drawing', ai_generated: true, factual: false, credit: { holder: '몽당분필 날쌤', licence: 'original' } };

const cases: [string, string, (l: Raw) => void, string[]][] = [
  // ── 오타와 틀린 값 ──
  ['오타 난 칸 이름은 버려지지 않는다 (captoin)', ONE, (l) => { l.media[0].captoin = '오타'; }, ['media · 1번째', '모르는 칸 이름입니다: captoin']],
  ['오타 난 칸 이름 (tips, listen-for)', ONE, (l) => { l.flow[1].tips = 'x'; l.flow[0].ask[0]['listen-for'] = 'x'; }, ['모르는 칸 이름입니다: tips', '모르는 칸 이름입니다: listen-for']],
  ['다른 장에만 쓰는 칸 (question 장의 subtitle)', TWO, (l) => { l.slides[1].subtitle = 'x'; }, ['slides · 2번째', '모르는 칸 이름입니다: subtitle']],
  ['맨 위의 오타 (teacher_note)', ONE, (l) => { l.teacher_note = []; }, ['(맨 위)', '모르는 칸 이름입니다: teacher_note']],
  ['차시표로 옮긴 칸을 명세에 적으면 알려 준다', ONE, (l) => { l.lessons = [1]; l.pages = [6, 9]; l.standards = ['6사04-01']; l.minutes = 40; }, ['모르는 칸 이름입니다: lessons, pages, standards, minutes']],
  ['phase 는 도입·전개·정리', ONE, (l) => { l.flow[0].phase = '도입부'; }, ['flow · 1번째 · phase', '쓸 수 없는 값입니다 (지금: "도입부")', '쓸 수 있는 값: 도입, 전개, 정리']],
  ['status 는 draft·published 둘뿐', ONE, (l) => { l.status = '초안'; }, ['status', '쓸 수 있는 값: draft, published']],
  ['옛 상태 값 (approved, qa_passed)', ONE, (l) => { l.status = 'qa_passed'; }, ['쓸 수 있는 값: draft, published']],
  ['모르는 장 종류', ONE, (l) => { l.slides[4].layout = 'summary'; }, ['slides · 5번째 · layout', '쓸 수 있는 값: title, question, picture']],
  ['모르는 자료 상태', ONE, (l) => { l.assets.cards.state = 'done'; }, ['assets · cards · state', '쓸 수 있는 값: skip, planned, ready']],
  ['선택 자료를 빠뜨림', ONE, (l) => { delete l.assets.virtual3d; }, ['assets · virtual3d', '꼭 있어야 하는 칸이 빠졌습니다']],
  ['필수 칸을 빠뜨림', ONE, (l) => { delete l.tagline; }, ['tagline: 꼭 있어야 하는 칸이 빠졌습니다']],
  ['값 없는 칸', ONE, (l) => { l.flow[1].tip = null; }, ['flow · 2번째 · tip', '칸 이름만 있고 값이 없습니다']],
  ['OX 의 답은 true·false', ONE, (l) => { l.quiz.items[0].answer = 'X'; }, ['quiz · items · 1번째 · answer', 'true 또는 false 를 씁니다 (지금: "X")']],
  ['고르기의 답은 1부터', ONE, (l) => { l.quiz.items[1].answer = 0; }, ['quiz · items · 2번째 · answer: 보기가 3개이므로 1~3 가운데 하나를 적습니다 (지금: 0)']],
  ['고르기의 답이 보기 수를 넘음', ONE, (l) => { l.quiz.items[1].answer = 4; }, ['quiz · items · 2번째 · answer: 보기가 3개이므로 1~3 가운데 하나를 적습니다 (지금: 4)']],
  ['날짜 형식', ONE, (l) => { l.facts[0].sources[0].accessed = '2026년 11월 18일'; }, ['accessed', '날짜는 "2026-11-18"처럼 씁니다']],
  ['달력에 없는 날짜', ONE, (l) => { l.facts[0].sources[0].accessed = '2026-13-45'; }, ['달력에 없는 날짜입니다']],
  ['schema_version 이 다름', ONE, (l) => { l.schema_version = 2; }, ['schema_version: 이 칸에는 1 을 적습니다', 'scripts/migrate/']],
  ['schema_version 을 빠뜨림', ONE, (l) => { delete l.schema_version; }, ['schema_version: 이 칸에는 1 을 적습니다 (schema_version: 1)']],
  ['id 꼴', ONE, (l) => { l.id = '5-2/1/1'; }, ['"5-2/1/01"처럼 학기/단원/묶음으로 씁니다']],
  ['누르면 위험한 주소 (javascript:)', ONE, (l) => { l.facts[0].sources[0].url = 'javascript:alert(document.domain)'; }, ['url', 'https:// 로 시작하는 웹 주소를 씁니다']],
  ['웹 주소가 아닌 출처 (textbook:8)', ONE, (l) => { l.facts[0].sources[0].url = 'textbook:8'; }, ['https:// 로 시작하는 웹 주소를 씁니다']],
  // "@" 앞은 이름·암호 자리다. 박물관 주소처럼 읽히지만 실제로 열리는 곳은 "@" 뒤다 (막는 곳 검사도 "@" 뒤만 본다).
  ['주소의 "@" 앞에 다른 곳의 이름을 붙임', ONE, (l) => { l.facts[0].sources[0].url = 'https://www.museum.go.kr@evil.example/x'; }, ['facts · 1번째 · sources · 1번째 · url', '주소의 "@" 앞부분(이름·암호)을 지웁니다. "@" 뒤가 실제로 열리는 곳입니다']],
  ['그림 출처 주소의 "@" 앞에 이름과 암호', TWO, (l) => { l.media[1].credit.source_url = 'https://user:pw@example.org/item/1'; }, ['media · 2번째 · credit · source_url', '주소의 "@" 앞부분(이름·암호)을 지웁니다']],
  ['값 없는 선택 칸 (status:)', ONE, (l) => { l.status = null; }, ['status: 칸 이름만 있고 값이 없습니다. 쓸 수 있는 값: draft, published']],
  ['값 없는 선택 칸 (layout:)', ONE, (l) => { l.slides[4].layout = null; }, ['slides · 5번째 · layout: 칸 이름만 있고 값이 없습니다. 쓸 수 있는 값: title, question, picture']],

  // ── 글자 수 ──
  ['수업 화면 제목은 30자까지', ONE, (l) => { l.slides[0].title = '가'.repeat(31); }, ['slides · 1번째 · title', '30자까지만 씁니다 (지금 31자)']],
  ['수업 화면 항목은 40자까지', TWO, (l) => { l.slides[3].points[0] = '가'.repeat(41); }, ['40자까지만 씁니다 (지금 41자)']],
  ['카드 앞면은 14자까지', ONE, (l) => { l.assets.cards.cards[1].front = '가'.repeat(15); }, ['14자까지만 씁니다']],
  ['빈 글', ONE, (l) => { l.objectives[0] = '   '; }, ['objectives · 1번째', '빈 글은 쓸 수 없습니다']],
  ['항목 수', TWO, (l) => { l.slides[3].points = ['하나']; }, ['2개 이상 적습니다 (지금 1개)']],
  ['목표는 셋까지', ONE, (l) => { l.objectives = ['가', '나', '다', '라']; }, ['3개까지만 적습니다 (지금 4개)']],

  // ── 흐름과 차시 ──
  ['차시의 시간 합은 40분', ONE, (l) => { l.flow[1].minutes = 32; }, ['1차시 흐름의 시간 합이 42분입니다', '40분']],
  ['도입 → 전개 → 정리 순서', ONE, (l) => { l.flow[2].phase = '도입'; }, ['flow · 3번째 · phase', '차시 안에서 도입 → 전개 → 정리 순서로 적습니다']],
  ['두 차시 묶음에서는 단계마다 lesson', TWO, (l) => { delete l.flow[3].lesson; }, ['flow · 4번째 · lesson', '두 차시 묶음에서는 단계마다 몇 차시인지 적습니다', '2, 3차시']],
  ['묶음에 없는 차시', TWO, (l) => { l.flow[5].lesson = 4; }, ['이 묶음에 없는 차시입니다: 4']],
  ['차시 순서', TWO, (l) => { l.flow[4].lesson = 2; }, ['단계를 차시 순서대로 적습니다']],
  ['두 차시 가운데 한 차시만 40분', TWO, (l) => { l.flow[4].minutes = 20; }, ['3차시 흐름의 시간 합이 35분입니다']],
  ['한 차시 묶음에 두 차시 분량', ONE, (l) => { l.flow.push({ ...l.flow[0], slides: undefined }, { ...l.flow[2], slides: undefined }); }, ['1차시 흐름의 시간 합이 50분입니다']],
  ['퀴즈 문항의 차시', TWO, (l) => { l.quiz.items[0].lesson = 9; }, ['quiz · items · 1번째 · lesson', '이 묶음에 없는 차시입니다: 9']],
  ['문항의 차시가 그 문항을 띄우는 장의 차시와 다름', TWO, (l) => { l.quiz.items[2].lesson = 2; }, ['quiz · items · 3번째 · lesson', '3번 문항은 3차시의 수업 화면(7번 장)에서 띄웁니다. 문항에 lesson: 3 을 적습니다']],
  ['lesson 을 적지 않은 문항을 앞 차시의 장에서 띄움', TWO, (l) => { l.slides[3] = { layout: 'quiz', item: 4 }; }, ['quiz · items · 4번째', '4번 문항은 2차시의 수업 화면(4번 장)에서 띄웁니다. 문항에 lesson: 2 을 적습니다']],
  // 두 차시 묶음에서 0번·음수 문항은 한국어 문구 대신 TypeError 로 사이트 전체의 빌드를 멈추고 있었다
  ['퀴즈 장이 0번 문항을 가리킴 (두 차시 묶음)', TWO, (l) => { l.slides[6].item = 0; }, ['slides · 7번째 · item: 1 이상이어야 합니다 (지금: 0)']],
  ['퀴즈 장이 음수 문항을 가리킴 (두 차시 묶음)', TWO, (l) => { l.slides[6].item = -2; }, ['slides · 7번째 · item: 1 이상이어야 합니다 (지금: -2)']],
  ['퀴즈 장이 0번 문항을 가리킴 (한 차시 묶음)', ONE, (l) => { l.slides[3].item = 0; }, ['slides · 4번째 · item: 1 이상이어야 합니다 (지금: 0)']],
  ['같은 문항을 두 차시의 수업 화면에서 띄움', TWO, (l) => { l.slides[3] = { layout: 'quiz', item: 3 }; }, ['quiz · items · 3번째: 3번 문항을 2차시와 3차시의 수업 화면에서 모두 띄웁니다. 한 문항은 한 차시에서만 띄웁니다. 다시 물을 문항은 quiz.items 에 따로 적습니다']],
  ['수업 화면은 한 차시에 24장까지 (한 차시 묶음)', ONE, (l) => { moreSlides(l, 25); }, ['slides: 수업 화면은 한 차시에 24장까지입니다 (이 묶음은 1차시라 24장까지, 지금 25장). 장을 줄이거나 합칩니다']],
  ['수업 화면은 한 차시에 24장까지 (두 차시 묶음은 48장)', TWO, (l) => { moreSlides(l, 49); }, ['이 묶음은 2차시라 48장까지, 지금 49장']],
  ['수업 화면 범위는 [첫 장, 끝 장]', ONE, (l) => { l.flow[0].slides = '1-2'; }, ['flow · 1번째 · slides', '[첫 장, 끝 장]처럼 숫자 두 개를 씁니다']],
  ['수업 화면 범위에 숫자 하나', ONE, (l) => { l.flow[1].slides = 3; }, ['[첫 장, 끝 장]처럼 숫자 두 개를 씁니다']],
  ['수업 화면 범위가 겹침', ONE, (l) => { l.flow[1].slides = [2, 3]; }, ['수업 화면 범위 [2, 3] 가 맞지 않습니다', '3번 장부터 이어져야']],
  ['수업 화면 범위에 빈틈', ONE, (l) => { l.flow[2].slides = [5, 5]; }, ['수업 화면 범위 [5, 5] 가 맞지 않습니다', '4번 장부터']],
  ['수업 화면 범위가 전체를 넘음', ONE, (l) => { l.flow[2].slides = [4, 9]; }, ['전체는 5장입니다']],
  ['쓰이지 않는 수업 화면', ONE, (l) => { l.flow[2].slides = [4, 4]; }, ['수업 화면 5번부터 5번 장을 쓰는 단계가 없습니다']],
  ['만들지 않은 자료를 흐름에서 씀', ONE, (l) => { l.flow[1].uses.push('papercraft'); }, ['flow · 2번째 · uses', 'papercraft 는 아직 만들지 않았습니다']],
  ['없는 자료 종류 (video)', ONE, (l) => { l.flow[0].uses.push('video'); }, ['쓸 수 없는 값입니다 (지금: "video")']],

  // ── 가리키는 것 ──
  ['없는 사실 id', ONE, (l) => { l.flow[0].facts = ['f9']; }, ['flow · 1번째 · facts · 1번째', '없는 사실 id 입니다: f9']],
  ['사실 id 꼴', ONE, (l) => { l.quiz.items[0].facts = ['fact1']; }, ['facts 에 적은 id 를 씁니다. 예: f3']],
  ['없는 그림 id', ONE, (l) => { l.slides[1].media = 'nope'; }, ['slides · 2번째 · media', '없는 그림 id 입니다: nope']],
  ['없는 읽기 자료 id (수업 화면)', TWO, (l) => { l.slides[2].passage = 'nope'; }, ['없는 읽기 자료 id 입니다: nope']],
  ['없는 읽기 자료 id (학습지)', TWO, (l) => { l.worksheet.pages[0].blocks[0].passage = 'nope'; }, ['worksheet · pages · 1번째 · blocks · 1번째 · passage', '없는 읽기 자료 id 입니다: nope']],
  ['수업 화면에 싣는 읽기 자료는 모두 300자까지', TWO, (l) => { l.passages[0].text = Array(4).fill('가'.repeat(80)); }, ['slides · 3번째 · passage', '수업 화면 한 장에는 문단 4개, 모두 300자까지 들어갑니다 (지금 4개, 320자)', '둘로 나누어 두 장에 싣습니다']],
  ['수업 화면에 싣는 읽기 자료는 문단 4개까지', TWO, (l) => { l.passages[0].text = Array(5).fill('짧은 문단입니다.'); }, ['지금 5개, 45자']],
  ['퀴즈 장이 없는 문항을 가리킴', ONE, (l) => { l.slides[3].item = 7; }, ['퀴즈 문항 7번이 없습니다 (문항은 3개)']],
  ['학습지 퀴즈 블록이 없는 문항을 가리킴', TWO, (l) => { l.worksheet.pages[1].blocks[3].items = [1, 9]; }, ['퀴즈 문항 9번이 없습니다']],
  ['분류하기의 없는 상자', ONE, (l) => { l.assets.web_activity.activity.items[0].bin = 'nope'; }, ['없는 상자 id 입니다: nope']],
  ['겹치는 id', ONE, (l) => { l.facts[1].id = 'f1'; }, ['사실 id 가 겹칩니다: f1']],
  ['겹치는 낱말', HEAVY, (l) => { l.terms.new[1].term = '규칙 하나'; }, ['낱말이 겹칩니다: 규칙 하나']],

  // ── 사실을 가리켜야 하는 글 ──
  ['퀴즈 문항은 사실을 가리킨다', ONE, (l) => { delete l.quiz.items[0].facts; }, ['quiz · items · 1번째 · facts', '근거가 되는 사실 id 를 facts 에 하나 이상 적습니다']],
  ['퀴즈 문항의 옛 칸 이름 fact', ONE, (l) => { l.quiz.items[0].fact = 'f1'; }, ['모르는 칸 이름입니다: fact']],
  ['카드는 사실을 가리킨다', ONE, (l) => { l.assets.cards.cards[1].facts = []; }, ['assets · cards · cards · 2번째 · facts', '근거가 되는 사실 id 를 facts 에 하나 이상 적습니다']],
  ['낱말 풀이는 사실을 가리킨다', ONE, (l) => { delete l.terms.new[0].facts; }, ['terms · new · 1번째 · facts', '근거가 되는 사실 id']],
  ['낱말 장의 낱말은 terms.new 에 있어야 한다', ONE, (l) => { l.slides[2].term = '고인돌'; }, ['terms.new 에 "고인돌" 이 없습니다']],
  ['낱말 장에 풀이를 다시 적지 않는다', ONE, (l) => { l.slides[2].meaning = '다른 풀이'; }, ['모르는 칸 이름입니다: meaning']],
  ['뒷면 없는 카드의 앞면은 terms.new 에 있어야 한다', ONE, (l) => { delete l.assets.cards.cards[1].back; }, ['뒷면(back)을 적거나, terms.new 에 "바위" 을 넣어']],
  ['첫 장은 표지', ONE, (l) => { l.slides.shift(); l.flow[0].slides = [1, 1]; l.flow[1].slides = [2, 2]; l.flow[2].slides = [3, 4]; }, ['slides · 1번째 · layout', '첫 장은 표지(layout: title)로 씁니다']],
  ['표지가 첫 장이 아닌 자리에만 있음', ONE, (l) => { [l.slides[0], l.slides[2]] = [l.slides[2], l.slides[0]]; }, ['slides · 1번째 · layout', '수업 화면의 AI 사용 표시와 초안 표시가 표지에 찍힙니다']],

  // ── 학습지 ──
  ['문장 틀에 빈칸이 없음', ONE, (l) => { l.worksheet.pages[0].blocks[4].frame = '나는 보았다.'; }, ['빈칸을 밑줄 세 개(___)로 적습니다']],
  ['밑줄 두 개는 빈칸이 아니다', ONE, (l) => { l.worksheet.pages[0].blocks[4].frame = '나는 __을 보았다.'; }, ['빈칸을 밑줄 세 개(___)로 적습니다']],
  ['표의 칸 수', TWO, (l) => { l.worksheet.pages[0].blocks[2].rows[0].push('하나 더'); }, ['줄마다 칸 수가 columns 와 같아야 합니다']],
  ['옛 블록 이름 (observe-infer)', TWO, (l) => { l.worksheet.pages[0].blocks[3].type = 'observe-infer'; }, ['쓸 수 없는 값입니다 (지금: "observe-infer")', 'observe_infer']],
  ['없앤 블록 (choices)', ONE, (l) => { l.worksheet.pages[0].blocks.push({ type: 'choices', q: 'x', options: ['a', 'b'] }); }, ['쓸 수 없는 값입니다 (지금: "choices")']],
  ['선 잇기는 짝으로 적는다', TWO, (l) => { l.worksheet.pages[1].blocks[1] = { type: 'match', left: ['가', '나'], right: ['다', '라', '마'] }; }, ['pairs', '모르는 칸 이름입니다: left, right']],
  ['연표의 옛 칸 이름 label', TWO, (l) => { l.worksheet.pages[1].blocks[0].points[0] = { label: '1392' }; }, ['모르는 칸 이름입니다: label']],
  ['보기 블록은 text 와 parts 가운데 하나만', ONE, (l) => { l.worksheet.pages[0].blocks[1].text = '돌이 쌓여 있다.'; }, ['worksheet · pages · 1번째 · blocks · 2번째', 'text 와 parts 가운데 하나만 적습니다']],
  ['보기 블록에 text 도 parts 도 없음', ONE, (l) => { delete l.worksheet.pages[0].blocks[1].parts; }, ['text 와 parts 가운데 하나만 적습니다']],
  ['보기 블록의 칸이 하나뿐', ONE, (l) => { l.worksheet.pages[0].blocks[1].parts.splice(1); }, ['parts', '칸은 2~4개 적습니다. 한 칸뿐이면 parts 대신 text 에 한 문장으로 적습니다']],
  ['보기 블록의 칸은 넷까지', ONE, (l) => { const p = l.worksheet.pages[0].blocks[1].parts; p.push(p[0], p[1]); }, ['칸은 4개까지 적습니다']],
  ['보기 블록의 칸에는 이름표가 있다', ONE, (l) => { delete l.worksheet.pages[0].blocks[1].parts[0].label; }, ['parts · 1번째 · label: 꼭 있어야 하는 칸이 빠졌습니다']],
  ['단은 넷까지', TWO, (l) => { const cols = l.worksheet.pages[1].blocks[2].columns; cols.push(cols[0]); }, ['4개까지만 적습니다 (지금 5개)']],
  ['인쇄 쪽수는 적지 않는다', ONE, (l) => { l.worksheet.print.pages = 1; }, ['worksheet · print', '모르는 칸 이름입니다: pages']],

  // ── 선택 자료 ──
  ['방탈출은 아직 skip·planned 만', ONE, (l) => { l.assets.escape = { state: 'ready', title: '방', minutes: 10, puzzles: [1, 2] }; }, ['assets · escape', '방탈출은 아직 state 를 skip 이나 planned 로만 적습니다']],
  ['3D 는 아직 skip·planned 만', ONE, (l) => { l.assets.virtual3d = { state: 'ready', title: 'x', url: 'https://example.org', how: ['x'] }; }, ['3D·가상 체험은 아직 state 를 skip 이나 planned 로만 적습니다']],
  ['skip 에는 까닭', ONE, (l) => { delete l.assets.papercraft.reason; }, ['assets · papercraft · reason', '꼭 있어야 하는 칸이 빠졌습니다']],
  ['카드는 4장 이상', ONE, (l) => { l.assets.cards.cards.length = 3; }, ['카드는 4장 이상 적습니다']],
  ['카드는 늘 양면', ONE, (l) => { l.assets.cards.print = { per: 'group', sides: 'single' }; }, ['카드는 늘 양면으로 찍습니다']],
  ['카드는 늘 세로', TWO, (l) => { l.assets.cards.print.orientation = 'landscape'; }, ['카드는 늘 A4 세로로 찍습니다']],
  ['앞면이 같은 카드', ONE, (l) => { l.assets.cards.cards[2].front = '바위'; }, ['앞면이 같은 카드가 있습니다: 바위']],
  ['이 묶음의 카드를 collect 에 적음', REVIEW, (l) => { l.assets.cards.collect[0].bundles.push('05'); }, ['collect 에는 앞 묶음만 적습니다']],
  ['같은 묶음을 두 번 모음', REVIEW, (l) => { l.assets.cards.collect[1].bundles.push('01'); }, ['같은 묶음을 두 번 모았습니다: 01']],
  ['페이퍼크래프트는 늘 세로', ONE, (l) => { l.assets.papercraft = papercraft({ per: 'group', orientation: 'landscape' }); }, ['assets · papercraft · print · orientation', '페이퍼크래프트는 늘 A4 세로로 찍습니다']],
  ['페이퍼크래프트는 늘 단면', ONE, (l) => { l.assets.papercraft = papercraft({ per: 'group', sides: 'duplex' }); }, ['assets · papercraft · print · sides', '페이퍼크래프트는 늘 단면으로 찍습니다']],
  ['수업 안 만들기는 시간을 적는다', TWO, (l) => { l.assets.making_kit.when = 'in_class'; }, ['수업 안에서 하는 만들기는 걸리는 시간(minutes)을 적습니다']],
  ['차례 맞추기는 12개까지', REVIEW, (l) => { l.assets.web_activity.activity.items.push('열셋'); }, ['12개까지만 적습니다 (지금 13개)']],
  ['놓을 자리는 0~100', TWO, (l) => { l.assets.web_activity.activity.spots[0].x = 120; }, ['100 이하여야 합니다 (지금: 120)']],
  ['옛 활동 이름 (map)', TWO, (l) => { l.assets.web_activity.activity.kind = 'map'; }, ['쓸 수 있는 값: sort, match, order, place']],

  // ── 그림의 권리 ──
  ['그림 파일 이름', ONE, (l) => { l.media[0].file = 'media/돌탑.svg'; }, ['media/ 아래 파일 이름을 영문 소문자·숫자·하이픈으로 씁니다']],
  ['폴더 밖을 가리키는 파일', ONE, (l) => { l.media[0].file = 'media/..'; }, ['media/ 아래 파일 이름을']],
  ['영상은 받지 않는다', ONE, (l) => { l.media[0].kind = 'video'; }, ['쓸 수 있는 값: photo, drawing, diagram, map']],
  ['저장소 밖 파일(url)은 받지 않는다', ONE, (l) => { l.media[0].url = 'https://example.org/big.mp4'; }, ['모르는 칸 이름입니다: url']],
  ['손으로 적는 출처 표시는 없다', ONE, (l) => { l.media[0].credit.line = '그림: 아무개'; l.media[0].modified = true; }, ['모르는 칸 이름입니다: line', '모르는 칸 이름입니다: modified']],
  ['미국식 철자 license', TWO, (l) => { const c = l.media[1].credit; c.license = c.licence; delete c.licence; }, ['모르는 칸 이름입니다: license']],
  ['이용 조건을 우리말로 적음', TWO, (l) => { l.media[1].credit.licence = '공공누리 1유형'; }, ['이 사이트는 퍼블릭 도메인·CC0, 공공누리 제1유형, CC BY, CC BY-SA 그림만 씁니다 (지금: 공공누리 1유형). 다른 그림을 찾습니다']],
  ['이용 조건을 빠뜨림', TWO, (l) => { delete l.media[1].credit.licence; }, ['media · 2번째 · credit · licence: 꼭 있어야 하는 칸이 빠졌습니다. 쓸 수 있는 값: original, PD, CC0, KOGL-1, CC-BY, CC-BY-SA']],
  ['남의 자료에 확인한 날이 없음', TWO, (l) => { delete l.media[1].credit.checked; }, ['남의 자료는 credit.checked 을 적습니다']],
  ['남의 자료에 제목·주소가 없음', TWO, (l) => { delete l.media[1].credit.title; delete l.media[1].credit.source_url; }, ['남의 자료는 credit.title 을 적습니다', '남의 자료는 credit.source_url 을 적습니다']],
  ['본떠 그린 것을 original 로 적음', ONE, (l) => { l.media[0].change = 'traced'; }, ['original 이 아닙니다']],
  // 쓰는 그림은 퍼블릭 도메인·CC0, 공공누리 제1유형, CC BY, CC BY-SA 뿐이다. 고쳐 쓸 수 없거나 다시 쓰는 데 조건이 붙는 것은 받지 않는다.
  ...['KOGL-2', 'KOGL-4', 'CC-BY-NC', 'CC-BY-NC-SA', 'CC-BY-ND', 'permission'].map((lic): [string, string, (l: Raw) => void, string[]] =>
    [`받지 않는 이용 조건 (${lic})`, ONE, (l) => { l.media.push(photo({ credit: { ...photo().credit, licence: lic } })); }, ['media · 2번째 · credit · licence', `이 사이트는 퍼블릭 도메인·CC0, 공공누리 제1유형, CC BY, CC BY-SA 그림만 씁니다 (지금: ${lic}). 다른 그림을 찾습니다`]]),
  ['CC BY-SA 그림을 자름', TWO, (l) => { l.media[2].change = 'cropped'; }, ['media · 3번째 · change', 'CC BY-SA 그림은 자르거나 본뜨지 않고 그대로 씁니다 (change: none). 고치지 않고 쓰거나 다른 그림을 찾습니다']],
  ['CC BY-SA 그림을 본뜸', TWO, (l) => { l.media[2].change = 'traced'; l.media[2].kind = 'drawing'; }, ['media · 3번째 · change', 'CC BY-SA 그림은 자르거나 본뜨지 않고 그대로 씁니다 (change: none)']],
  ['CC 자료에 이용 조건 주소가 없음', TWO, (l) => { delete l.media[2].credit.licence_url; }, ['CC 자료는 이용 조건 주소를 적습니다']],
  ['CC 코드와 주소가 다름', TWO, (l) => { l.media[2].credit.licence_url = 'https://creativecommons.org/licenses/by/3.0/'; }, ['licence(CC-BY-SA)와 licence_url 이 서로 다릅니다']],
  ['CC 주소가 다른 곳', TWO, (l) => { l.media[2].credit.licence_url = 'https://example.org/licenses/by-sa/3.0/'; }, ['https://creativecommons.org/licenses/… 주소를 씁니다']],
  ['이용 조건 주소 자리에 이름을 적음', TWO, (l) => { l.media[2].credit.licence_url = 'CC BY-SA 3.0'; }, ['media · 3번째 · credit · licence_url', 'https://creativecommons.org/licenses/… 주소를 씁니다']],
  ['CC 주소에 판이 없음', TWO, (l) => { l.media[2].credit.licence_url = 'https://creativecommons.org/licenses/by-sa/'; }, ['이용 조건 주소에 판(4.0, 3.0, 2.0/kr …)까지 적습니다. 예: https://creativecommons.org/licenses/by-sa/4.0/']],
  ['공공누리 자료에 CC 주소', TWO, (l) => { l.media[1].credit.licence_url = 'https://creativecommons.org/licenses/by/4.0/'; }, ['media · 2번째 · credit · licence_url', 'licence_url 은 CC 자료에만 적습니다. 이 칸을 지우거나 licence(KOGL-1)를 고칩니다']],
  ['직접 만든 그림에 CC 주소', TWO, (l) => { l.media[0].credit.licence_url = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'; }, ['licence_url 은 CC 자료에만 적습니다. 이 칸을 지우거나 licence(original)를 고칩니다']],
  ['CC0 에 다른 CC 조건의 주소', TWO, (l) => { Object.assign(l.media[2].credit, { licence: 'CC0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/' }); }, ['licence(CC0)에는 https://creativecommons.org/publicdomain/zero/1.0/ 주소만 적을 수 있습니다']],
  ['저작권 없음(PD)에는 까닭', ONE, (l) => { l.media.push(photo({ credit: { ...photo().credit, licence: 'PD' } })); }, ['저작권이 없다고 본 까닭(PD)']],
  ['사람이 나오는 그림에는 초상 확인', ONE, (l) => { l.media.push(photo({ person: true })); }, ['초상 확인(person)을 credit.note 에 적습니다']],
  ['직접 그린 사실 그림은 사실을 가리킨다', ONE, (l) => { delete l.media[0].facts; }, ['media · 1번째 · facts', '직접 그린 사실 그림은 근거로 삼은 사실 id 를 적습니다']],
  ['직접 그린 그림은 SVG', ONE, (l) => { l.media[0].file = 'media/stone.png'; }, ['직접 그린 그림은 SVG 파일로 둡니다']],
  ['남의 사진을 original 로 적음', ONE, (l) => { l.media.push({ id: 'museum', kind: 'photo', file: 'media/museum.jpg', alt: '시험용 사진', credit: { holder: '시험용 박물관', licence: 'original' } }); }, ['media · 2번째 · credit · note', '직접 찍은 사진은 누가 언제 어디에서 찍었는지 credit.note 에 적습니다', 'licence 를 원본의 이용 조건으로 고칩니다']],
  ['사실 그림에 생성형 AI', ONE, (l) => { l.media[0].ai_generated = true; }, ['사실을 전달하는 그림에는 생성형 AI 를 쓰지 않습니다']],

  // ── 지어낸 그림과 사람이 나오는 그림을 쓸 수 없는 자리 ──
  ['지어낸 그림을 그림 한 장(picture)에', ONE, (l) => { Object.assign(l.media[0], { factual: false, ai_generated: true, file: 'media/stone.png', facts: [] }); l.worksheet.pages[0].blocks.shift(); l.assets.cards.cards[2].media = undefined; }, ['slides · 2번째 · media', '지어낸 그림(stone)은 수업 화면의 곁그림으로만 씁니다']],
  ['지어낸 그림을 견주기(compare) 장에', TWO, (l) => { Object.assign(l.media[2], scene); l.slides[3] = { layout: 'compare', title: '둘을 견주어 봅시다', left: { label: '왼쪽', points: ['하나'], media: 'sample' }, right: { label: '오른쪽', points: ['둘'] } }; }, ['slides · 4번째 · left · media', '지어낸 그림(sample)은 수업 화면의 곁그림으로만 씁니다', '견주기(compare)']],
  ['지어낸 그림을 단계(steps) 장에', TWO, (l) => { Object.assign(l.media[2], scene); l.slides[3] = { layout: 'steps', title: '차례를 봅시다', steps: [{ label: '하나', text: '먼저 봅니다.' }, { label: '둘', text: '다음에 놓습니다.', media: 'sample' }] }; }, ['slides · 4번째 · steps · 2번째 · media', '지어낸 그림(sample)']],
  ['지어낸 그림을 학습지 그림(figure)에', ONE, (l) => { Object.assign(l.media[0], { factual: false }); }, ['worksheet · pages · 1번째 · blocks · 1번째 · media', '지어낸 그림(stone)']],
  ['지어낸 그림을 본 것·짐작한 것 칸에', TWO, (l) => { l.media[0].factual = false; }, ['worksheet · pages · 1번째 · blocks · 4번째 · media', '지어낸 그림(map)']],
  ['지어낸 그림을 지도에 놓기에', TWO, (l) => { l.media[0].factual = false; }, ['assets · web_activity · activity · media', '지어낸 그림(map)']],
  ['지어낸 그림을 카드에', ONE, (l) => { l.media[0].factual = false; }, ['assets · cards · cards · 3번째 · media', '지어낸 그림(stone)']],
  ['지어낸 그림을 컬러링에', TWO, (l) => { l.media[1].factual = false; }, ['assets · coloring · media', '지어낸 그림(stone-line)']],
  ['사람이 나오는 그림을 카드에', ONE, (l) => { l.media[0].person = true; l.media[0].credit.note = '초상 확인함'; }, ['실제 사람이 나오는 그림(stone)은 카드·컬러링·웹 활동에 쓰지 않습니다']],
  ['컬러링에 남의 사진을 그대로', TWO, (l) => { l.assets.coloring.media = 'sample'; }, ['컬러링 도안은 직접 그렸거나(original) 본떠 그린(change: traced) 선 그림이어야 합니다']],
  ['컬러링은 한 쪽', TWO, (l) => { l.assets.coloring.print = { per: 'student', sides: 'duplex' }; }, ['컬러링 도안은 한 쪽입니다']],

  // ── 아픈 역사 ──
  ['피해를 담은 사실을 퀴즈가 가리킴', HEAVY, (l) => { l.quiz.items[0].facts = ['f2']; }, ['quiz · items · 1번째 · facts · 1번째', '피해를 담은 사실(f2)은 퀴즈·카드·놀이 자료가 가리킬 수 없습니다']],
  ['피해를 담은 사실을 카드가 가리킴', HEAVY, (l) => { l.assets.cards.cards[0].facts.push('f2'); }, ['assets · cards · cards · 1번째 · facts', '피해를 담은 사실(f2)']],
  ['피해를 담은 사실을 웹 활동이 가리킴', HEAVY, (l) => { l.assets.web_activity.activity.facts = ['f2']; }, ['assets · web_activity · activity · facts', '피해를 담은 사실(f2)']],
  ['피해를 담은 사실에 기댄 낱말은 카드로 만들지 않는다', HEAVY, (l) => { l.terms.new[0].facts = ['f2']; }, ['"규칙 하나" 의 풀이는 피해를 담은 사실에 기대고 있어 카드로 만들지 않습니다']],
  // 카드나 활동이 다른 사실을 가리켜도, 그림이 피해를 담은 사실을 그린 것이면 그 그림이 놀이 자료에 찍힌다
  ['피해를 담은 사실을 그린 그림을 카드에', TWO, (l) => { harm(l); l.assets.cards.cards[1].media = 'harm'; }, ['assets · cards · cards · 2번째 · media', '피해를 담은 사실을 그린 그림(harm)은 카드·컬러링·웹 활동에 쓰지 않습니다. 수업 화면과 학습지에서만 씁니다']],
  ['피해를 담은 사실을 그린 그림을 컬러링에', TWO, (l) => { harm(l); l.assets.coloring.media = 'harm'; }, ['assets · coloring · media', '피해를 담은 사실을 그린 그림(harm)']],
  ['피해를 담은 사실을 그린 그림을 지도에 놓기에', TWO, (l) => { harm(l); l.assets.web_activity.activity.media = 'harm'; }, ['assets · web_activity · activity · media', '피해를 담은 사실을 그린 그림(harm)']],
  ['피해를 담은 사실을 그린 그림을 분류하기의 항목에 (no_play)', HEAVY, (l) => { l.media = [{ id: 'harm', kind: 'drawing', file: 'media/harm.svg', alt: '시험용 그림', credit: { holder: '시험용 그린이', licence: 'original' }, facts: ['f2'] }]; l.assets.web_activity.activity.items[0].media = 'harm'; }, ['assets · web_activity · activity · items · 1번째 · media', '피해를 담은 사실을 그린 그림(harm)']],
  ['피해를 담은 사실이 있는데 level 이 none', HEAVY, (l) => { delete l.sensitivity; l.assets.cards.state = 'skip'; l.assets.cards = { state: 'skip', reason: 'x' }; l.flow[2].uses = ['quiz']; }, ['sensitivity · level', '피해를 담은 사실(f2)이 있으면 sensitivity.level 을 care 나 no_play 로 적습니다']],
  ['no_play 차시에는 놀이 자료를 계획하지도 않는다', HEAVY, (l) => { l.assets.escape = { state: 'planned', idea: '한 방' }; }, ['assets · escape · state', 'sensitivity 가 no_play 인 차시에는 만들지 않습니다']],
  ['no_play 차시의 카드는 낱말만', HEAVY, (l) => { l.assets.cards.cards[0] = { front: '끌려간 사람들', back: '시험용', facts: ['f1'] }; }, ['no_play 차시의 카드는 terms.new 의 낱말만 담습니다']],
  ['no_play 차시의 카드에는 놀이가 없다', HEAVY, (l) => { l.assets.cards.games = [{ name: '빨리 맞히기', how: '많이 모은 사람이 이깁니다.' }]; }, ['no_play 차시의 카드에는 놀이 방법을 붙이지 않습니다']],

  // ── 검수 기록 ──
  ['지문은 손으로 적지 않는다', ONE, (l) => { l.reviews = [{ kind: 'fact', by: '날쌤', date: '2026-11-20', result: 'pass', seal: '확인함' }]; }, ['지문은 손으로 적지 않습니다. npm run sign 이 적습니다']],
  ['옛 검수 종류 (copy)', ONE, (l) => { l.reviews = [{ kind: 'copy', by: '날쌤', date: '2026-11-20', result: 'pass' }]; }, ['쓸 수 있는 값: fact, originality, voice, print, owner']],
  ['옛 확인 값 (corrected)', ONE, (l) => { l.facts[0].checks = [{ by: '날쌤', date: '2026-11-20', verdict: 'corrected' }]; }, ['쓸 수 있는 값: confirmed, disputed']],
  // 적힌 차례가 시간 차례다. 나중 날짜의 fix·disputed 를 통과 기록 위에 끼워 넣어도 '마지막 기록'에 가려지지 않는다.
  ['검수 기록은 날짜가 이른 것부터', ONE, (l) => { l.reviews = [{ kind: 'fact', by: '검수자2', date: '2026-12-01', result: 'fix' }, { kind: 'fact', by: 'ai:fact', date: '2026-11-20', result: 'pass' }]; }, ['reviews · 2번째 · date', '검수 기록은 날짜가 이른 것부터 적습니다 (맨 아래가 가장 나중 기록입니다)']],
  ['확인 기록은 날짜가 이른 것부터', ONE, (l) => { l.facts[0].checks = [{ by: 'ai:검증자C', date: '2026-12-05', verdict: 'disputed' }, { by: 'ai:검증자A', date: '2026-11-19', verdict: 'confirmed' }, { by: 'ai:검증자B', date: '2026-11-19', verdict: 'confirmed' }]; }, ['facts · 1번째 · checks · 2번째 · date', '확인 기록은 날짜가 이른 것부터 적습니다']],
];

for (const [name, id, change, fragments] of cases) {
  test(`통과하면 안 된다: ${name}`, () => { failsWith(mutated(id, change), ...fragments); });
}

test('오류에는 줄 번호가 붙고, 번호는 1부터 센다', () => {
  const text = fixtureText(ONE).replace('phase: 전개', 'phase: 전개부');
  const line = text.split('\n').findIndex((s) => s.includes('phase: 전개부')) + 1;
  const message = failsWith(() => parseLessonText(text, 'x.yaml'), `${line}번째 줄 · flow · 2번째 · phase`);
  assert.ok(message.startsWith('x.yaml\n'));
});

test('YAML 문법 오류도 한국어로, 줄 번호와 함께', () => {
  const at = (text: string, needle: string) => text.split('\n').findIndex((s) => s.includes(needle)) + 1;
  // 글 안의 "콜론+빈칸"
  let text = fixtureText(ONE).replace('idea: 시험용 계획', 'idea: 한 방: 시험용 계획');
  failsWith(() => parseLessonText(text), `${at(text, '한 방:')}번째 줄: YAML 을 읽을 수 없습니다`, '글 전체를 큰따옴표로 감쌉니다');
  // 따옴표로 시작하는 글
  text = fixtureText(ONE).replace('text: 앞 칸에 본 것이', 'text: "앞 칸"에 본 것이');
  failsWith(() => parseLessonText(text), 'YAML 을 읽을 수 없습니다');
  // 탭 들여쓰기
  text = fixtureText(ONE).replace('  - 시험용 목표를 말한다.', '\t- 시험용 목표를 말한다.');
  failsWith(() => parseLessonText(text), '들여쓰기에 탭을 쓰지 않습니다');
  // 같은 칸 이름 두 번
  text = fixtureText(ONE).replace('status: draft', 'status: draft\nstatus: published');
  failsWith(() => parseLessonText(text), '같은 칸 이름이 두 번 나옵니다');
});

test('값 뒤의 " #" 은 글을 소리 없이 자르므로 막는다', () => {
  const text = fixtureText(ONE).replace('q: 돌탑은 돌을 쌓아 만든다.', 'q: 돌탑은 돌을 #쌓아 만든다.');
  const line = text.split('\n').findIndex((s) => s.includes('#쌓아')) + 1;
  failsWith(() => parseLessonText(text), `${line}번째 줄: 값 뒤의 " #" 부터는 주석으로 버려집니다 (버려진 글: 쌓아 만든다.)`);
  failsWith(() => parseLessonText(fixtureText(ONE).replace('status: draft', 'status: draft  # 초안')), '주석이면 윗줄로 옮깁니다');
  // 윗줄에 적은 주석과 따옴표 안의 # 은 괜찮다
  assert.doesNotThrow(() => parseLessonText(fixtureText(ONE).replace('status: draft', '# 초안\nstatus: draft')));
  assert.doesNotThrow(() => parseLessonText(fixtureText(ONE).replace('q: 돌탑은 돌을 쌓아 만든다.', 'q: "돌탑은 돌을 #쌓아 만든다."')));
  // 줄 끝이 CRLF 인 파일(Windows 에서 저장했거나 꺼낸 것)에서도 똑같이 막는다
  const crlf = text.replace(/\r?\n/g, '\r\n');
  failsWith(() => parseLessonText(crlf), `${line}번째 줄: 값 뒤의 " #" 부터는 주석으로 버려집니다 (버려진 글: 쌓아 만든다.)`);
  assert.equal(parseLessonText(fixtureText(ONE).replace(/\r?\n/g, '\r\n')).id, ONE);
  // 여러 줄 글(> 와 |) 다음 줄에 따로 쓴 주석도 괜찮다. 블록 안의 # 은 글자 그대로다.
  for (const mark of ['>', '|', '>-']) {
    const block = fixtureText(ONE).replace('    notes: 시험용 진행 메모', `    notes: ${mark}\n      시험용 진행 메모 #1\n      둘째 줄\n  # 여기부터 다음 장`);
    assert.notEqual(block, fixtureText(ONE));
    assert.match(parseLessonText(block).slides[0].notes ?? '', /^시험용 진행 메모 #1\s둘째 줄$/);
  }
});

test('통과해야 한다: 손으로 쓰기 쉬운 여러 꼴', () => {
  // 따옴표 없는 연도
  passes(ONE, (l) => { l.quiz.items[2].answer = 1919; l.assets.cards.cards[3].front = 918; l.slides[0].subtitle = 1392; });
  // 전각 밑줄도 빈칸으로 받는다
  passes(ONE, (l) => { l.worksheet.pages[0].blocks[4].frame = '나는 ＿＿을 보았다.'; });
  passes(ONE, (l) => { l.worksheet.pages[0].blocks[4].frame = '나는 ______을 보았다.'; });
  // 보기 블록은 한 문장(text)으로도, 단 안에서도 쓸 수 있다
  passes(ONE, (l) => { l.worksheet.pages[0].blocks[1] = { type: 'example', text: '나는 돌이 쌓인 것을 보고 여럿이 힘을 모았다고 짐작했다.' }; });
  passes(ONE, (l) => { l.worksheet.pages[0].blocks.push({ type: 'columns', columns: [[{ type: 'example', text: '보기 하나' }], [{ type: 'lines', count: 2 }]] }); });
  // 초안은 출처 없이도 저장할 수 있다
  passes(ONE, (l) => { for (const f of l.facts) delete f.sources; });
  // 수업 화면의 진행 메모는 비워도 된다
  passes(ONE, (l) => { delete l.slides[0].notes; });
  // 인쇄 안내는 기본과 다를 때만 적는다
  passes(TWO, (l) => { delete l.assets.cards.print; delete l.assets.coloring.print; });
  // 지어낸 그림(AI 포함)도 수업 화면의 곁그림으로는 쓸 수 있다 (question·points 장)
  passes(TWO, (l) => { Object.assign(l.media[2], scene); });
  // 실물 사진은 견주기·단계 장에 쓸 수 있다
  passes(TWO, (l) => { l.slides[3] = { layout: 'compare', title: '둘을 견주어 봅시다', left: { label: '왼쪽', points: ['하나'], media: 'sample' }, right: { label: '오른쪽', points: ['둘'], media: 'map' } }; });
  // 직접 찍은 사진은 누가 언제 어디에서 찍었는지 적으면 original 로 둘 수 있다
  passes(ONE, (l) => { l.media.push({ id: 'mine', kind: 'photo', file: 'media/mine.jpg', alt: '시험용 사진', credit: { holder: '몽당분필 날쌤', licence: 'original', note: '날쌤이 2026년 5월 강화도에서 찍음' } }); });
  // 학습지에만 싣는 읽기 자료는 문단 6개 × 120자까지 쓸 수 있다
  passes(TWO, (l) => { l.passages.push({ id: 'long', title: '긴 글', text: Array(6).fill('가'.repeat(120)), source: '시험용 기록을 풀어 썼습니다.' }); l.worksheet.pages[0].blocks[0].passage = 'long'; });
  // 수업 화면에 싣는 읽기 자료: 문단 4개, 모두 300자까지
  passes(TWO, (l) => { l.passages[0].text = Array(4).fill('가'.repeat(75)); });
  // 페이퍼크래프트는 세로·단면이면 된다
  passes(ONE, (l) => { l.assets.papercraft = papercraft({ per: 'group', sides: 'single', materials: ['가위', '풀'] }); });
  // 같은 날 적은 기록은 차례대로 둔다
  passes(ONE, (l) => { l.reviews = [{ kind: 'voice', by: 'x', date: '2026-11-20', result: 'fix' }, { kind: 'voice', by: 'x', date: '2026-11-20', result: 'pass' }]; });
  // 고치지 않은 CC BY-SA 사진, 본떠 그린 공공누리 1유형
  passes(TWO, () => {});
  // 이용 조건 주소: 나라별 판, CC0 과 저작권 없음(PD)의 publicdomain 주소
  passes(TWO, (l) => { Object.assign(l.media[2].credit, { licence: 'CC-BY', licence_url: 'https://creativecommons.org/licenses/by/2.0/kr/' }); });
  passes(TWO, (l) => { Object.assign(l.media[2].credit, { licence: 'CC0', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/' }); });
  passes(TWO, (l) => { Object.assign(l.media[2].credit, { licence: 'PD', licence_url: 'https://creativecommons.org/publicdomain/mark/1.0/', note: '만든 지 오래되어 저작권이 끝났다.' }); });
  passes(TWO, (l) => { const cr = l.media[2].credit; cr.licence = 'CC0'; delete cr.licence_url; });
  // 공개된 차시에 출처 없는 사실이 있어도 형식은 막지 않는다. 공개 조건은 로더가 보고, 그래야 지문과 남은 검수를 읽을 수 있다.
  passes(ONE, (l) => { l.status = 'published'; l.facts[0].sources = []; });
  // 두 차시 묶음은 둘째 차시 앞에 표지를 한 장 더 둘 수 있다
  passes(TWO, (l) => { assert.deepEqual([l.slides[0].layout, l.slides[4].layout], ['title', 'title']); });
  // 수업 밖 만들기는 시간을 적지 않는다
  passes(TWO, (l) => { assert.equal(l.assets.making_kit.minutes, undefined); });
  // care 차시는 피해를 담은 사실을 흐름·수업 화면·학습지·읽기 자료에서 가리킬 수 있다
  passes(TWO, (l) => { l.facts[1].painful = true; l.quiz.items[2].facts = ['f1']; l.quiz.items[3].facts = ['f1']; l.assets.cards.cards[3].facts = ['f1']; });
  // 단원 정리 묶음은 사실 없이 앞 묶음을 가리킨다 (묶음 사이 검사는 로더가 한다)
  passes(REVIEW, () => {});
  // 수업 화면은 한 차시에 24장까지다. 두 차시 묶음은 48장까지 쓸 수 있다
  passes(ONE, (l) => { moreSlides(l, 24); });
  passes(TWO, (l) => { moreSlides(l, 25); });
  passes(TWO, (l) => { moreSlides(l, 48); });
  // 피해를 담은 사실을 그린 그림도 수업 화면과 학습지에서는 쓸 수 있다
  passes(TWO, (l) => { harm(l); l.slides[3] = { layout: 'picture', title: '그림을 봅시다', media: 'harm', facts: ['f3'] }; l.worksheet.pages[0].blocks.push({ type: 'figure', media: 'harm' }); });
  // 주소의 경로·물음·조각에 든 "@" 는 괜찮다
  passes(ONE, (l) => { l.facts[0].sources[0].url = 'https://example.org/a@b/c?who=x@y#z@w'; });
});

test('같은 문항을 두 차시에서 띄우면 lesson 을 고치라는 말로 돌려보내지 않는다', () => {
  // 예전에는 "문항에 lesson: 2 을 적습니다" → 고치면 "문항에 lesson: 3 을 적습니다" 로 맴돌았다
  for (const lesson of [2, 3]) {
    const message = failsWith(mutated(TWO, (l) => { l.slides[3] = { layout: 'quiz', item: 3 }; l.quiz.items[2].lesson = lesson; }), '3번 문항을 2차시와 3차시의 수업 화면에서 모두 띄웁니다');
    assert.ok(!message.includes('문항에 lesson:'), message);
  }
});

test('고르기의 답이 보기 수를 넘으면 한 줄로, 실제 보기 수를 들어 알린다', () => {
  // 예전에는 "4 이하여야 합니다"(보기가 셋인데 틀린 범위)와 "answer 는 choices 의 순서 번호입니다" 두 줄이 나왔다
  const lines = failsWith(mutated(ONE, (l) => { l.quiz.items[1].answer = 5; })).split('\n').filter((s) => s.includes('answer'));
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.ok(lines[0].endsWith('quiz · items · 2번째 · answer: 보기가 3개이므로 1~3 가운데 하나를 적습니다 (지금: 5)'), lines[0]);
});

test('꼴이 틀린 칸에는 그 한 줄만 알려 준다 (길이·개수 문구를 덧붙이지 않는다)', () => {
  // 목록 자리에 글 한 줄을 적으면 "6자까지만 씁니다" 같은 엉뚱한 둘째 문구가 따라 나오고 있었다
  const only = (change: (l: Raw) => void, where: string) => {
    const lines = failsWith(mutated(ONE, change)).split('\n').filter((s) => s.includes(` · ${where}: `));
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], /목록\(- 로 시작하는 줄\)을 적는 칸입니다 \(지금: ".+"\)$/);
  };
  only((l) => { l.flow[1].do = '사진을 띄우고 무엇이 보이는지 묻습니다.'; }, 'flow · 2번째 · do');
  only((l) => { l.objectives = '시험용 목표를 말한다.'; }, 'objectives');
  only((l) => { l.quiz.items[1].choices = '돌, 물, 바람'; }, 'quiz · items · 2번째 · choices');
  // 꼴이 맞는 칸의 길이·개수 문구는 그대로 나온다
  failsWith(mutated(ONE, (l) => { l.objectives = ['가', '나', '다', '라']; l.flow[1].do = '한 줄'; }), '3개까지만 적습니다 (지금 4개)', '목록(- 로 시작하는 줄)을 적는 칸입니다');
});

test('빈 파일과 UTF-8 이 아닌 파일', () => {
  for (const text of ['', '\n\n', '# 주석만 있는 파일\n']) {
    const message = failsWith(() => parseLessonText(text, 'x.yaml'), '파일이 비어 있습니다. 내용을 적습니다');
    assert.ok(!message.includes('칸 이름만 있고'), message);
  }
  // 메모장의 옛 저장 방식(CP949)이나 UTF-16 으로 저장한 파일은 한글이 깨진 채 읽힌다. 형식 오류 수십 줄 대신 한 줄로 알려 준다.
  const cp949 = Buffer.concat([Buffer.from('schema_version: 1\ntitle: '), Buffer.from([0xb0, 0xed, 0xc0, 0xce, 0xb5, 0xb9]), Buffer.from('\n')]).toString('utf8');
  const utf16 = Buffer.from('\ufeff' + fixtureText(ONE), 'utf16le').toString('utf8');
  for (const text of [cp949, utf16]) {
    const message = failsWith(() => parseLessonText(text, 'x.yaml'), '파일이 UTF-8 로 저장되어 있지 않아 한글이 깨졌습니다. 편집기에서 인코딩을 UTF-8 로 골라 다시 저장합니다');
    assert.equal(message.split('\n').length, 2, message);
  }
  // UTF-8 서명(BOM)이 붙은 파일은 그대로 읽는다 (메모장의 "UTF-8(BOM)")
  assert.equal(parseLessonText('\ufeff' + fixtureText(ONE)).id, ONE);
});
