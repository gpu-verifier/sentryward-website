import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadResults, RESULTS_URL, embeddedStudy, sourceFileURL, loadInputConfig, validateLatest, catalogURL } from '../js/results-source.mjs';
import { validateResults, summarize, filterRows, analysisSeconds, formatSeconds, freshnessLabel, resultLabel } from '../js/results-model.mjs';
import { performanceLabel } from '../js/sync-removal.mjs';

const catalog = JSON.parse(await readFile(new URL('./fixtures/live-results.json', import.meta.url)));
const digest = content => createHash('sha256').update(content).digest('hex');
const revision = 'a'.repeat(40);
const snapshot = '1'.repeat(64);
const evidenceBase = 'https://evidence.example.org/sentryward/';
const response = data => ({ ok: true, json: async () => structuredClone(data), text: async () => JSON.stringify(data) });
function automated(run = 'run-1') {
  const data = structuredClone(catalog);
  data.publication = { run_id: run, snapshot_id: snapshot, source_revision: revision, source_repository: 'gpu-verifier/sentryward', created_at: '2026-10-21T20:00:00Z', evidence_base_url: evidenceBase };
  for (const row of data.results) {
    row.automation = { state: 'current', verification_key: 'b'.repeat(64), attempted_revision: revision, report_status: 'base' };
    for (const file of Object.values(row.files || {})) Object.assign(file, { revision, sha256: file.sha256 || 'c'.repeat(64) });
  }
  return data;
}
function published(data) {
  return {
    schema: 'sentryward.latest.v1', run_id: data.publication.run_id, snapshot_id: data.publication.snapshot_id, source_revision: data.publication.source_revision,
    catalog_path: `runs/${data.publication.run_id}/${data.publication.snapshot_id}/results.json`, catalog_sha256: digest(JSON.stringify(data)), evidence_base_url: evidenceBase,
  };
}
function snapshotFetcher(data, calls = [], pointer = published(data)) {
  return async (...args) => { calls.push(args); return response(args[0] === RESULTS_URL ? pointer : data); };
}

test('each load follows a fresh pointer and verifies the immutable snapshot bytes', async () => {
  const calls = [];
  const first = automated('run-1');
  const newer = automated('run-2');
  const row = newer.results.find(row => row.result === 'timeout');
  row.result = 'verified';
  newer.counts.timeout--;
  delete newer.counts.timeout;
  newer.counts.verified++;
  assert.equal((await loadResults(snapshotFetcher(first, calls))).publication.run_id, 'run-1');
  assert.equal((await loadResults(snapshotFetcher(newer, calls))).counts.verified, first.counts.verified + 1);
  assert.deepEqual(calls, [
    [RESULTS_URL, { cache: 'no-store', credentials: 'omit', redirect: 'error' }],
    [catalogURL(first.publication, true), { credentials: 'omit', redirect: 'error' }],
    [RESULTS_URL, { cache: 'no-store', credentials: 'omit', redirect: 'error' }],
    [catalogURL(newer.publication, true), { credentials: 'omit', redirect: 'error' }],
  ]);
});

test('a retry of the same logical run loads its new immutable snapshot', async () => {
  const first = automated('same-run');
  const retry = structuredClone(first);
  retry.publication.snapshot_id = '2'.repeat(64);
  const calls = [];
  await loadResults(snapshotFetcher(first, calls));
  await loadResults(snapshotFetcher(retry, calls));
  assert.notEqual(calls[1][0], calls[3][0]);
  assert.equal(calls[3][0], catalogURL(retry.publication, true));
});

test('pointer failures do not fall back to main or an older bundled snapshot', async () => {
  for (const fetcher of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 404 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
    async () => response(catalog),
  ]) {
    let calls = 0;
    await assert.rejects(loadResults(async (...args) => { calls++; return fetcher(...args); }));
    assert.equal(calls, 1);
  }
});

