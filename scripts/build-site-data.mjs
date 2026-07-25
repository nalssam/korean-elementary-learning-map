#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ONTOLOGY_VERSION } from './build-ontology.mjs';

const SITE_DATA_DIR = 'site/data';
const INDEX_PATH = `${SITE_DATA_DIR}/index.json`;
const PROVENANCE_PATH = `${SITE_DATA_DIR}/provenance.json`;
const SUBJECT_DIR = `${SITE_DATA_DIR}/subjects`;

const GRADE_BAND_ORDER = ['1-2', '3-4', '5-6', '3-6', '1-6'];

/**
 * 클러스터는 주제를 분할하지 않는다. 수학 363개 주제는 학년-영역·수직 진행·학년군 전체 클러스터에
 * 동시에 속하고, 도덕 120개 주제는 학년-영역과 영역 연속체에 함께 속한다. 뷰어가 "대표 클러스터"를
 * 결정적으로 고르도록 좁은 범위부터 우선순위를 둔다.
 */
const CLUSTER_TYPE_PRIORITY = [
  'grade-unit',
  'grade-domain',
  'subject-cluster',
  'domain-continuum',
  'vertical-domain-progression',
  'grade-band-overview',
];

/** Topic detail fields the viewer renders. Official standard wording is never among them. */
const TOPIC_DETAIL_FIELDS = [
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
];

