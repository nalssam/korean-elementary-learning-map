// 명세만 보고 판단하는 검사: 아이가 읽는 글의 숫자가 가리킨 사실에 있는가, 출처가 공개 출처인가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '#lib/content.ts';
import { DENIED_HOST, factBoxes, factIssues, numbersIn, sourceIssues } from '#lib/checks.ts';
import { FIXTURES, tempContent } from './helpers.ts';

test('실제 명세와 시험용 명세는 걸리는 것이 없다', () => {
  delete process.env.CONTENT_DIR;
  const dolmen = c.loadLesson('5-2/1/01');
  assert.deepEqual(factIssues(dolmen), []);
  assert.deepEqual(sourceIssues(dolmen), []);
  process.env.CONTENT_DIR = FIXTURES;
  for (const id of c.lessonIds()) {
    assert.deepEqual(factIssues(c.loadLesson(id)), [], id);
    assert.deepEqual(sourceIssues(c.loadLesson(id)), [], id);
  }
});

test('대조할 숫자: 세 자리 이상, N년·N세기, 3·1 같은 날짜 이름', () => {
  assert.deepEqual(numbersIn('1392년에 조선이 세워졌다'), ['1392']);
  assert.deepEqual(numbersIn('4세기와 5 세기, 기원전 108년'), ['4', '5', '108']);
  assert.deepEqual(numbersIn('3·1 운동과 6·25 전쟁'), ['3·1', '6·25']);
  assert.deepEqual(numbersIn('약 1,000명, 12,345개'), ['1000', '12345']);
  assert.deepEqual(numbersIn('1910년대'), ['1910']);
  // 큰 수를 한글로 적은 것 (세 자리 숫자보다 먼저 본다)
  assert.deepEqual(numbersIn('약 70만 년 전'), ['70만']);
  assert.deepEqual(numbersIn('1만 년 전, 5천 년 전, 100만 명, 2억 5천만'), ['1만', '5천', '100만', '2억', '5천만']);
  // 두 자리 이하의 개수·시간은 보지 않는다
  assert.deepEqual(numbersIn('30초 동안 카드 4장을 2명이'), []);
  // "8월 15일" 같은 날짜는 달과 날을 한 덩어리로 본다 (띄어 쓰든 붙여 쓰든 같다)
  assert.deepEqual(numbersIn('1945년 8월 15일에'), ['1945', '8월15일']);
  assert.deepEqual(numbersIn('3월 1일과 3월1일, 10월  9일'), ['3월1일', '3월1일', '10월9일']);
  // 달만, 날만 적은 것은 보지 않는다
  assert.deepEqual(numbersIn('8월에 시작해 15일 동안'), []);
});

