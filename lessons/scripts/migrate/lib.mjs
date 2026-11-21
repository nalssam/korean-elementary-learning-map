// 형식 옮기기 스크립트(v<N>-to-v<N+1>.mjs)가 같이 쓰는 도우미. 쓰는 법은 README.md 에 있다.
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { ROOT } from '#lib/content.ts';

/**
 * 옮겨야 하는 명세 파일 전부: content/ 의 차시표와 명세, 그리고 tests/<담당>/fixtures/ 아래의 것.
 * CONTENT_DIR 을 따르지 않는다. 옮기기는 저장소에 있는 명세를 모두 고치는 일이다.
 */
export function specFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); }
      else if (e.name === 'lesson.yaml' || e.name === 'registry.yaml') out.push(p);
    }
  };
  walk(path.join(root, 'content'));
  const tests = path.join(root, 'tests');
  if (fs.existsSync(tests)) for (const owner of fs.readdirSync(tests)) walk(path.join(tests, owner, 'fixtures'));
  return out.sort();
}

/** 명세 하나를 고쳐 쓴다. change(doc) 는 parseDocument 의 문서를 고친다. 주석과 적은 꼴은 남는다. 바뀐 것이 있으면 true */
export function rewrite(file, change) {
  const before = fs.readFileSync(file, 'utf8');
  const doc = parseDocument(before);
  change(doc);
  const after = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}
