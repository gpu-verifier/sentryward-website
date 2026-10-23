import { VERDICTS, libraryOf, displayName, summarize, filterRows, resultLabel, analysisSeconds, peakMemoryMiB, formatSeconds, formatMemory, isCurrent, freshnessLabel } from './results-model.mjs?v=20261021-snapshots';

import { REPOSITORY, loadResults, embeddedStudy, sourceFileURL, loadInputConfig, catalogURL } from './results-source.mjs?v=20261021-snapshots';

import { SCENARIOS, removalLabel, performanceLabel, runtimeReduction, summarizeStudy } from './sync-removal.mjs';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 200;
const repository = REPOSITORY;
let catalog, source, stats, rows, study, studyAvailable = false, state, openedKernel = null;
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'Not recorded';
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
};
const link = (text, href, className = '') => {
  const a = el('a', className, text);
  a.href = href;
  return a;
};
const appendText = (parent, text, className = '') => parent.append(el('p', className, text));
const tone = verdict => Object.hasOwn(VERDICTS, verdict) ? `tone-${verdict}` : '';
function badge(verdict) {
  const node = el('span', `verdict-badge ${tone(verdict)}`);
  node.title = verdict;
  node.textContent = resultLabel(verdict);
  return node;
}
function check(status) {
  const symbols = { passed: '✓', failed: '!', incomplete: '◐', not_run: '—', not_requested: '—' };
  const node = el('span', `check check-${Object.hasOwn(symbols, status) ? status : 'unknown'}`);
  const symbol = el('span', '', symbols[status] || '—');
  symbol.setAttribute('aria-hidden', 'true');
  const label = status ? status.replace(/_/g, ' ') : 'not recorded';
  node.append(symbol, document.createTextNode(` ${label.charAt(0).toUpperCase() + label.slice(1)}`));
  return node;
}
function readState() {
  const params = new URLSearchParams(location.search);
  const libraries = new Set(rows.map(row => libraryOf(row.name)));
  const group = params.get('group') || '';
  return {
    search: params.get('q') || '',
    library: libraries.has(params.get('library')) ? params.get('library') : '',
    verdict: stats.counts[params.get('result')] ? params.get('result') : '',
    group: ['verified', 'findings', 'inconclusive', 'other', 'awaiting'].includes(group) ? group : '',
    sort: ['name', 'time', 'memory', 'result', 'removable', 'improvement'].includes(params.get('sort')) ? params.get('sort') : 'name',
    scenario: params.get('input') === 'larger' ? 'larger' : 'recorded',
    withStudy: studyAvailable && params.get('study') === 'available',
    page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
  };
}
function pageURL(kernel = null) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  for (const [param, value] of Object.entries({ q: state.search, library: state.library, result: state.verdict, group: state.group, input: state.scenario === 'larger' ? 'larger' : '', study: state.withStudy ? 'available' : '', sort: state.sort !== 'name' ? state.sort : '', page: state.page > 1 ? state.page : '', kernel })) {
    if (value) url.searchParams.set(param, value);
  }
  return url;
}
function syncURL() { history.replaceState(null, '', pageURL(openedKernel)); }
function setFilter(changes) {
  Object.assign(state, changes, { page: 1 });
  render();
  syncURL();
}
function resetFilters() { setFilter({ search: '', library: '', verdict: '', group: '', sort: 'name', withStudy: false }); }

function renderOverview() {
  const groups = [
    ['', 'All', stats.total],
    ['verified', 'Current passes', stats.verified],
    ['findings', 'Current findings', stats.findings],
    ['inconclusive', 'Current inconclusive', stats.inconclusive],
  ];
  if (stats.other) groups.push(['other', 'Other current outcomes', stats.other]);
  if (stats.awaiting) groups.push(['awaiting', 'Awaiting current result', stats.awaiting]);
  for (const [group, title, count] of groups) {
    const button = el('button', 'result-group');
    button.type = 'button';
    button.dataset.group = group;
    button.append(document.createTextNode(title + ' '), el('span', 'group-count', number(count)));
    button.addEventListener('click', () => setFilter({ group, verdict: '' }));
    $('result-groups').append(button);
  }
  const keys = [...Object.keys(VERDICTS), ...Object.keys(stats.counts).filter(key => !Object.hasOwn(VERDICTS, key))];
  for (const verdict of keys) {
    const count = stats.counts[verdict];
    if (!count) continue;
    const option = el('option', '', `${resultLabel(verdict)} (${count})`);
    option.value = verdict;
    $('verdict').append(option);
  }
  for (const library of [...new Set(rows.map(row => libraryOf(row.name)))].sort()) {
    const option = el('option', '', library);
    option.value = library;
    $('library').append(option);
  }
}