test('가리킨 사실에 없는 숫자를 잡는다', () => {
  const t = tempContent('checks');
  process.env.SHOW_DRAFTS = '1';
  const issues = (id: string, change: (l: Record<string, any>) => void) => {
    t.edit(id, change);
    try { return factIssues(c.loadLesson(id)); } finally { t.reset(); }
  };
  try {
    // 공개된 뒤 끼워 넣은, 사실과 다른 연도의 문항과 카드
    let out = issues('5-2/1/01', (l) => {
      l.quiz.items.push({ type: 'choice', q: '시험용 연표의 첫 해는 언제인가요?', choices: ['1995년', '1392년', '2010년'], answer: 1, explain: '1995년입니다.', facts: ['f2'] });
      l.assets.cards.cards.push({ front: '첫 해', back: '시험용 연표는 1995년에 시작한다.', facts: ['f2'] });
    });
    assert.equal(out.length, 3);
    assert.ok(out[0].startsWith('quiz.items[3]: 숫자 "1995" 이(가) 가리킨 사실(f2)의 문장에 없습니다 — 「1995년」'), out[0]);
    assert.ok(out[1].includes('「1995년입니다.」'));
    assert.ok(out[2].startsWith('assets.cards.cards[4]: 숫자 "1995"'));
    // 연도가 든 문장이 연도와 관계없는 사실을 가리킴
    out = issues('5-2/1/01', (l) => { l.quiz.items[0] = { type: 'ox', q: '돌탑은 1392년에 쌓았다.', answer: true, explain: '1392년입니다.', facts: ['f1'] }; });
    assert.equal(out.length, 2);
    assert.ok(out[0].includes('가리킨 사실(f1)의 문장에 없습니다'));
    // 사실을 가리키지 않는 자리의 숫자 (수업 화면)
    out = issues('5-2/1/01', (l) => { l.slides[4].points = ['1392년에 시작했습니다.']; });
    assert.deepEqual(out, ['slides[4]: 숫자 "1392" 이(가) 가리킨 사실(없음)의 문장에 없습니다 — 「1392년에 시작했습니다.」']);
    // 학습지의 표와 풀이
    out = issues('5-2/1/02-03', (l) => { l.worksheet.guide.push({ where: '표', text: '답은 1443년입니다.' }); });
    assert.equal(out.length, 1);
    assert.ok(out[0].startsWith('worksheet: 숫자 "1443"'));
    // 다른 묶음의 사실을 가리켜도 그 문장과 대조한다
    out = issues('5-2/1/05', (l) => { l.quiz.items[1].explain = '1393년입니다.'; });
    assert.deepEqual(out, ['quiz.items[1]: 숫자 "1393" 이(가) 가리킨 사실(01/f2)의 문장에 없습니다 — 「1393년입니다.」']);
    // 연표의 when 은 늘 찍힌다. 사실과 다른 해를 적으면 잡는다.
    out = issues('5-2/1/02-03', (l) => { l.worksheet.pages[1].blocks[0].points[1].when = '1995년'; });
    assert.equal(out.length, 1);
    assert.ok(out[0].startsWith('worksheet: 숫자 "1995" 이(가) 가리킨 사실(') && out[0].endsWith('의 문장에 없습니다 — 「1995년」'), out[0]);
    // "약 70만 년 전" 같은 큰 수
    out = issues('5-2/1/01', (l) => {
      l.facts[1].claim = '시험용 돌은 약 70만 년 전의 것이다.';
      l.quiz.items[2] = { type: 'ox', q: '시험용 돌은 약 5만 년 전의 것이다.', answer: true, explain: '약 5만 년 전의 것입니다.', facts: ['f2'] };
      l.assets.cards.cards[3] = { front: '오래된 돌', back: '약 70만 년 전의 돌', facts: ['f2'] };
    });
    assert.equal(out.length, 2);
    assert.ok(out[0].startsWith('quiz.items[2]: 숫자 "5만" 이(가) 가리킨 사실(f2)의 문장에 없습니다'), out[0]);

    // 날짜: 해는 맞고 날이 다른 문항과 카드
    out = issues('5-2/1/01', (l) => {
      l.facts[1].claim = '시험용 연표의 첫 날은 1945년 8월 15일이다.';
      l.quiz.items[2] = { type: 'ox', q: '시험용 연표의 첫 날은 1945년 8월 16일이다.', answer: true, explain: '1945년 8월 15일입니다.', facts: ['f2'] };
      l.assets.cards.cards[3] = { front: '첫 날', back: '8월15일', facts: ['f2'] };
    });
    assert.deepEqual(out, ['quiz.items[2]: 숫자 "8월16일" 이(가) 가리킨 사실(f2)의 문장에 없습니다 — 「시험용 연표의 첫 날은 1945년 8월 16일이다.」']);

    // 거짓으로 낸 OX 문장과 고르기의 틀린 보기는 일부러 틀린 숫자를 담으므로 보지 않는다
    out = issues('5-2/1/01', (l) => {
      l.quiz.items[0] = { type: 'ox', q: '시험용 연표의 첫 해는 1995년이다.', answer: false, explain: '첫 해는 1392년입니다.', facts: ['f2'] };
      l.quiz.items[1] = { type: 'choice', q: '시험용 연표의 첫 해는 언제인가요?', choices: ['1392년', '1995년', '2010년'], answer: 1, explain: '1392년입니다.', facts: ['f2'] };
    });
    assert.deepEqual(out, []);

    // 쓰이지 않는 사실, 두 문장으로 적은 사실
    out = issues('5-2/1/01', (l) => { l.facts.push({ id: 'f3', claim: '아무도 가리키지 않는 사실이다.' }); l.facts[0].claim = '돌탑은 돌로 만든다. 박물관에 있다.'; });
    assert.deepEqual(out, ['사실 f1: 문장을 하나로 씁니다. 둘이면 사실을 나누어 적습니다', '사실 f3: 어디에서도 가리키지 않습니다. 가리키게 하거나 지웁니다']);
  } finally {
    t.cleanup();
    delete process.env.SHOW_DRAFTS;
  }
});