test('snapshot HTTP, hash, count and run identity failures stop publication loading', async () => {
  const data = automated();
  const pointer = published(data);
  await assert.rejects(loadResults(async url => url === RESULTS_URL ? response(pointer) : { ok: false, status: 404 }), /snapshot unavailable/);
  for (const changed of [
    { ...pointer, catalog_sha256: '0'.repeat(64) },
    { ...pointer, source_revision: 'd'.repeat(40) },
    { ...pointer, snapshot_id: '2'.repeat(64), catalog_path: `runs/run-1/${'2'.repeat(64)}/results.json` },
    { ...pointer, evidence_base_url: 'https://other.example.org/' },
  ]) await assert.rejects(loadResults(snapshotFetcher(data, [], changed)));
  const wrongCounts = { ...data, counts: {} };
  await assert.rejects(loadResults(snapshotFetcher(wrongCounts)), /counts/);
});

test('latest pointers restrict their run path and HTTPS evidence prefix', () => {
  const pointer = published(automated());
  for (const changes of [
    { run_id: '../escape' }, { run_id: 123, catalog_path: 'runs/123/results.json' }, { run_id: undefined, catalog_path: 'runs/undefined/results.json' }, { catalog_path: 'examples/results.json' }, { source_revision: 'main' }, { snapshot_id: undefined }, { snapshot_id: '../escape' },
    { evidence_base_url: 'http://example.org/' }, { evidence_base_url: 'https://user:password@example.org/' },
    { evidence_base_url: 'https://example.org/?signed=token' }, { evidence_base_url: 'https://example.org/a/../b' },
  ]) assert.throws(() => validateLatest({ ...pointer, ...changes }));
});

test('catalog accepts sparse records without inventing checks or analysis times', () => {
  const sparse = structuredClone(catalog);
  sparse.results.forEach(row => { delete row.analysis_time_seconds; delete row.analysis_time_source; });
  assert.equal(validateResults(sparse), sparse);
  assert.ok(sparse.results.every(row => row.checks === undefined && analysisSeconds(row) === null));
  assert.throws(() => validateResults({ ...catalog, results: [...catalog.results, catalog.results[0]] }));
  assert.throws(() => validateResults({ ...catalog, schema: 'unknown' }));
  assert.equal(summarize(catalog.results).inconclusive, 2);
  assert.equal(filterRows(catalog.results, { verdict: 'equivalence_not_proven', group: 'inconclusive' }).length, 1);
});

test('both synchronization scenarios come from the live records', () => {
  const study = embeddedStudy(catalog);
  const row = study.results.find(row => row.name === 'tirx-basic-rmsnorm');
  assert.equal(row.recorded.removal.removable, 2);
  assert.equal(row.larger.removal.removable, 1);
  assert.equal(performanceLabel(row.recorded.performance), 'No measurable change');
  assert.equal(performanceLabel(row.larger.performance), '0.9% faster');
  assert.equal(embeddedStudy({ ...catalog, synchronization_removal_study: undefined }), null);
  const invalid = structuredClone(catalog);
  invalid.results.find(row => row.synchronization_removal).synchronization_removal.recorded.removal.removable = 999;
  assert.throws(() => embeddedStudy(invalid));
});

test('input configurations load from the pinned source and verify their hashes', async () => {
  const content = JSON.stringify({ schema: 'spverify.kernel-input/v1', launch: { grid_dim: [1, 1, 1] } });
  const file = { path: 'examples/kernel/input.json', revision, sha256: digest(content) };
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return { ok: true, text: async () => content }; };
  const result = await loadInputConfig(file, fetcher);
  assert.equal(result.content, content);
  assert.deepEqual(result.config.launch.grid_dim, [1, 1, 1]);
  assert.deepEqual(calls[0], [`https://raw.githubusercontent.com/gpu-verifier/sentryward/${revision}/examples/kernel/input.json`, { cache: 'no-store', credentials: 'omit', redirect: 'error' }]);
  await assert.rejects(loadInputConfig({ ...file, sha256: undefined }, fetcher), /SHA-256/);
  await assert.rejects(loadInputConfig({ ...file, sha256: '0'.repeat(64) }, fetcher));
  await assert.rejects(loadInputConfig(file, async () => ({ ok: false, status: 404 })));
});

test('source file links stay within the configured repository', () => {
  const file = { path: 'examples/kernel/input.json', revision };
  assert.equal(sourceFileURL(file), `https://github.com/gpu-verifier/sentryward/blob/${revision}/${file.path}`);
  assert.throws(() => sourceFileURL(file.path));
  assert.throws(() => sourceFileURL({ path: file.path }), /pinned/);
  for (const path of ['', '../secret', '/examples/input.json', 'examples/../input.json', 'https://example.com/input.json', 'examples/a?x', 'examples/a#x']) {
    assert.throws(() => sourceFileURL({ path, revision }));
  }
});