function renderStudySummary(filtered) {
  $('with-study').checked = state.withStudy;
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario)));
  const summary = $('study-summary');
  summary.replaceChildren();
  if (!studyAvailable) {
    appendText(summary, 'Synchronization study unavailable. Reload to try again; verification results remain available.');
    return;
  }
  const totals = summarizeStudy(filtered, state.scenario);
  const counts = el('p');
  counts.append(el('strong', '', `${number(totals.removable)} of ${number(totals.candidates)}`), document.createTextNode(` candidate sites removable · ${totals.tested} ${totals.tested === 1 ? 'kernel' : 'kernels'} with counts`));
  const timing = el('p');
  timing.append(el('strong', '', `${totals.faster} faster · ${totals.slower} slower · ${totals.unchanged} unchanged`), document.createTextNode(` kernel runtimes · ${totals.timed} timed ${totals.timed === 1 ? 'kernel' : 'kernels'}`));
  summary.append(counts, timing);
  $('study-scope').textContent = state.scenario === 'larger'
    ? 'Historical study; includes original-shape rechecks. Counts and timings may cover different kernels. Removals apply only to the tested input.'
    : 'Historical study. Counts and timings may cover different kernels. Removals apply only to the tested input.';
}
function studyCells(row, tr) {
  const sample = row.syncStudy?.[state.scenario];
  const removalCell = el('td', 'study-cell');
  const perfCell = el('td', 'study-cell');
  if (!studyAvailable) {
    removalCell.append(el('span', 'metric-missing', 'Unavailable'));
    perfCell.append(el('span', 'metric-missing', 'Unavailable'));
  } else {
    removalCell.append(el('span', sample?.removal.status === 'measured' ? 'removal-count' : 'metric-missing', removalLabel(sample?.removal)));
    if (sample?.removal.status === 'measured') removalCell.append(el('small', '', 'candidate sites'));
    const reduction = runtimeReduction(sample?.performance);
    perfCell.append(el('span', reduction === null ? 'metric-missing' : reduction > 0 ? 'perf-lower' : reduction < 0 ? 'perf-higher' : 'perf-unchanged', performanceLabel(sample?.performance)));
    if (reduction !== null) {
      const p = sample.performance;
      perfCell.append(el('small', '', `${p.original_us.toFixed(2)} → ${p.reduced_us.toFixed(2)} µs`));
    }
    if (sample?.rechecked_at_recorded_input) removalCell.append(el('small', 'scope-tag', 'Original-shape recheck'));
  }
  tr.append(removalCell, perfCell);
}

