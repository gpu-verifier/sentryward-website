import { runtimeReduction } from './sync-removal.mjs';

export const VERDICTS = {
  verified: { label: 'Verified', group: 'verified' },
  race_free: { label: 'Race free', group: 'verified' },
  potential_race: { label: 'Potential race', group: 'findings' },
  invalid_lifecycle: { label: 'Invalid lifecycle', group: 'findings' },
  not_wellsynced: { label: 'Not well-synchronized', group: 'findings' },
  unsupported: { label: 'Unsupported', group: 'inconclusive' },
  equivalence_not_proven: { label: 'Equivalence not proven', group: 'inconclusive' },
  memory_budget_exceeded: { label: 'Memory limit', group: 'inconclusive' },
  timeout: { label: 'Timeout', group: 'inconclusive' },
  analysis_budget_exceeded: { label: 'Analysis limit', group: 'inconclusive' },
};

export const FRESHNESS = {
  current: 'Current version checked',
  reused: 'Matching result reused',
  deferred_resource: 'Awaiting high-memory execution',
  pending: 'Awaiting execution',
  failed: 'Execution failed',
  historical: 'Historical record only',
};

export function isCurrent(row) {
  return !row.automation || ['current', 'reused'].includes(row.automation.state);
}

export function freshnessLabel(row) { return FRESHNESS[row.automation?.state] || 'Recorded result'; }

export function resultGroup(row) {
  return isCurrent(row) ? VERDICTS[row.result]?.group || 'other' : 'awaiting';
}

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
  const counts = Object.create(null);
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
  const automated = data.publication !== undefined;
  if (automated) {
    const publication = data.publication;
    if (publication?.source_repository !== 'gpu-verifier/sentryward' ||
        !/^[0-9a-f]{40}$/.test(publication.source_revision) || !/^[0-9a-f]{64}$/.test(publication.snapshot_id) ||
        typeof publication.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(publication.run_id) ||
        typeof publication.created_at !== 'string' || !Number.isFinite(Date.parse(publication.created_at)) ||
        typeof publication.evidence_base_url !== 'string') {
      throw new Error('Missing publication provenance.');
    }
  } else {
    const source = data.verification_results_source;
    if (source?.repository !== 'gpu-verifier/sentryward' || !/^[0-9a-f]{40}$/.test(source.revision) ||
        typeof source.path !== 'string' || !/^[0-9a-f]{64}$/.test(source.sha256)) {
      throw new Error('Missing results provenance.');
    }
  }
  const names = new Set();
  const counts = Object.create(null);
  for (const row of data.results) {
    if (typeof row.name !== 'string' || !row.name || names.has(row.name) ||
        !(typeof row.result === 'string' && row.result || automated && row.result === null) ||
        (row.diagnostics !== undefined && !Array.isArray(row.diagnostics))) {
      throw new Error('Invalid or duplicate kernel record.');
    }
    if (automated && (!row.automation || !Object.hasOwn(FRESHNESS, row.automation.state) ||
        row.automation.attempted_revision !== data.publication.source_revision ||
        (row.automation.report_status !== undefined && typeof row.automation.report_status !== 'string') ||
        isCurrent(row) && (!row.result || !/^[0-9a-f]{64}$/.test(row.automation.verification_key)))) {
      throw new Error('Invalid execution identity or freshness.');
    }
    names.add(row.name);
    if (isCurrent(row)) counts[row.result] = (counts[row.result] || 0) + 1;
  }
  const keys = new Set([...Object.keys(counts), ...Object.keys(data.counts || {})]);
  if (!data.counts || [...keys].some(key => (counts[key] || 0) !== data.counts[key])) {
    throw new Error('Result counts do not match their records.');
  }
  return data;
}

export function summarize(rows) {
  const stats = { total: rows.length, current: 0, awaiting: 0, verified: 0, findings: 0, inconclusive: 0, other: 0, conditional: 0, counts: Object.create(null) };
  for (const row of rows) {
    stats[resultGroup(row)]++;
    if (isCurrent(row)) {
      stats.current++;
      stats.counts[row.result] = (stats.counts[row.result] || 0) + 1;
    }
    if (row.analysis_scope) stats.conditional++;
  }
  stats.counts = { ...stats.counts };
  return stats;
}

export function filterRows(rows, { search = '', library = '', verdict = '', group = '', sort = 'name', scenario = 'recorded', withStudy = false } = {}) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = rows.filter(row => {
    if (withStudy && row.syncStudy?.[scenario]?.removal.status !== 'measured') return false;
    if (library && libraryOf(row.name) !== library) return false;
    if (verdict && (!isCurrent(row) || row.result !== verdict)) return false;
    if (group && resultGroup(row) !== group) return false;
    const text = [row.name, displayName(row.name), libraryOf(row.name), row.result,
      VERDICTS[row.result]?.label || '', freshnessLabel(row), row.historical?.result,
      ...[...(row.diagnostics || []), ...(row.historical?.diagnostics || [])].map(d => d.code)].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
  const numeric = (a, b) => (Number.isFinite(b) ? b : -Infinity) - (Number.isFinite(a) ? a : -Infinity);
  return filtered.sort((a, b) => {
    let order = 0;
    if (sort === 'time') order = numeric(analysisSeconds(a), analysisSeconds(b));
    if (sort === 'memory') order = numeric(peakMemoryMiB(a), peakMemoryMiB(b));
    if (sort === 'removable' || sort === 'improvement') {
      const metric = row => sort === 'removable' ? row.syncStudy?.[scenario]?.removal.removable : runtimeReduction(row.syncStudy?.[scenario]?.performance);
      const left = metric(a), right = metric(b);
      order = (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
    }
    if (sort === 'result') order = (a.result || '').localeCompare(b.result || '');
    return order || a.name.localeCompare(b.name);
  });
}

export function resultLabel(value) { return VERDICTS[value]?.label || (typeof value === 'string' ? value.replace(/_/g, ' ') : 'No recorded verdict'); }
export function analysisSeconds(row) {
  // Prefer the catalog's analysis time; retain support for historical snapshots.
  const value = row.analysis_time_seconds !== undefined ? row.analysis_time_seconds : row.elapsed_seconds;
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function peakMemoryMiB(row) {
  const value = row.peak_rss_mib !== undefined ? row.peak_rss_mib : row.native_peak_rss_mib;
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function formatSeconds(value) {
  if (!Number.isFinite(value)) return 'Not recorded';
  return value < 60 ? `${value.toFixed(value < 1 ? 2 : 1)} s` : `${(value / 60).toFixed(1)} min`;
}
export function formatMemory(value) {
  return Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} MiB` : 'Not recorded';
}
