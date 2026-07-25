import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildSiteData, checkSiteData } from '../scripts/build-site-data.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const INDEX_PATH = 'site/data/index.json';
const SUBJECT_PREFIX = 'site/data/subjects/';

/** 뷰어가 노출해도 되는 주제 필드. 공식 성취기준 원문 계열 필드는 여기에 없어야 한다. */
const ALLOWED_TOPIC_FIELDS = new Set([
  'id',
  'type',
  'titleKorean',
  'titleEnglish',
  'summary',
  'description',
  'evidence',
  'assessmentPrompt',
  'subjectKorean',
  'domainKorean',
  'gradeBand',
  'ageRangeStart',
  'ageRangeEnd',
  'curriculumAreaKorean',
  'strandKorean',
  'unit',
  'module',
  'focus',
  'lifeQuestionKorean',
  'officialAreaKorean',
  'standards',
  'sourceRefs',
  'sourceLocator',
  'verificationStatus',
  'generationBasis',
  'provenanceEvidence',
]);

const source = (name) => JSON.parse(readFileSync(resolve(ROOT, 'data', 'kr', name), 'utf8'));
const artifacts = await buildSiteData({ rootDir: ROOT });
const index = JSON.parse(artifacts.files[INDEX_PATH]);
const subjectFiles = Object.entries(artifacts.files)
  .filter(([path]) => path.startsWith(SUBJECT_PREFIX))
  .map(([path, contents]) => [path, JSON.parse(contents)]);

/** data/, package.json 은 원본을 그대로 참조하고 site/data 만 복사한 임시 루트. */
function fixtureRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'korean-elementary-learning-map-site-test-'));
  symlinkSync(resolve(ROOT, 'data'), join(dir, 'data'));
  symlinkSync(resolve(ROOT, 'package.json'), join(dir, 'package.json'));
  mkdirSync(join(dir, 'site'));
  cpSync(resolve(ROOT, 'site', 'data'), join(dir, 'site', 'data'), { recursive: true });
  return dir;
}

test('generated counts match the canonical KR dataset', () => {
  const manifest = source('manifest.json');
  assert.equal(artifacts.counts.topics, manifest.counts.topics);
  assert.equal(artifacts.counts.edges, manifest.counts.dependencies);
  assert.equal(artifacts.counts.clusters, manifest.counts.clusters);
  assert.equal(artifacts.counts.standards, manifest.counts.standards);
  assert.equal(index.topics.length, manifest.counts.topics);
  assert.equal(index.edges.length, manifest.counts.dependencies);
  assert.equal(index.clusters.length, manifest.counts.clusters);
  assert.equal(index.taxonomyVersion, manifest.taxonomyVersion);
  assert.equal(index.generatedAt, manifest.generatedAt);
});

test('committed site data is current', async () => {
  await checkSiteData({ rootDir: ROOT });
});

test('every prerequisite endpoint resolves and stays inside one subject', () => {
  const topicById = new Map(index.topics.map((topic) => [topic.id, topic]));
  for (const edge of index.edges) {
    const to = topicById.get(edge.topicId);
    const from = topicById.get(edge.prerequisiteId);
    assert.ok(to, `unknown topic: ${edge.topicId}`);
    assert.ok(from, `unknown prerequisite: ${edge.prerequisiteId}`);
    assert.equal(from.subject, to.subject, `cross-subject edge: ${edge.prerequisiteId} -> ${edge.topicId}`);
    assert.ok(['hard', 'soft'].includes(edge.strength));
  }
});

test('cluster membership is complete and the primary cluster contains the topic', () => {
  const clusterById = new Map(index.clusters.map((cluster) => [cluster.id, cluster]));
  const memberships = new Map(index.topics.map((topic) => [topic.id, new Set()]));
  for (const cluster of index.clusters) {
    assert.equal(cluster.topics.length, cluster.topicCount);
    for (const topicId of cluster.topics) {
      assert.ok(memberships.has(topicId), `cluster ${cluster.id} references unknown topic ${topicId}`);
      memberships.get(topicId).add(cluster.id);
    }
  }

  for (const topic of index.topics) {
    const actual = memberships.get(topic.id);
    assert.ok(actual.size > 0, `topic without a cluster: ${topic.id}`);
    assert.deepEqual(new Set(topic.clusterIds), actual);
    assert.equal(topic.clusterIds[0], topic.clusterId);
    assert.ok(clusterById.get(topic.clusterId).topics.includes(topic.id));
  }

  // 클러스터는 주제를 분할하지 않는다. 겹침이 사라지면 대표 클러스터 선택 규칙을 다시 봐야 한다.
  const overlapping = index.topics.filter((topic) => topic.clusterIds.length > 1);
  assert.ok(overlapping.length > 0, 'expected overlapping cluster membership to still exist');
});

test('subject files partition the topics exactly once', () => {
  const seen = new Set();
  for (const [, payload] of subjectFiles) {
    for (const topic of payload.topics) {
      assert.equal(seen.has(topic.id), false, `topic duplicated across subject files: ${topic.id}`);
      seen.add(topic.id);
    }
  }
  assert.equal(seen.size, index.topics.length);
  for (const topic of index.topics) {
    assert.ok(seen.has(topic.id), `topic missing from subject files: ${topic.id}`);
  }
});

test('subject detail carries no official standard wording', () => {
  const standardsFile = source('curriculum-standards.json');
  assert.equal(standardsFile.textPolicy.standardTextIncluded, false);
  assert.equal(index.textPolicy.standardTextIncluded, false);

  for (const [path, payload] of subjectFiles) {
    for (const topic of payload.topics) {
      for (const field of Object.keys(topic)) {
        assert.ok(ALLOWED_TOPIC_FIELDS.has(field), `${path} exposes unexpected topic field: ${field}`);
      }
    }
    for (const standard of payload.standards) {
      assert.equal('officialText' in standard, false, `${path} exposes officialText`);
      assert.equal('text' in standard, false, `${path} exposes text`);
    }
  }
});

test('detail edges cover every prerequisite exactly once', () => {
  const detailEdges = subjectFiles.flatMap(([, payload]) => payload.edges);
  assert.equal(detailEdges.length, index.edges.length);
  const keys = new Set(detailEdges.map((edge) => `${edge.prerequisiteId} ${edge.topicId}`));
  for (const edge of index.edges) {
    assert.ok(keys.has(`${edge.prerequisiteId} ${edge.topicId}`));
  }
});

test('--check rejects stale, missing, and unexpected site data', async (t) => {
  const dir = fixtureRoot();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const indexPath = join(dir, INDEX_PATH);
  const original = readFileSync(indexPath, 'utf8');

  writeFileSync(indexPath, original.replace('"topics"', '"topicsRenamed"'));
  await assert.rejects(checkSiteData({ rootDir: dir }), /stale/);

  writeFileSync(indexPath, original);
  rmSync(join(dir, SUBJECT_PREFIX, 'math.json'));
  await assert.rejects(checkSiteData({ rootDir: dir }), /missing/);

  cpSync(resolve(ROOT, SUBJECT_PREFIX, 'math.json'), join(dir, SUBJECT_PREFIX, 'math.json'));
  writeFileSync(join(dir, SUBJECT_PREFIX, 'leftover.json'), '{}\n');
  await assert.rejects(checkSiteData({ rootDir: dir }), /unexpected file/);

  rmSync(join(dir, SUBJECT_PREFIX, 'leftover.json'));
  await checkSiteData({ rootDir: dir });
});