function render() {
  $('search').value = state.search;
  $('library').value = state.library;
  $('verdict').value = state.verdict;
  $('sort').value = state.sort;
  document.querySelectorAll('.result-group').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.group === state.group && !state.verdict));
  });
  const filtered = filterRows(rows, state);
  renderStudySummary(filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const offset = (state.page - 1) * PAGE_SIZE;
  const fragment = document.createDocumentFragment();
  for (const row of filtered.slice(offset, offset + PAGE_SIZE)) {
    const tr = el('tr');
    const nameCell = el('td');
    const name = link(displayName(row.name), pageURL(row.name), 'kernel-name');
    name.title = row.name;
    name.setAttribute('aria-label', `${row.name}: open kernel details`);
    name.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', pageURL(row.name));
      showDetail(row);
    });
    const meta = el('div', 'kernel-meta');
    meta.append(el('span', 'library-tag', libraryOf(row.name)));
    const architecture = row.name.match(/(?:__sm_|\.compute_)(\d+[a-z]?)$/)?.[1];
    if (architecture) meta.append(el('span', '', `sm_${architecture}`));
    if (row.analysis_scope) meta.append(el('span', 'scope-tag', 'Conditional scope'));
    nameCell.append(name, meta);
    const resultCell = el('td');
    if (isCurrent(row)) resultCell.append(badge(row.result));
    else resultCell.append(el('span', 'freshness-label', freshnessLabel(row)));
    if (row.automation) {
      resultCell.append(el('small', 'result-freshness', isCurrent(row) ? freshnessLabel(row) : row.historical?.result ? `Previous: ${resultLabel(row.historical.result)}` : 'No previous verdict'));
    }
    tr.append(nameCell, resultCell);
    studyCells(row, tr);
    tr.append(el('td', 'numeric', formatSeconds(analysisSeconds(row))));
    fragment.append(tr);
  }
  $('kernel-rows').replaceChildren(fragment);
  const groupLabel = state.group ? ` · ${state.group === 'findings' ? 'current findings' : state.group === 'awaiting' ? 'awaiting current result' : state.group}` : '';
  $('result-count').textContent = `${number(filtered.length)} of ${number(rows.length)} configurations${groupLabel}`;
  $('page-info').textContent = filtered.length ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, filtered.length)} · Page ${state.page} of ${pages}` : '0 configurations';
  $('previous').disabled = state.page === 1;
  $('next').disabled = state.page >= pages;
  $('empty-state').hidden = filtered.length > 0;
  document.querySelector('.table-scroll').hidden = !filtered.length;
}

function rawSection(parent, title, object) {
  const details = el('details');
  const pre = el('pre', '', JSON.stringify(object, null, 2));
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', title);
  details.append(el('summary', '', title), pre);
  parent.append(details);
}
function fact(parent, title, value) {
  const item = el('div');
  item.append(el('dt', '', title), el('dd', '', value));
  parent.append(item);
}

function inputTable(parent, title, headings, rows, expandable = false) {
  const section = el(expandable ? 'details' : 'div', 'input-table-section');
  section.append(el(expandable ? 'summary' : 'h4', '', title));
  const table = el('table', 'input-table');
  const header = el('tr');
  for (const heading of headings) {
    const cell = el('th', '', heading);
    cell.scope = 'col';
    header.append(cell);
  }
  const head = el('thead');
  head.append(header);
  const body = el('tbody');
  for (const values of rows) {
    const row = el('tr');
    for (const value of values) row.append(el('td', '', value));
    body.append(row);
  }
  table.append(head, body);
  section.append(table);
  parent.append(section);
}

async function inputDetail(parent, row, publication) {
  const section = el('section', 'input-config');
  section.append(el('h3', '', 'Input configuration'));
  const content = el('div');
  content.setAttribute('aria-live', 'polite');
  appendText(content, 'Loading input configuration…', 'detail-note');
  section.append(content);
  parent.append(section);
  try {
    const { config, content: raw } = await loadInputConfig(row.files?.input, fetch, publication);
    // A different record may have been opened while the configuration was loading.
    if (!section.isConnected) return;
    content.replaceChildren();
    appendText(content, 'Input configuration matches this record’s SHA-256. Historical removal experiments may use different inputs.', 'detail-note');
    const launch = config.launch || {};
    const dims = value => Array.isArray(value) ? value.join(' × ') : 'Not recorded';
    const facts = el('dl', 'record-facts');
    fact(facts, 'Grid dimensions (CTAs)', dims(launch.grid_dim));
    fact(facts, 'Block dimensions (threads)', dims(launch.block_dim));
    fact(facts, 'Cluster dimensions (CTAs)', dims(launch.cluster_dim));
    fact(facts, 'Dynamic shared memory', Number.isFinite(launch.dynamic_shared_bytes) ? `${number(launch.dynamic_shared_bytes)} bytes` : 'Not recorded');
    content.append(facts);
    if (config.tma_descriptors?.length) {
      const shapes = config.tma_descriptors.map(descriptor => [
        descriptor.object ?? 'Unnamed', descriptor.element_type ?? 'Not recorded', dims(descriptor.global_shape),
      ]);
      inputTable(content, 'TMA tensor shapes', ['Object', 'Element type', 'Global shape'],
        [...new Map(shapes.map(shape => [JSON.stringify(shape), shape])).values()]);
    }
    if (config.arguments?.length) {
      inputTable(content, `Configured arguments (${config.arguments.length})`, ['Argument', 'Type', 'Value'], config.arguments.map(arg => [
        arg.field ?? `Parameter ${arg.parameter}${arg.offset === undefined ? '' : ` · byte offset ${arg.offset}`}`,
        arg.type ?? config.declarations?.find(declaration => declaration.name === arg.field && arg.field !== undefined)?.type ?? 'Not recorded',
        Object.hasOwn(arg, 'value') ? (typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)) : 'Not recorded',
      ]), true);
    } else appendText(content, 'No explicit argument values are recorded. See the full configuration for declarations and assumptions.', 'detail-note');
    const full = el('details');
    const pre = el('pre', '', raw);
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Full input configuration (JSON)');
    full.append(el('summary', '', 'Full input configuration (JSON)'), pre);
    content.append(full);
    const download = link('Download input.json', `data:application/json;charset=utf-8,${encodeURIComponent(raw)}`);
    download.download = `${row.name}.input.json`;
    const action = el('p', 'detail-note');
    action.append(download);
    content.append(action);
  } catch (error) {
    if (!section.isConnected) return;
    content.replaceChildren();
    appendText(content, 'The input configuration could not be loaded or verified. Reopen this record to retry; verification results remain available.', 'detail-note');
    console.warn('Kernel input configuration:', error);
  }
}

function studyDetail(body, row) {
  body.append(el('h3', '', 'Synchronization removal & kernel performance'));
  if (!studyAvailable || !row.syncStudy) {
    appendText(body, studyAvailable ? 'No synchronization-removal experiment is recorded for this kernel. This does not mean that zero sites are removable.' : 'The synchronization study could not be loaded.', 'detail-note');
    return;
  }
  appendText(body, 'Historical, input-specific experiments. These counts and B200 timings are separate from the verification run above; changing the input shape can invalidate a removal.', 'detail-note');
  appendText(body, `Static synchronization statements in the analyzed entry: ${row.syncStudy.static_sync_instructions}.`);
  for (const [key, title] of Object.entries(SCENARIOS)) {
    const sample = row.syncStudy[key];
    const section = el('section', 'study-detail-scenario');
    section.append(el('h4', '', title + (sample.rechecked_at_recorded_input ? ' · original-shape recheck' : '')));
    const facts = el('dl', 'record-facts');
    fact(facts, 'Removable / executed candidate sites', removalLabel(sample.removal));
    fact(facts, 'B200 kernel runtime', performanceLabel(sample.performance));
    if (runtimeReduction(sample.performance) !== null) {
      fact(facts, 'Original kernel', `${sample.performance.original_us.toFixed(2)} µs`);
      fact(facts, 'Reduced kernel', `${sample.performance.reduced_us.toFixed(2)} µs`);
    }
    section.append(facts);
    if (sample.removal.note) appendText(section, sample.removal.note.replace(/\[#\d+\]\(https:\/\/github\.com\/wmdi\/wasp_verification\/issues\/\d+\)/g, '').replace(/\(\s*,?\s*\)/g, '').trim(), 'study-source-note');
    if (sample.performance.note) appendText(section, `Reported timing: ${sample.performance.note}`, 'study-source-note');
    body.append(section);
  }
  const references = el('p', 'study-references');
  for (const reference of row.syncStudy.references) {
    if (/^https:\/\/github\.com\/wmdi\/wasp_verification\/issues\/\d+$/.test(reference)) references.append(link(`Experiment #${reference.split('/').pop()} ↗`, reference));
  }
  body.append(references);
  rawSection(body, 'Complete synchronization study record', row.syncStudy);
}

