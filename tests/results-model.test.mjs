import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateSnapshot, summarize, filterRows, libraryOf, peakMemoryMiB, formatSeconds, formatMemory } from '../js/results-model.mjs';

const raw = await readFile(new URL('../data/kernel-verification-results.json', import.meta.url));
const snapshot = JSON.parse(raw);
const source = JSON.parse(await readFile(new URL('../data/verification-source.json', import.meta.url)));

test('published snapshot matches its recorded digest and result counts', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256);
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.deepEqual(summarize(snapshot.results).counts, snapshot.counts);
});

test('invalid snapshots cannot silently produce misleading totals', () => {
  assert.throws(() => validateSnapshot({ ...snapshot, counts: {} }));
  assert.throws(() => validateSnapshot({ ...snapshot, results: [snapshot.results[0], snapshot.results[0]] }));
  assert.throws(() => validateSnapshot({ ...snapshot, schema: 'unknown' }));
});

test('summary preserves incomplete analyses separately from reported findings', () => {
  const rows = ['verified', 'potential_race', 'invalid_lifecycle', 'not_wellsynced', 'unsupported',
    'timeout', 'memory_budget_exceeded', 'analysis_budget_exceeded', 'future_verdict'].map(result => ({ result }));
  const stats = summarize(rows);
  assert.equal(stats.total, 9);
  assert.equal(stats.verified, 1);
  assert.equal(stats.findings, 3);
  assert.equal(stats.inconclusive, 4);
  assert.equal(stats.other, 1);
});

test('search intersects library, result, and group filters without mutating data', () => {
  const original = snapshot.results.map(row => row.name);
  const filtered = filterRows(snapshot.results, { search: 'SPARSE', library: 'CUTLASS', verdict: 'potential_race', group: 'findings' });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(row => row.name.includes('sparse') && row.result === 'potential_race' && libraryOf(row.name) === 'CUTLASS'));
  assert.deepEqual(snapshot.results.map(row => row.name), original);
  assert.equal(filterRows(snapshot.results, { search: 'there-is-no-such-kernel-123' }).length, 0);
});

test('diagnostic search and family disambiguation work', () => {
  assert.ok(filterRows(snapshot.results, { search: 'conflicting_accesses_unordered' }).length > 0);
  assert.equal(libraryOf('tritongluon-08-ws-matmul-512'), 'Triton Gluon');
  assert.equal(libraryOf('triton__triton_ws.exact-3.8.0__sm_100a'), 'Triton');
});

test('numeric sorting puts absent measurements last and breaks ties by name', () => {
  const rows = [
    { name: 'b', result: 'timeout', elapsed_seconds: 20 },
    { name: 'c', result: 'unsupported', elapsed_seconds: null },
    { name: 'a', result: 'verified', elapsed_seconds: 20 },
    { name: 'd', result: 'verified', elapsed_seconds: 0 },
  ];
  assert.deepEqual(filterRows(rows, { sort: 'time' }).map(row => row.name), ['a', 'b', 'd', 'c']);
  assert.equal(formatSeconds(null), 'Not recorded');
  assert.equal(formatMemory(undefined), 'Not recorded');
  assert.equal(formatSeconds(0), '0.00 s');
});

test('memory display and sorting accept automated and historical measurements', () => {
  const rows = [
    { name: 'missing', result: 'unsupported' },
    { name: 'legacy', result: 'verified', native_peak_rss_mib: 512 },
    { name: 'automated', result: 'potential_race', peak_rss_mib: 1024 },
    { name: 'zero', result: 'verified', peak_rss_mib: 0 },
  ];
  assert.deepEqual(filterRows(rows, { sort: 'memory' }).map(row => row.name), ['automated', 'legacy', 'zero', 'missing']);
  assert.equal(formatMemory(peakMemoryMiB(rows[2])), '1,024 MiB');
  assert.equal(peakMemoryMiB({ peak_rss_mib: 128, native_peak_rss_mib: 512 }), 128);
  assert.equal(peakMemoryMiB({ peak_rss_mib: null, native_peak_rss_mib: 512 }), null);
  assert.equal(peakMemoryMiB({ peak_rss_mib: -1 }), null);
  assert.equal(peakMemoryMiB({ peak_rss_mib: '512' }), null);
});
