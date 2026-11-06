import { validateResults } from './results-model.mjs?v=20261106-undefined-behavior';
import { validateStudy } from './sync-removal.mjs';
import { readInputContent } from './kernel-inputs.mjs?v=20261015-live';

export const REPOSITORY = 'https://github.com/gpu-verifier/sentryward';
export const RESULTS_PATH = 'examples/results.json';
export const RESULTS_URL = 'https://raw.githubusercontent.com/gpu-verifier/sentryward/main/' + RESULTS_PATH;
export const RESULTS_PAGE = `${REPOSITORY}/blob/main/${RESULTS_PATH}`;

export async function loadResults(fetcher = fetch) {
  const response = await fetcher(RESULTS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Results unavailable (HTTP ${response.status}).`);
  return validateResults(await response.json());
}

export function embeddedStudy(data) {
  if (!data.synchronization_removal_study) return null;
  const results = data.results.filter(row => row.synchronization_removal)
    .map(row => ({ ...row.synchronization_removal, name: row.name }));
  return validateStudy({ ...data.synchronization_removal_study, results }, new Set(data.results.map(row => row.name)));
}

export function sourceFileURL(path, raw = false) {
  if (typeof path !== 'string' || path.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#]/.test(path)) {
    throw new Error('Invalid source file path.');
  }
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const base = raw ? 'https://raw.githubusercontent.com/gpu-verifier/sentryward/main' : `${REPOSITORY}/blob/main`;
  return `${base}/${encoded}`;
}

export async function loadInputConfig(file, fetcher = fetch) {
  const response = await fetcher(sourceFileURL(file?.path, true), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Input unavailable (HTTP ${response.status}).`);
  return readInputContent(await response.text(), file.sha256);
}