function verificationDetail(body, row, publication) {
  if (row.analysis_scope) appendText(body, 'Conditional analysis: this result applies only to the configured branch decisions below.', 'data-notice');
  const grid = el('div', 'check-grid');
  for (const [key, label] of [['synchronization', 'Synchronization'], ['memory', 'Memory'], ['equivalence', 'Equivalence']]) {
    const card = el('div', 'check-card');
    card.append(el('strong', '', label), check(row.checks?.[key]));
    grid.append(card);
  }
  body.append(grid);
  const facts = el('dl', 'record-facts');
  fact(facts, 'Analysis time', formatSeconds(analysisSeconds(row)));
  fact(facts, 'Peak memory (RSS)', formatMemory(peakMemoryMiB(row)));
  fact(facts, 'Recorded warnings', `${number(row.warning_count)} · ${row.warnings_complete === true ? 'collection complete' : row.warnings_complete === false ? 'collection incomplete' : 'completion not recorded'}`);
  fact(facts, 'Memory analysis', row.memory_analysis_complete === true ? 'Complete' : row.memory_analysis_complete === false ? 'Incomplete' : 'Not recorded');
  fact(facts, 'Run identifier', row.provenance?.run_id || row.run || publication.run_id || 'Not recorded');
  fact(facts, 'Source revision', publication.source_revision || 'Not recorded');
  if (row.verifier_revision) fact(facts, 'Recorded verifier revision', row.verifier_revision);
  body.append(facts);
  inputDetail(body, row, publication);
  if (row.recorded_followup?.analysis || row.recorded_followup?.upstream_references) {
    body.append(el('h3', '', 'Recorded follow-up'));
    if (row.recorded_followup.analysis) appendText(body, row.recorded_followup.analysis.replace(/<br\s*\/?\s*>/gi, '\n\n'), 'followup');
    for (const reference of (row.recorded_followup.upstream_references || '').split(';').map(s => s.trim()).filter(Boolean)) {
      try {
        const url = new URL(reference);
        if (url.protocol === 'https:') {
          const p = el('p');
          p.append(link(reference, url.href));
          p.style.overflowWrap = 'anywhere';
          body.append(p);
        }
      } catch { /* Retain non-URL reference text in the complete record. */ }
    }
  }
  if (row.diagnostics?.length) {
    body.append(el('h3', '', 'Diagnostics'));
    const list = el('ul', 'diagnostic-list');
    for (const item of row.diagnostics) {
      const li = el('li');
      li.append(el('code', '', item.code), el('span', '', `${item.stage || 'Stage not recorded'}${Number.isFinite(item.count) ? ` · ${number(item.count)} recorded` : ''}`));
      list.append(li);
    }
    body.append(list);
  } else appendText(body, 'No diagnostics are listed in this record. Check the completion status before interpreting their absence.', 'detail-note');
  if (row.analysis_scope) rawSection(body, 'Configured analysis scope', row.analysis_scope);
  if (row.equivalence) {
    body.append(el('h3', '', 'Reference equivalence'));
    appendText(body, `Recorded equivalence outcome: ${resultLabel(row.equivalence.result)}. The overall stage outcomes above are reported separately.`);
    if (row.equivalence.equivalence_contract) appendText(body, `Contract: ${row.equivalence.equivalence_contract}`);
    if (row.equivalence.definedness) {
      const definition = row.equivalence.definedness;
      appendText(body, `Definedness: ${definition.status}. Proved families: ${number(definition.proved_families)}; partial-equivalence families: ${number(definition.partial_equivalence_families)}.`);
    }
    rawSection(body, 'Full equivalence record', row.equivalence);
  }
  if (row.budgets) rawSection(body, 'Configured resource budgets', row.budgets);
  if (row.additional_completed_run) rawSection(body, 'Additional completed run', row.additional_completed_run);
  body.append(el('h3', '', 'Source files & recorded hashes'));
  appendText(body, 'Links are available only when this record includes a fixed source or evidence location and its hash.', 'detail-note');
  const files = el('ul', 'evidence-list');
  for (const [kind, file] of Object.entries(row.files || {})) {
    const item = el('li');
    if (typeof file.path !== 'string') continue;
    let fileURL;
    try {
      if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error('Missing file hash.');
      fileURL = sourceFileURL(file, false, publication, kind === 'report');
    } catch {
      item.append(el('span', '', `${kind.replace(/_/g, ' ')}: evidence link unavailable`));
      files.append(item);
      continue;
    }
    item.append(link(`${kind.replace(/_/g, ' ')} ↗`, fileURL), el('small', '', file.path), el('small', '', `SHA-256: ${file.sha256 || 'not recorded'}`));
    files.append(item);
  }
  body.append(files);
  const { syncStudy, ...verificationRecord } = row;
  rawSection(body, 'Complete JSON record', verificationRecord);
}

