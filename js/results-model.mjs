import { runtimeReduction } from './sync-removal.mjs';

export const VERDICTS = {
  verified: { label: 'Verified', group: 'verified' },
  potential_race: { label: 'Potential race', group: 'findings' },
  invalid_lifecycle: { label: 'Invalid lifecycle', group: 'findings' },
  not_wellsynced: { label: 'Not well-synchronized', group: 'findings' },
  undefined_behavior: { label: 'Undefined behavior', group: 'findings' },
  unsupported: { label: 'Unsupported', group: 'inconclusive' },
  equivalence_not_proven: { label: 'Equivalence not proven', group: 'inconclusive' },
  memory_budget_exceeded: { label: 'Memory limit', group: 'inconclusive' },
  timeout: { label: 'Timeout', group: 'inconclusive' },
  analysis_budget_exceeded: { label: 'Analysis limit', group: 'inconclusive' },
};

const LIBRARIES = [
  ['cutlass', 'CUTLASS'], ['deepgemm', 'DeepGEMM'],
  ['flash_attention', 'FlashAttention'], ['flashinfer', 'FlashInfer'],
  ['flashmla', 'FlashMLA'], ['pytorch', 'PyTorch'],
  ['tensorrt_llm', 'TensorRT-LLM'], ['thunderkittens', 'ThunderKittens'],
  ['tilelang', 'TileLang'], ['tirx', 'TIRx'],
  ['tritongluon', 'Triton Gluon'], ['triton', 'Triton'], ['vllm', 'vLLM'],
];

export function libraryOf(name) {
  return LIBRARIES.find(([prefix]) => name.toLowerCase().startsWith(prefix))?.[1] || 'Other';
}

export function displayName(name) {
  const prefix = LIBRARIES.find(([key]) => name.toLowerCase().startsWith(key))?.[0];
  let short = name.replace(/(__sm_\d+[a-z]?|\.compute_\d+[a-z]?)$/, '');
  if (prefix) short = short.slice(prefix.length).replace(/^[-_]+/, '');
  return short.replace(/__/g, ' / ').replace(/[_-]/g, ' ') || name;
}

export function validateSnapshot(data) {
  if (data?.schema !== 'sentryward.kernel-results-snapshot.v1' || !Array.isArray(data.results) || !data.results.length) {
    throw new Error('Unsupported or empty snapshot.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot_date) || !/^[0-9a-f]{40}$/.test(data.worktree_base)) {
    throw new Error('Missing snapshot provenance.');
  }
  const names = new Set();
  const counts = {};
  for (const row of data.results) {
    if (typeof row.name !== 'string' || !row.name || names.has(row.name) || typeof row.result !== 'string' || !row.checks) {
      throw new Error('Invalid or duplicate kernel record.');
    }
    names.add(row.name);
    counts[row.result] = (counts[row.result] || 0) + 1;
  }
  const keys = new Set([...Object.keys(counts), ...Object.keys(data.counts || {})]);
  if (!data.counts || [...keys].some(key => (counts[key] || 0) !== data.counts[key])) {
    throw new Error('Snapshot counts do not match its records.');
  }
  return data;
}

// Optional measurements and per-check outcomes may be absent from the live catalog.
export function validateResults(data) {
  if (data?.schema !== 'sentryward.kernel-results.v1' || !Array.isArray(data.results) || !data.results.length) {
    throw new Error('Unsupported or empty results catalog.');
  }
  const source = data.verification_results_source;
  if (source?.repository !== 'gpu-verifier/sentryward' || !/^[0-9a-f]{40}$/.test(source.revision) ||
      typeof source.path !== 'string' || !/^[0-9a-f]{64}$/.test(source.sha256)) {
    throw new Error('Missing results provenance.');
  }
  const names = new Set();
  const counts = {};
  for (const row of data.results) {
    if (typeof row.name !== 'string' || !row.name || names.has(row.name) || typeof row.result !== 'string' || !row.result ||
        (row.diagnostics !== undefined && !Array.isArray(row.diagnostics))) {
      throw new Error('Invalid or duplicate kernel record.');
    }
    names.add(row.name);
    counts[row.result] = (counts[row.result] || 0) + 1;
  }
  const keys = new Set([...Object.keys(counts), ...Object.keys(data.counts || {})]);
  if (!data.counts || [...keys].some(key => (counts[key] || 0) !== data.counts[key])) {
    throw new Error('Result counts do not match their records.');
  }
  return data;
}

export function summarize(rows) {
  const stats = { total: rows.length, verified: 0, findings: 0, inconclusive: 0, other: 0, conditional: 0, counts: {} };
  for (const row of rows) {
    stats[VERDICTS[row.result]?.group || 'other']++;
    stats.counts[row.result] = (stats.counts[row.result] || 0) + 1;
    if (row.analysis_scope) stats.conditional++;
  }
  return stats;
}

export function filterRows(rows, { search = '', library = '', verdict = '', group = '', sort = 'name', scenario = 'recorded', withStudy = false } = {}) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = rows.filter(row => {
    if (withStudy && row.syncStudy?.[scenario]?.removal.status !== 'measured') return false;
    if (library && libraryOf(row.name) !== library) return false;
    if (verdict && row.result !== verdict) return false;
    if (group && (VERDICTS[row.result]?.group || 'other') !== group) return false;
    const text = [row.name, displayName(row.name), libraryOf(row.name), row.result,
      VERDICTS[row.result]?.label || '', ...(row.diagnostics || []).map(d => d.code)].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
  const numeric = (a, b) => (Number.isFinite(b) ? b : -Infinity) - (Number.isFinite(a) ? a : -Infinity);
  return filtered.sort((a, b) => {
    let order = 0;
    if (sort === 'time') order = numeric(analysisSeconds(a), analysisSeconds(b));
    if (sort === 'memory') order = numeric(a.native_peak_rss_mib, b.native_peak_rss_mib);
    if (sort === 'removable' || sort === 'improvement') {
      const metric = row => sort === 'removable' ? row.syncStudy?.[scenario]?.removal.removable : runtimeReduction(row.syncStudy?.[scenario]?.performance);
      const left = metric(a), right = metric(b);
      order = (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
    }
    if (sort === 'result') order = a.result.localeCompare(b.result);
    return order || a.name.localeCompare(b.name);
  });
}

export function resultLabel(value) { return VERDICTS[value]?.label || value.replace(/_/g, ' '); }
export function analysisSeconds(row) {
  // Prefer the catalog's analysis time; retain support for historical snapshots.
  const value = row.analysis_time_seconds !== undefined ? row.analysis_time_seconds : row.elapsed_seconds;
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function formatSeconds(value) {
  if (!Number.isFinite(value)) return 'Not recorded';
  return value < 60 ? `${value.toFixed(value < 1 ? 2 : 1)} s` : `${(value / 60).toFixed(1)} min`;
}
export function formatMemory(value) {
  return Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} MiB` : 'Not recorded';
}