const STANDARD_DETAIL_FIELDS = [
  'key',
  'code',
  'subjectKorean',
  'domainKorean',
  'gradeBand',
  'summary',
  'evidence',
  'sourceRefs',
  'sourceSection',
  'sourceLocator',
  'sourceId',
  'sourcePage',
  'sourceSha256',
  'sourceEvidence',
  'verificationStatus',
  'verificationNotes',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function serialize(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function pick(record, fields) {
  return Object.fromEntries(fields.filter((field) => field in record).map((field) => [field, record[field]]));
}

function workstreamSlug(workstreamFile) {
  if (typeof workstreamFile !== 'string' || !workstreamFile.endsWith('.json')) {
    throw new Error(`unsupported workstream file: ${workstreamFile}`);
  }
  return workstreamFile.slice(0, -'.json'.length);
}

/** `domainKorean` is absent on the English EFL topics; `sourceStandardCode` on roughly half of all topics. */
function topicDomain(topic) {
  return topic.domainKorean ?? topic.domain;
}

function topicStandardCode(topic) {
  if (topic.sourceStandardCode) return topic.sourceStandardCode;
  const [first] = topic.standards ?? [];
  if (typeof first !== 'string') return null;
  const code = first.slice(first.indexOf(':') + 1);
  return code.length > 0 ? code : null;
}

function compareGradeBands(left, right) {
  const leftIndex = GRADE_BAND_ORDER.indexOf(left);
  const rightIndex = GRADE_BAND_ORDER.indexOf(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.localeCompare(right);
}

async function readJson(rootDir, relativePath) {
  return JSON.parse(await readFile(resolve(rootDir, relativePath), 'utf8'));
}

export async function buildSiteData({ rootDir }) {
  const dataDir = 'data/kr';
  const manifest = await readJson(rootDir, `${dataDir}/manifest.json`);
  const packageJson = await readJson(rootDir, 'package.json');
  const topicsFile = await readJson(rootDir, `${dataDir}/topics.json`);
  const dependenciesFile = await readJson(rootDir, `${dataDir}/dependencies.json`);
  const clustersFile = await readJson(rootDir, `${dataDir}/clusters.json`);
  const standardsFile = await readJson(rootDir, `${dataDir}/curriculum-standards.json`);

  const topics = topicsFile.topics;
  const dependencies = dependenciesFile.dependencies;
  const clusters = clustersFile.clusters;

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));

  const clusterRank = (clusterId) => {
    const cluster = clusterById.get(clusterId);
    const priority = CLUSTER_TYPE_PRIORITY.indexOf(cluster.clusterType ?? 'subject-cluster');
    return [priority < 0 ? CLUSTER_TYPE_PRIORITY.length : priority, cluster.topicCount, cluster.id];
  };

  const clusterIdsByTopic = new Map();
  for (const cluster of clusters) {
    for (const topicId of cluster.topics) {
      if (!clusterIdsByTopic.has(topicId)) clusterIdsByTopic.set(topicId, new Set());
      clusterIdsByTopic.get(topicId).add(cluster.id);
    }
  }
  for (const [topicId, ids] of clusterIdsByTopic) {
    clusterIdsByTopic.set(
      topicId,
      [...ids].sort((left, right) => {
        const [leftPriority, leftSize, leftId] = clusterRank(left);
        const [rightPriority, rightSize, rightId] = clusterRank(right);
        return leftPriority - rightPriority || leftSize - rightSize || leftId.localeCompare(rightId);
      }),
    );
  }

  for (const topic of topics) {
    if (!clusterIdsByTopic.has(topic.id)) {
      throw new Error(`topic is not a member of any cluster: ${topic.id}`);
    }
  }
  for (const edge of dependencies) {
    for (const endpoint of [edge.topicId, edge.prerequisiteId]) {
      if (!topicById.has(endpoint)) throw new Error(`dependency endpoint is unknown: ${endpoint}`);
    }
  }

  const standards = standardsFile.curricula.flatMap((curriculum) => curriculum.standards);

  const topicIndex = topics
    .map((topic) => ({
      id: topic.id,
      title: topic.titleKorean,
      subject: topic.subjectKorean,
      gradeBand: topic.gradeBand,
      domain: topicDomain(topic),
      standardCode: topicStandardCode(topic),
      clusterId: clusterIdsByTopic.get(topic.id)[0],
      clusterIds: clusterIdsByTopic.get(topic.id),
      workstream: workstreamSlug(topic.workstreamFile),
      type: topic.type,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const clusterIndex = clusters
    .map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      subject: cluster.subjectKorean,
      gradeBand: cluster.gradeBand,
      domain: cluster.domainKorean,
      clusterType: cluster.clusterType ?? 'subject-cluster',
      workstream: workstreamSlug(cluster.workstreamFile),
      topicCount: cluster.topicCount,
      topics: cluster.topics,
      summary: cluster.summary,
      parentSummary: cluster.parentSummary,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const edgeIndex = dependencies
    .map((edge) => ({
      topicId: edge.topicId,
      prerequisiteId: edge.prerequisiteId,
      strength: edge.strength,
    }))
    .sort(
      (left, right) =>
        left.topicId.localeCompare(right.topicId) ||
        left.prerequisiteId.localeCompare(right.prerequisiteId),
    );

  const subjectGroups = new Map();
  for (const topic of topicIndex) {
    if (!subjectGroups.has(topic.subject)) {
      subjectGroups.set(topic.subject, {
        subject: topic.subject,
        workstream: topic.workstream,
        topicCount: 0,
        clusterCount: 0,
        standardCount: 0,
        gradeBands: {},
      });
    }
    const group = subjectGroups.get(topic.subject);
    group.topicCount += 1;
    group.gradeBands[topic.gradeBand] = (group.gradeBands[topic.gradeBand] ?? 0) + 1;
  }
  for (const cluster of clusterIndex) {
    const group = subjectGroups.get(cluster.subject);
    if (group) group.clusterCount += 1;
  }
  for (const standard of standards) {
    const group = subjectGroups.get(standard.subjectKorean);
    if (group) group.standardCount += 1;
  }

  const subjects = [...subjectGroups.values()].sort(
    (left, right) => right.topicCount - left.topicCount || left.subject.localeCompare(right.subject),
  );

  const gradeBands = [...new Set(topicIndex.map((topic) => topic.gradeBand))].sort(compareGradeBands);

  const index = {
    dataset: manifest.dataset,
    taxonomyVersion: manifest.taxonomyVersion,
    ontologyVersion: ONTOLOGY_VERSION,
    generatedAt: manifest.generatedAt,
    repositoryUrl: packageJson.homepage.replace(/#readme$/, ''),
    locale: manifest.locale,
    counts: manifest.counts,
    graphPolicy: manifest.graphPolicy,
    textPolicy: standardsFile.textPolicy,
    gradeBands,
    subjects,
    clusters: clusterIndex,
    topics: topicIndex,
    edges: edgeIndex,
  };

  const workstreams = [...new Set(topicIndex.map((topic) => topic.workstream))].sort();
  const edgesByWorkstream = new Map(workstreams.map((workstream) => [workstream, []]));
  for (const edge of dependencies) {
    const workstream = workstreamSlug(topicById.get(edge.topicId).workstreamFile);
    edgesByWorkstream.get(workstream).push({
      topicId: edge.topicId,
      prerequisiteId: edge.prerequisiteId,
      strength: edge.strength,
      reason: edge.reason,
      basis: edge.basis,
      source: edge.source,
    });
  }

  const files = { [INDEX_PATH]: serialize(index) };

  for (const workstream of workstreams) {
    const workstreamTopics = topics
      .filter((topic) => workstreamSlug(topic.workstreamFile) === workstream)
      .map((topic) => pick(topic, TOPIC_DETAIL_FIELDS))
      .sort((left, right) => left.id.localeCompare(right.id));
    const workstreamStandards = standards
      .filter((standard) => workstreamSlug(standard.workstreamFile) === workstream)
      .map((standard) => pick(standard, STANDARD_DETAIL_FIELDS))
      .sort((left, right) => left.key.localeCompare(right.key));
    const workstreamEdges = edgesByWorkstream.get(workstream).sort(
      (left, right) =>
        left.topicId.localeCompare(right.topicId) ||
        left.prerequisiteId.localeCompare(right.prerequisiteId),
    );

    files[`${SUBJECT_DIR}/${workstream}.json`] = serialize({
      workstream,
      taxonomyVersion: manifest.taxonomyVersion,
      topics: workstreamTopics,
      standards: workstreamStandards,
      edges: workstreamEdges,
    });
  }

  files[PROVENANCE_PATH] = serialize({
    taxonomyVersion: manifest.taxonomyVersion,
    verificationStatus: manifest.verificationStatus,
    textPolicy: standardsFile.textPolicy,
    sourceBasis: standardsFile.sourceBasis,
    sources: standardsFile.sources,
    curricula: standardsFile.curricula.map((curriculum) =>
      pick(curriculum, [
        'id',
        'subjectKorean',
        'name',
        'version',
        'sourceIds',
        'sourceUrls',
        'license',
        'verificationStatus',
        'standardCount',
      ]),
    ),
    coverageGaps: standardsFile.coverageGaps,
  });

  return {
    files,
    counts: {
      topics: topicIndex.length,
      clusters: clusterIndex.length,
      edges: edgeIndex.length,
      standards: standards.length,
      subjects: subjects.length,
      workstreams: workstreams.length,
      coverageGaps: standardsFile.coverageGaps.length,
    },
  };
}

export async function writeSiteData({ rootDir }) {
  const artifacts = await buildSiteData({ rootDir });
  await mkdir(resolve(rootDir, SUBJECT_DIR), { recursive: true });

  const expected = new Set(
    Object.keys(artifacts.files)
      .filter((path) => path.startsWith(`${SUBJECT_DIR}/`))
      .map((path) => path.slice(SUBJECT_DIR.length + 1)),
  );
  for (const entry of await readdir(resolve(rootDir, SUBJECT_DIR))) {
    if (!expected.has(entry)) await rm(resolve(rootDir, SUBJECT_DIR, entry));
  }

  for (const [relativePath, contents] of Object.entries(artifacts.files)) {
    const target = resolve(rootDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  return artifacts;
}

export async function checkSiteData({ rootDir }) {
  const artifacts = await buildSiteData({ rootDir });
  const mismatches = [];

  for (const [relativePath, expected] of Object.entries(artifacts.files)) {
    let actual;
    try {
      actual = await readFile(resolve(rootDir, relativePath), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        mismatches.push(`${relativePath}: missing`);
        continue;
      }
      throw error;
    }
    if (actual !== expected) {
      mismatches.push(
        `${relativePath}: expected ${sha256(expected)} (${Buffer.byteLength(expected, 'utf8')} bytes), ` +
          `found ${sha256(actual)} (${Buffer.byteLength(actual, 'utf8')} bytes)`,
      );
    }
  }

  let present = [];
  try {
    present = await readdir(resolve(rootDir, SUBJECT_DIR));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const entry of present) {
    if (!(`${SUBJECT_DIR}/${entry}` in artifacts.files)) {
      mismatches.push(`${SUBJECT_DIR}/${entry}: unexpected file`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `generated site data is missing or stale; run npm run build:site\n${mismatches
        .map((mismatch) => `- ${mismatch}`)
        .join('\n')}`,
    );
  }

  return artifacts;
}

function printSummary(artifacts, action) {
  const { counts } = artifacts;
  console.log(
    `Site data ${action} (${counts.topics} topics, ${counts.edges} prerequisites, ` +
      `${counts.clusters} clusters, ${counts.standards} standards):`,
  );
  for (const relativePath of Object.keys(artifacts.files).sort()) {
    const contents = artifacts.files[relativePath];
    console.log(`- ${relativePath}: ${Buffer.byteLength(contents, 'utf8')} bytes, sha256 ${sha256(contents)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const checkOnly = process.argv.includes('--check');
  const artifacts = checkOnly ? await checkSiteData({ rootDir }) : await writeSiteData({ rootDir });
  printSummary(artifacts, checkOnly ? 'is current' : 'built');
}