function showDetail(row) {
  openedKernel = row.name;
  const body = $('detail-body');
  body.replaceChildren();
  const heading = el('h2', '', displayName(row.name));
  heading.id = 'detail-title';
  body.append(el('span', 'library-tag', libraryOf(row.name)), heading, el('p', 'detail-identifier', row.name));
  const actions = el('div', 'detail-actions');
  if (isCurrent(row)) actions.append(badge(row.result));
  else actions.append(el('span', 'freshness-label', freshnessLabel(row)));
  actions.append(link('Permalink ↗', pageURL(row.name)));
  if (row.files?.report) actions.append(link('Read report ↗', sourceFileURL(row.files.report, false, catalog.publication, true)));
  body.append(actions);
  if (row.automation) {
    appendText(body, `${freshnessLabel(row)} for ${catalog.publication.source_revision.slice(0, 7)}.`, 'data-notice');
    if (row.automation.report_status) appendText(body, `Report: ${row.automation.report_status.replace(/_/g, ' ')}.`, 'detail-note');
  }
  if (row.automation?.state === 'failed') body.append(el('h3', '', 'Current execution'));
  verificationDetail(body, row, catalog.publication);
  if (row.historical) {
    const historical = el('section', 'historical-record');
    historical.append(el('h3', '', 'Previous verification record'), badge(row.historical.result));
    appendText(historical, 'This result belongs to an earlier record, not the current target.', 'detail-note');
    verificationDetail(historical, row.historical, {
      ...catalog.publication,
      run_id: row.historical.provenance?.run_id,
      snapshot_id: row.historical.provenance?.snapshot_id,
      source_revision: row.historical.provenance?.source_revision,
    });
    body.append(historical);
  }
  studyDetail(body, row);
  const dialog = $('kernel-detail');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $('close-detail').focus();
}