test('어디에서도 쓰지 않는 그림은 걸린다 (쓰지 않아도 사이트에 실리고 출처 표시는 찍히지 않는다)', () => {
  const t = tempContent('unused-media');
  process.env.SHOW_DRAFTS = '1';
  try {
    t.edit('5-2/1/02-03', (l) => {
      l.media.push({ id: 'extra', kind: 'photo', file: 'media/sample.png', alt: '쓰지 않는 사진',
        credit: { holder: '시험용 박물관', title: '시험용 유물', source_url: 'https://example.org/item/9', licence: 'KOGL-3', checked: '2026-11-18' } });
    });
    const l = c.loadLesson('5-2/1/02-03');
    assert.deepEqual(sourceIssues(l), ['media.extra: 어디에서도 쓰지 않는 그림입니다. 쓰는 자리를 적거나 media 에서 지웁니다 (쓰지 않아도 사이트에 실리고, 출처 표시는 찍히지 않습니다)']);
    assert.ok(!c.shownMedia(l).some((m) => m.id === 'extra'));
    // 쓰는 자리가 생기면 걸리지 않는다
    t.edit('5-2/1/02-03', (x) => { x.slides[3].media = 'extra'; });
    assert.deepEqual(sourceIssues(c.loadLesson('5-2/1/02-03')), []);
  } finally {
    t.cleanup();
    delete process.env.SHOW_DRAFTS;
  }
});

