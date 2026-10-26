import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../js/results-model.mjs';
import * as source from '../js/results-source.mjs';
import * as study from '../js/sync-removal.mjs';

const imported = JSON.parse(await readFile(new URL('./fixtures/live-results.json', import.meta.url)));
const implementation = (await readFile(new URL('../js/results.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/\ninit\(\);\s*$/, '');
const revision = 'a'.repeat(40), previousRevision = 'b'.repeat(40);
const snapshot = '1'.repeat(64), previousSnapshot = '2'.repeat(64);
const publication = { run_id: 'new-run', snapshot_id: snapshot, source_revision: revision, evidence_base_url: 'https://evidence.example.org/' };

// Exercise the actual detail renderer without adding a browser/DOM dependency.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  focus() {}
  showModal() { this.open = true; }
}
function visibleText(element) {
  if (typeof element === 'string') return element;
  if (element.tag === 'pre') return ''; // Raw JSON must not substitute for rendered history.
  return [element.textContent || '', ...element.children.map(visibleText)].join(' ');
}
function descendants(element) {
  return typeof element === 'string' ? [] : [element, ...element.children.flatMap(descendants)];
}
function render(row) {
  const nodes = {}, inputs = [];
  const document = {
    getElementById: id => nodes[id] ??= new Element(id),
    createElement: tag => new Element(tag), createTextNode: text => text,
  };
  const context = vm.createContext({ ...model, ...source, ...study, document, URL,
    console: { warn() {} }, location: { href: 'https://sentryward.io/results/' },
    fixture: { publication, results: [row] }, fetch() {},
    loadInputConfig: async (file, fetcher, identity) => { inputs.push({ file, identity }); return { config: {}, content: '{}' }; },
  });
  vm.runInContext(implementation + '\ncatalog=fixture; state={}; showDetail(fixture.results[0]);', context);
  return { body: nodes['detail-body'], inputs };
}
function pending() {
  const historical = structuredClone(imported.results.find(row => row.result === 'timeout'));
  return { name: historical.name, result: null,
    automation: { state: 'pending', attempted_revision: revision, report_status: 'not_run' },
    provenance: { run_id: 'new-run', source_revision: revision },
    files: { input: { path: historical.files.input.path, sha256: 'c'.repeat(64), revision } }, historical };
}

test('pending backend records render nested history without inventing historical links', () => {
  const row = pending();
  const { body } = render(row);
  const history = descendants(body).find(node => node.className === 'historical-record');
  assert.ok(history, 'The nested historical record has its own visible section.');
  assert.match(visibleText(history), /8\.3 min/);
  assert.match(visibleText(history), /timeout/);
  assert.match(visibleText(history), /Source revision Not recorded/);
  assert.match(visibleText(history), /evidence link unavailable/);
  assert.equal(descendants(history).filter(node => node.href).length, 0);
  assert.doesNotMatch(visibleText(body), /previous verdict below/);
});

test('execution failures retain their own error and render the previous successful run separately', () => {
  const row = pending();
  row.automation.state = 'failed';
  row.result = 'tool_failure';
  row.diagnostics = [{ code: 'tool_failure', stage: 'automation_worker' }];
  row.checks = { synchronization: 'not_run', memory: 'not_run', equivalence: 'not_run' };
  row.historical = { name: row.name, result: 'verified', checks: { synchronization: 'passed', memory: 'passed', equivalence: 'passed' },
    provenance: { run_id: 'previous-run', snapshot_id: previousSnapshot, source_revision: previousRevision },
    files: {
      input: { path: row.files.input.path, revision: previousRevision, sha256: 'd'.repeat(64) },
      result: { path: 'output.json', sha256: 'e'.repeat(64), url: 'https://evidence.example.org/objects/old/output.json' },
      report: { path: `runs/previous-run/${previousSnapshot}/reports/${row.name}/report.md`, sha256: 'f'.repeat(64) },
    },
  };
  const { body, inputs } = render(row);
  const history = descendants(body).find(node => node.className === 'historical-record');
  assert.ok(history);
  assert.match(visibleText(body), /Current execution/);
  assert.match(visibleText(body), /tool_failure/);
  assert.match(visibleText(history), /Verified/);
  assert.match(visibleText(history), /Passed/);
  assert.match(visibleText(history), /previous-run/);
  assert.doesNotMatch(visibleText(history), /tool_failure/);
  assert.doesNotMatch(visibleText(body), /previous verdict.*tool failure/i);
  const links = descendants(history).filter(node => node.href).map(node => String(node.href));
  assert.ok(links.includes(`https://github.com/gpu-verifier/sentryward/blob/${previousRevision}/${row.files.input.path}`));
  assert.ok(links.includes('https://evidence.example.org/objects/old/output.json'));
  assert.ok(links.includes(`https://github.com/gpu-verifier/sentryward/blob/results/runs/previous-run/${previousSnapshot}/reports/${row.name}/report.md`));
  assert.ok(!links.some(url => url.includes(revision) || url.includes('/new-run/')));
  assert.equal(inputs[1].file, row.historical.files.input);
  assert.equal(inputs[1].identity.run_id, 'previous-run');
  assert.equal(inputs[1].identity.snapshot_id, previousSnapshot);
});