test('live analysis times are loaded, formatted, and sorted without elapsed_seconds', async () => {
  const loaded = await loadResults(snapshotFetcher(automated()));
  assert.ok(loaded.results.every(row => row.elapsed_seconds === undefined));
  for (const row of loaded.results) {
    assert.equal(analysisSeconds(row), row.analysis_time_seconds);
    assert.notEqual(formatSeconds(analysisSeconds(row)), 'Not recorded');
    assert.deepEqual(row.analysis_time_source, catalog.results.find(source => source.name === row.name).analysis_time_source);
  }
  const sorted = filterRows(loaded.results, { sort: 'time' });
  assert.deepEqual(sorted.map(analysisSeconds), loaded.results.map(row => row.analysis_time_seconds).sort((a, b) => b - a));
  assert.equal(formatSeconds(analysisSeconds(sorted.find(row => row.result === 'timeout'))), '8.3 min');
});

test('analysis time prefers the live field and distinguishes zero from absent values', () => {
  const rows = [
    { name: 'a', result: 'verified', analysis_time_seconds: 0, elapsed_seconds: 999 },
    { name: 'b', result: 'verified', analysis_time_seconds: 0.125 },
    { name: 'c', result: 'timeout', analysis_time_seconds: 120 },
    { name: 'd', result: 'verified', elapsed_seconds: 30 },
    { name: 'e', result: 'unsupported' },
    { name: 'f', result: 'unsupported', analysis_time_seconds: null, elapsed_seconds: 50 },
  ];
  assert.deepEqual(filterRows(rows, { sort: 'time' }).map(row => row.name), ['c', 'd', 'b', 'a', 'e', 'f']);
  assert.deepEqual(rows.map(row => formatSeconds(analysisSeconds(row))), ['0.00 s', '0.13 s', '2.0 min', '30.0 s', 'Not recorded', 'Not recorded']);
  for (const value of [-1, '12', NaN, Infinity]) {
    assert.equal(analysisSeconds({ analysis_time_seconds: value }), null);
  }
});


test('automated freshness excludes previous verdicts from current counts and filters', () => {
  const data = automated();
  const row = data.results.find(row => row.result === 'verified');
  row.automation.state = 'deferred_resource';
  data.counts.verified--;
  if (!data.counts.verified) delete data.counts.verified;
  const pending = { name: 'new-kernel', result: null, automation: { state: 'pending', attempted_revision: revision } };
  data.results.push(pending);
  validateResults(data);
  const stats = summarize(data.results);
  assert.equal(stats.awaiting, 2);
  assert.equal(stats.current, data.results.length - 2);
  assert.equal(stats.verified, data.counts.verified || 0);
  assert.ok(!filterRows(data.results, { group: 'verified' }).includes(row));
  assert.ok(!filterRows(data.results, { verdict: 'verified' }).includes(row));
  assert.deepEqual(filterRows(data.results, { group: 'awaiting' }).map(r => r.name).sort(), [row.name, pending.name].sort());
  assert.match(freshnessLabel(row), /high-memory/);
  assert.equal(resultLabel(null), 'No recorded verdict');
  assert.equal(filterRows(data.results, { sort: 'result' })[0].name, pending.name);
  pending.historical = { result: 'timeout', diagnostics: [{ code: 'old_memory_detail' }] };
  assert.deepEqual(filterRows(data.results, { search: 'old_memory_detail' }), [pending]);
  pending.automation.state = 'current';
  assert.throws(() => validateResults(data), /identity or freshness/);
});