test('factBoxes: 아이와 교사가 읽는 글은 빠짐없이 어느 상자에 든다 (사실 대조표)', () => {
  process.env.CONTENT_DIR = FIXTURES;
  process.env.SHOW_DRAFTS = '1';
  try {
    for (const id of c.lessonIds()) {
      const l = c.loadLesson(id);
      const boxes = factBoxes(l);
      const inBox = new Set(boxes.flatMap((b) => b.texts));
      // 사실의 문장·출처와 그림의 권리 정보는 대조할 글이 아니라 대조의 기준이다
      const prose = [...c.childStrings(l), ...c.teacherStrings(l)].filter((s) => !/^facts\[|^media\.[^.]+\.credit\./.test(s.path));
      for (const s of prose) assert.ok(inBox.has(s.text), `${id}: 어느 상자에도 없는 글 ${s.path}: ${s.text}`);
      // 상자의 글은 모두 명세의 글이다 (선택값이나 id 가 섞이지 않는다)
      const known = new Set(prose.map((s) => s.text));
      for (const b of boxes) for (const text of b.texts) assert.ok(known.has(text), `${id}: ${b.where} 에 글이 아닌 값: ${text}`);
      for (const b of boxes) assert.ok(b.texts.length > 0 && (b.reader === 'child' || b.reader === 'teacher'), b.where);
      assert.equal(new Set(boxes.map((b) => b.where)).size, boxes.length, `${id}: 자리가 겹칩니다`);
    }
    const one = factBoxes(c.loadLesson('5-2/1/01'));
    const box = (where: string) => one.find((b) => b.where === where);
    // 가리킨 사실이 있는 상자
    assert.deepEqual(box('slides[1]'), { where: 'slides[1]', reader: 'child', texts: ['무엇이 보이나요?', '돌 세 개'], refs: ['f1'] });
    assert.deepEqual(box('terms.new[0]')?.refs, ['f1']);
    assert.deepEqual(box('media.stone'), { where: 'media.stone', reader: 'child', texts: ['네모난 돌 세 개가 차곡차곡 쌓여 있는 그림', '시험용 돌탑'], refs: ['f1'] });
    assert.deepEqual(box('flow[0]')?.refs, ['f1']);
    assert.equal(box('flow[0]')?.reader, 'teacher');
    // 문항은 거짓으로 낸 문장과 틀린 보기까지 모두 표에 오른다 (숫자 대조는 참인 글만 본다)
    assert.deepEqual(box('quiz.items[1]'), { where: 'quiz.items[1]', reader: 'child', texts: ['돌탑을 만드는 것은 무엇인가요?', '돌', '물', '바람', '돌을 쌓습니다.'], refs: ['f1'] });
    assert.deepEqual(box('assets.cards.cards[2]'), { where: 'assets.cards.cards[2]', reader: 'child', texts: ['자갈', '작고 둥근 돌'], refs: ['f1'] });
    // 사실을 가리키지 않는 상자: 사실 대조표의 '가리킨 사실 없음'에 오른다
    const uncited = one.filter((b) => b.refs.length === 0).map((b) => b.where);
    for (const where of ['title', 'slides[0]', 'slides[0].notes', 'slides[2]', 'slides[4]', 'worksheet', 'assets.cards', 'tagline', 'objectives', 'prepare', 'flow[1]', 'misconceptions[0]', 'assessment', 'teacher_notes[0]']) {
      assert.ok(uncited.includes(where), `가리킨 사실 없음에 없음: ${where} (${uncited.join(', ')})`);
    }
    // 글이 없는 자리(퀴즈 장, 글을 적지 않은 인쇄 안내)는 상자가 없다
    assert.equal(box('slides[3]'), undefined);
    assert.equal(box('worksheet.print'), undefined);
    assert.deepEqual(box('slides[0].notes'), { where: 'slides[0].notes', reader: 'teacher', texts: ['시험용 진행 메모'], refs: [] });
    assert.deepEqual(box('assets.cards')?.texts, ['시험용 카드', '뜻 듣고 맞히기', '뒷면을 읽으면 앞면을 맞힙니다.']);
    const two = factBoxes(c.loadLesson('5-2/1/02-03'));
    assert.deepEqual(two.find((b) => b.where === 'assets.cards.print'), { where: 'assets.cards.print', reader: 'teacher', texts: ['A4 두꺼운 종이'], refs: [] });
    assert.deepEqual(two.find((b) => b.where === 'sensitivity')?.texts, ['시험용 주의 사항']);
    assert.deepEqual(two.find((b) => b.where === 'assets.making_kit')?.texts, ['시험용 만들기', '두꺼운 종이', '연필', '종이를 둥글게 오립니다.', '연필을 가운데에 꽂습니다.', '가위를 쓸 때 조심합니다.']);
  } finally {
    delete process.env.SHOW_DRAFTS;
  }
});

test('사실을 가리키지 않는 글에 숨은 문장은 사실 대조표의 끝에 모인다', () => {
  const t = tempContent('factboxes');
  process.env.SHOW_DRAFTS = '1';
  try {
    // 숫자가 없고 아무 사실도 가리키지 않는 거짓 문장 넷: 마무리 장, 학습지의 짧은 글, 오개념에 받아 주는 말, 교사 메모
    t.edit('5-2/1/01', (l) => {
      l.slides[4].points = ['돌탑은 옛 임금의 무덤입니다.'];
      l.worksheet.pages[0].blocks.push({ type: 'note', text: ['돌탑은 나무로 만듭니다.'] });
      l.misconceptions[0].response = '돌탑은 바닷속에서 만듭니다.';
      l.teacher_notes[0].body = ['돌탑은 하루 만에 쌓습니다.'];
    });
    const l = c.loadLesson('5-2/1/01');
    // 어떤 검사에도 걸리지 않는다
    assert.deepEqual(factIssues(l), []);
    // 표의 끝('가리킨 사실 없음')에는 모두 오른다
    const uncited = factBoxes(l).filter((b) => b.refs.length === 0);
    const where = (text: string) => uncited.find((b) => b.texts.includes(text))?.where;
    assert.equal(where('돌탑은 옛 임금의 무덤입니다.'), 'slides[4]');
    assert.equal(where('돌탑은 나무로 만듭니다.'), 'worksheet');
    assert.equal(where('돌탑은 바닷속에서 만듭니다.'), 'misconceptions[0]');
    assert.equal(where('돌탑은 하루 만에 쌓습니다.'), 'teacher_notes[0]');
  } finally {
    t.cleanup();
    delete process.env.SHOW_DRAFTS;
  }
});

test('교과서 회사와 누구나 고칠 수 있는 곳은 출처로 쓰지 않는다', () => {
  const t = tempContent('sources');
  process.env.SHOW_DRAFTS = '1';
  try {
    t.edit('5-2/1/02-03', (l) => {
      l.facts[0].sources = [{ name: '비상교육 교과서', url: 'https://www.vivasam.com/x', accessed: '2026-11-18' }];
      l.facts[1].sources = [{ name: '나무위키', url: 'https://namu.wiki/w/고인돌', accessed: '2026-11-18' }, { name: '어느 블로그', url: 'https://someone.tistory.com/12', accessed: '2026-11-18' }];
      l.media[1].credit.holder = '비상교육';
      l.media[2].credit.source_url = 'https://www.youtube.com/watch?v=x';
      // 읽기 자료와 짧은 글의 source 에 교과서나 교과서 회사 이름
      l.passages[0].source = '초등 사회 5-2 교과서 8쪽의 글을 줄였습니다.';
      l.worksheet.pages[0].blocks[1].source = '천재교육 자료에서';
    });
    assert.deepEqual(sourceIssues(c.loadLesson('5-2/1/02-03')), [
      '사실 f1: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (비상교육 교과서)',
      '사실 f1: 공개 출처로 쓰지 않는 곳입니다 (www.vivasam.com). 기관이 낸 자료를 찾습니다',
      '사실 f2: 공개 출처로 쓰지 않는 곳입니다 (namu.wiki). 기관이 낸 자료를 찾습니다',
      '사실 f2: 공개 출처로 쓰지 않는 곳입니다 (someone.tistory.com). 기관이 낸 자료를 찾습니다',
      'media.stone-line: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (비상교육)',
      'media.sample: 공개 출처로 쓰지 않는 곳입니다 (www.youtube.com). 기관이 낸 자료를 찾습니다',
      'passages.old-rule.source: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (초등 사회 5-2 교과서 8쪽의 글을 줄였습니다.)',
      'worksheet.pages[0].blocks[1].source: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (천재교육 자료에서)',
    ]);
    t.reset();
    // 다른 교과서 회사(이름·주소), 출처의 제목, 누구나 고칠 수 있는 곳
    t.edit('5-2/1/02-03', (l) => {
      l.facts[0].sources = [
        { name: '미래엔', url: 'https://www.mirae-n.com/x', accessed: '2026-11-18' },
        { name: '시험용 기관', title: '비상교육 초등 사회 5-2 교과서 8쪽', url: 'https://example.org/a', accessed: '2026-11-18' },
        { name: 'Visang Education', url: 'https://example.org/b', accessed: '2026-11-18' },
        { name: '위키백과', url: 'https://ko.wikipedia.org/wiki/고인돌', accessed: '2026-11-18' },
        // 공공 기관 자료는 제목에 "교과서"라는 낱말이 있어도 쓸 수 있다
        { name: '우리역사넷', title: '교과서 용어 해설', url: 'https://contents.history.go.kr/x', accessed: '2026-11-18' },
      ];
      l.media[2].credit.source_url = 'https://commons.wikimedia.org/wiki/File:X.jpg';
    });
    assert.deepEqual(sourceIssues(c.loadLesson('5-2/1/02-03')), [
      '사실 f1: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (미래엔)',
      '사실 f1: 공개 출처로 쓰지 않는 곳입니다 (www.mirae-n.com). 기관이 낸 자료를 찾습니다',
      '사실 f1: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (시험용 기관 · 비상교육 초등 사회 5-2 교과서 8쪽)',
      '사실 f1: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (Visang Education)',
      '사실 f1: 공개 출처로 쓰지 않는 곳입니다 (ko.wikipedia.org). 기관이 낸 자료를 찾습니다',
    ]);
    for (const host of ['en.wikipedia.org', 'kin.naver.com', 'brunch.co.kr', 'blog.daum.net', 'm.blog.naver.com', 'www.chunjae.co.kr', 'www.i-scream.co.kr', 'indischool.com']) assert.match(host, DENIED_HOST, host);
    for (const host of ['commons.wikimedia.org', 'www.museum.go.kr', 'contents.history.go.kr', 'www.heritage.go.kr']) assert.doesNotMatch(host, DENIED_HOST, host);
  } finally {
    t.cleanup();
    delete process.env.SHOW_DRAFTS;
  }
});
