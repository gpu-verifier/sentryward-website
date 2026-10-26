import { validateResults } from './results-model.mjs?v=20261021-snapshots';
import { validateStudy } from './sync-removal.mjs';
import { readInputContent } from './kernel-inputs.mjs?v=20261015-live';

export const REPOSITORY = 'https://github.com/gpu-verifier/sentryward';
const RAW = 'https://raw.githubusercontent.com/gpu-verifier/sentryward';
export const RESULTS_URL = `${RAW}/results/latest.json`;
const HASH = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;

function encodedPath(path) {
  if (typeof path !== 'string' || path.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#%\x00-\x1f]/.test(path)) {
    throw new Error('Invalid source file path.');
  }
  return path.split('/').map(encodeURIComponent).join('/');
}

function httpsURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== value) {
    throw new Error('Evidence URLs must be canonical HTTPS URLs without credentials, query strings or fragments.');
  }
  return url;
}

function evidencePrefix(value) {
  const url = httpsURL(value);
  return url.href.replace(/\/?$/, '/');
}

export function validateLatest(pointer) {
  if (pointer?.schema !== 'sentryward.latest.v1' || typeof pointer.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(pointer.run_id) ||
      !REVISION.test(pointer.source_revision) || !HASH.test(pointer.snapshot_id) || !HASH.test(pointer.catalog_sha256) ||
      pointer.catalog_path !== `runs/${pointer.run_id}/${pointer.snapshot_id}/results.json`) {
    throw new Error('Invalid latest-results pointer.');
  }
  evidencePrefix(pointer.evidence_base_url);
  return pointer;
}

async function checkHash(content, expected) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('Results catalog does not match the published SHA-256.');
}

export function catalogURL(publication, raw = false) {
  return `${raw ? RAW : REPOSITORY}/${raw ? '' : 'blob/'}results/runs/${encodeURIComponent(publication.run_id)}/${publication.snapshot_id}/results.json`;
}

export async function loadResults(fetcher = fetch) {
  const latest = await fetcher(RESULTS_URL, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!latest.ok) throw new Error(`Latest results unavailable (HTTP ${latest.status}).`);
  const pointer = validateLatest(await latest.json());
  const response = await fetcher(`${RAW}/results/${encodedPath(pointer.catalog_path)}`, { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`Results snapshot unavailable (HTTP ${response.status}).`);
  const content = await response.text();
  await checkHash(content, pointer.catalog_sha256);
  const data = validateResults(JSON.parse(content));
  const publication = data.publication;
  if (publication?.run_id !== pointer.run_id || publication.snapshot_id !== pointer.snapshot_id ||
      publication.source_revision !== pointer.source_revision ||
      publication.evidence_base_url !== pointer.evidence_base_url) {
    throw new Error('Results snapshot does not belong to the published run.');
  }
  for (const row of data.results) {
    for (const [kind, file] of Object.entries(row.files || {})) {
      if (!HASH.test(file?.sha256)) throw new Error('Snapshot file is missing its SHA-256.');
      sourceFileURL(file, false, publication, kind === 'report');
      if (file.raw_url) sourceFileURL(file, true, publication, kind === 'report');
    }
  }
  return data;
}

export function embeddedStudy(data) {
  if (!data.synchronization_removal_study) return null;
  const results = data.results.filter(row => row.synchronization_removal)
    .map(row => ({ ...row.synchronization_removal, name: row.name }));
  return validateStudy({ ...data.synchronization_removal_study, results }, new Set(data.results.map(row => row.name)));
}

export function sourceFileURL(file, raw = false, publication = null, report = false) {
  if (!file || typeof file !== 'object') throw new Error('Missing source file.');
  const path = encodedPath(file.path);
  const snapshotReport = report && typeof publication?.run_id === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(publication.run_id) && HASH.test(publication.snapshot_id) &&
    file.path.startsWith(`runs/${publication.run_id}/${publication.snapshot_id}/reports/`) && file.path.endsWith('/report.md');
  const explicit = raw ? file.raw_url || file.url : file.url || file.raw_url;
  if (explicit) {
    const url = httpsURL(explicit);
    if (publication && url.href.startsWith(evidencePrefix(publication.evidence_base_url))) return url.href;
  }
  const ref = REVISION.test(file.revision) ? file.revision : snapshotReport ? 'results' : null;
  if (!ref) throw new Error('Source file is not pinned to a commit or published snapshot.');
  const rawURL = `${RAW}/${ref}/${path}`;
  const blobURL = `${REPOSITORY}/blob/${ref}/${path}`;
  if (explicit && explicit !== rawURL && explicit !== blobURL) {
    throw new Error('File URL is outside the published evidence or pinned repository source.');
  }
  return raw ? rawURL : blobURL;
}

export async function loadInputConfig(file, fetcher = fetch, publication = null) {
  if (!HASH.test(file?.sha256)) throw new Error('Snapshot input is missing its SHA-256.');
  const response = await fetcher(sourceFileURL(file, true, publication), { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`Input unavailable (HTTP ${response.status}).`);
  return readInputContent(await response.text(), file.sha256);
}