test('pinned inputs require a hash and never read a floating branch', async () => {
  const publication = automated().publication;
  const content = JSON.stringify({ schema: 'spverify.kernel-input/v1', launch: { block_dim: [32, 1, 1] } });
  const file = { path: 'examples/kernel/input.json', revision, sha256: digest(content) };
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return { ok: true, text: async () => content }; };
  await loadInputConfig(file, fetcher, publication);
  assert.equal(calls[0][0], `https://raw.githubusercontent.com/gpu-verifier/sentryward/${revision}/examples/kernel/input.json`);
  await assert.rejects(loadInputConfig({ ...file, sha256: undefined }, fetcher, publication), /SHA-256/);
  await assert.rejects(loadInputConfig({ ...file, revision: undefined }, fetcher, publication), /pinned/);
  await assert.rejects(loadInputConfig({ ...file, sha256: '0'.repeat(64) }, fetcher, publication), /recorded hash/);
});

test('evidence links stay within the exact published storage prefix or pinned source', () => {
  const publication = automated().publication;
  const file = { path: 'output.json', sha256: 'c'.repeat(64), url: `${evidenceBase}objects/${'c'.repeat(64)}/output.json` };
  assert.equal(sourceFileURL(file, true, publication), file.url);
  for (const url of [
    'https://evidence.example.org/sentryward-other/output.json',
    'https://evidence.example.org/sentryward/../secret',
    'https://evidence.example.org/sentryward/%2e%2e/secret',
    'https://evidence.example.org.evil.test/sentryward/output.json',
    'https://evidence.example.org/sentryward/output.json?token=secret',
    'https://github.com/gpu-verifier/sentryward/blob/main/output.json',
    'javascript:alert(1)',
  ]) assert.throws(() => sourceFileURL({ ...file, url }, false, publication));
  assert.equal(sourceFileURL({ path: 'corpus/a.ptx', revision }, false, publication), `https://github.com/gpu-verifier/sentryward/blob/${revision}/corpus/a.ptx`);
  const report = { path: `runs/run-1/${snapshot}/reports/kernel/report.md`, sha256: 'c'.repeat(64) };
  assert.equal(sourceFileURL(report, false, publication, true), `https://github.com/gpu-verifier/sentryward/blob/results/runs/run-1/${snapshot}/reports/kernel/report.md`);
  assert.throws(() => sourceFileURL({ ...report, path: `runs/old/${snapshot}/reports/kernel/report.md` }, false, publication, true));
  assert.throws(() => sourceFileURL({ ...report, path: `runs/run-1/${'2'.repeat(64)}/reports/kernel/report.md` }, false, publication, true));
  assert.throws(() => sourceFileURL(report, false, { ...publication, snapshot_id: undefined }, true));
});

test('unversioned and hashless snapshot file records cannot be displayed as evidence', async () => {
  for (const field of ['revision', 'sha256']) {
    const data = automated();
    delete data.results[0].files.input[field];
    await assert.rejects(loadResults(snapshotFetcher(data)));
  }
});

test('a new automated snapshot preserves the historical synchronization study identity', async () => {
  const data = automated('new-verifier-run');
  const studyBefore = embeddedStudy(catalog);
  const loaded = await loadResults(snapshotFetcher(data));
  assert.deepEqual(embeddedStudy(loaded), studyBefore);
  assert.notEqual(embeddedStudy(loaded).source.revision, loaded.publication.source_revision);
});


test('explicit pinned GitHub links resolve to raw bytes for input loading', async () => {
  const publication = automated().publication;
  const path = 'examples/kernel/input.json';
  const content = JSON.stringify({ schema: 'spverify.kernel-input/v1' });
  const blobURL = `https://github.com/gpu-verifier/sentryward/blob/${revision}/${path}`;
  const rawURL = `https://raw.githubusercontent.com/gpu-verifier/sentryward/${revision}/${path}`;
  const file = { path, revision, url: blobURL, sha256: digest(content) };
  await loadInputConfig(file, async url => { assert.equal(url, rawURL); return { ok: true, text: async () => content }; }, publication);
  assert.equal(sourceFileURL({ ...file, url: undefined, raw_url: rawURL }, false, publication), blobURL);
});

test('unknown verifier categories are preserved without confusing object property names', () => {
  const data = automated();
  data.results = [{ name: 'future-kernel', result: '__proto__', automation: { state: 'current', attempted_revision: revision, verification_key: 'b'.repeat(64) } }];
  data.counts = JSON.parse('{"__proto__":1}');
  validateResults(data);
  const stats = summarize(data.results);
  assert.equal(stats.other, 1);
  assert.equal(stats.counts.__proto__, 1);
});