function updateProvenance() {
  const publication = catalog.publication;
  $('snapshot-date').textContent = `Run ${publication.run_id} · ${publication.source_revision.slice(0, 7)}`;
  $('corpus-meta').textContent = `${number(stats.current)} of ${number(rows.length)} configurations checked for this target · ${new Set(rows.map(r => libraryOf(r.name))).size} libraries`;
  for (const anchor of document.querySelectorAll('[data-catalog-link]')) {
    anchor.href = catalogURL(publication, true);
    anchor.textContent = anchor.classList.contains('download-link') ? 'Download snapshot JSON' : 'View this snapshot JSON';
  }
  $('conditional-note').textContent = stats.conditional
    ? `${stats.conditional} records specify configured branch scenarios. Their verdicts apply only to those scenarios. Open a marked record to inspect the recorded decisions.`
    : 'The results JSON does not report configured branch scenarios. Consult the input configurations and linked verifier outputs for analysis scope.';
  const provenance = $('provenance');
  provenance.replaceChildren();
  const p = el('p');
  p.append(document.createTextNode('Published snapshot: '), link(publication.run_id, catalogURL(publication)), document.createTextNode(`. Published ${publication.created_at}. Reload to check for a newer run; the page does not run the verifier.`));
  provenance.append(p);
  const origin = el('p');
  origin.append(document.createTextNode('Target source: '), link(`${publication.source_repository} @ ${publication.source_revision.slice(0, 7)}`, `${repository}/tree/${publication.source_revision}`));
  provenance.append(origin);
  appendText(provenance, 'Current counts include only completed checks or results reused for matching inputs and environment. Deferred, failed, pending and historical records are listed separately. Original verifier identity is not inferred from the publication revision.');
  if (source) {
    const path = source.path.split('/').map(encodeURIComponent).join('/');
    const historical = el('p');
    historical.append(document.createTextNode('Imported catalog provenance: '), link(`${source.repository} @ ${source.revision.slice(0, 7)}`, `${repository}/blob/${source.revision}/${path}`));
    provenance.append(historical);
  }
}

async function init() {
  try {
    catalog = await loadResults();
    source = catalog.verification_results_source;
    rows = catalog.results;
    try {
      study = embeddedStudy(catalog);
      if (!study) throw new Error('No synchronization study is included in the results JSON.');
      const studies = new Map(study.results.map(row => [row.name, row]));
      rows = rows.map(row => ({ ...row, syncStudy: studies.get(row.name) }));
      studyAvailable = true;
      const studySource = study.source;
      $('study-provenance').append(document.createTextNode('Experiment index: '), link(`${studySource.repository} @ ${studySource.revision.slice(0, 7)}`, `https://github.com/${studySource.repository}/blob/${studySource.revision}/${studySource.path}`));
      if (studySource.published_at) $('study-provenance').append(document.createTextNode(`. Published ${studySource.published_at.slice(0, 10)}.`));
      for (const paragraph of study.methodology || []) {
        // Keep source wording as plain text; never insert upstream HTML.
        appendText($('study-methodology'), paragraph.replace(/\*\*/g, '').replace(/`/g, ''));
      }
    } catch (error) {
      $('with-study').disabled = true;
      console.warn('Synchronization study:', error);
    }
    stats = summarize(rows);
    state = readState();
    renderOverview();
    updateProvenance();
    render();
    $('load-state').hidden = true;
    $('overview').hidden = false;
    $('explorer').hidden = false;
    const selected = rows.find(row => row.name === new URLSearchParams(location.search).get('kernel'));
    if (selected) showDetail(selected);
    document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => setFilter({ scenario: button.dataset.scenario })));
    $('with-study').addEventListener('change', () => setFilter({ withStudy: $('with-study').checked }));
    $('filters').addEventListener('submit', event => event.preventDefault());
    $('search').addEventListener('input', () => setFilter({ search: $('search').value }));
    $('library').addEventListener('change', () => setFilter({ library: $('library').value }));
    $('verdict').addEventListener('change', () => setFilter({ verdict: $('verdict').value, group: '' }));
    $('sort').addEventListener('change', () => setFilter({ sort: $('sort').value }));
    $('clear-filters').addEventListener('click', resetFilters);
    $('empty-reset').addEventListener('click', resetFilters);
    for (const [id, offset] of [['previous', -1], ['next', 1]]) {
      $(id).addEventListener('click', () => { state.page += offset; render(); syncURL(); $('explorer').scrollIntoView({ block: 'start' }); });
    }
    $('close-detail').addEventListener('click', () => $('kernel-detail').close());
    $('kernel-detail').addEventListener('close', () => { openedKernel = null; syncURL(); });
    window.addEventListener('popstate', () => {
      state = readState();
      render();
      const selected = rows.find(row => row.name === new URLSearchParams(location.search).get('kernel'));
      if (selected) showDetail(selected);
      else if ($('kernel-detail').open) $('kernel-detail').close();
    });
  } catch (error) {
    $('snapshot-date').textContent = 'Live results unavailable';
    $('load-state').textContent = 'The published results snapshot could not be loaded or verified. Reload to try again, or open the publication pointer above. No older snapshot is being substituted.';
    $('load-state').className = 'data-notice';
    $('load-state').setAttribute('role', 'alert');
    console.error('Verification database:', error);
  }
}
init();
