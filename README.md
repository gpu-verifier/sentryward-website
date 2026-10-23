# SentryWard website

The SentryWard project website and technical blog, maintained in
[gpu-verifier/sentryward-website](https://github.com/gpu-verifier/sentryward-website).

This is a static HTML, CSS, and JavaScript site. No build step or package installation is required.

## Publishing

The [deployment workflow](.github/workflows/deploy-pages.yml) publishes the repository root to
GitHub Pages whenever a pull request is merged into `main` or another commit is pushed to `main`.
No build step or deployment secret is required. GitHub Pages must use **GitHub Actions** as its
publishing source in the repository's **Settings → Pages**.

Follow deployments in [GitHub Actions](https://github.com/gpu-verifier/sentryward-website/actions/workflows/deploy-pages.yml).
To republish manually, select **Run workflow** on `main`. Deployments run one at a time;
other branches do not publish the production site.

The custom domain is [sentryward.io](https://sentryward.io); keep the root `CNAME` file and the
custom domain setting in GitHub Pages. The
[GitHub Pages address](https://gpu-verifier.github.io/sentryward-website/) redirects to this domain.

Namecheap manages DNS. The root host (`@`) uses these GitHub Pages A records:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
The `www` host is a CNAME pointing to `gpu-verifier.github.io`.
GitHub Pages redirects `www.sentryward.io` to the root domain once DNS and its HTTPS certificate are ready.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the homepage](http://127.0.0.1:8765/), [the technical blog](http://127.0.0.1:8765/blog/),
[the interactive demo](http://127.0.0.1:8765/demo/), or [the verification database](http://127.0.0.1:8765/results/).

## Verification database

`/results/` reads [`results/latest.json`](https://github.com/gpu-verifier/sentryward/blob/results/latest.json)
from `gpu-verifier/sentryward`, then verifies the catalog at
`runs/<run_id>/<snapshot_id>/results.json` against the pointer's SHA-256 and publication identity.
Retries keep their scheduling `run_id` and publish a new immutable `snapshot_id` when content changes.
A missing or invalid snapshot displays an error. Deploy this loader after the first automation
snapshot is published; it does not fall back to `main` or bundled data.

Current counts include only completed (`current`) or matching reused (`reused`) results.
Pending, deferred and failed executions remain visible without counting their previous verdicts.
Details show the current execution and any nested historical record separately, including each
record's checks, diagnostics and source identity. Missing values remain **Not recorded**.
Search includes historical diagnostics; verdict and outcome-group filters apply to current results.

Source files use fixed Git commits. Generated evidence uses the snapshot's HTTPS storage prefix;
input bytes are hash-checked before display. Reports open GitHub's Markdown renderer at
`runs/<run_id>/<snapshot_id>/reports/<kernel>/report.md`. Historical links use their original
record identity; imported records without a fixed version or hash remain readable but their
file links are unavailable. Storage reads must permit the site's origin through CORS and use
stable URLs without redirects or signed query parameters.

Run the database checks with:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p "test_*.py"
```

Preview filtering, synchronization scenarios, kernel details, input loading, permalinks and
mobile scrolling. The pointer JSON link remains available if loading fails. The files in `data/`
and `scripts/update-verification-results.py` preserve the earlier import tooling and snapshots;
the live page does not read them.

### Synchronization removal and kernel performance

The database reads historical synchronization experiments embedded in each live verification
record, together with the top-level study metadata. The **Recorded inputs / Larger-input study** selector switches both the
removal count and B200 timing columns. Use **Only kernels with removal counts**, or sort by
removable sites and runtime reduction. Details preserve full input-scope notes and experiment
issue links. Summary totals describe the filtered rows; counts and timings may cover different
kernel sets.

Removal counts refer to candidate sites removable together under the experiment's configuration,
not every dynamic synchronization instruction or every possible input. The study is separate from
the latest verification run. Some larger-input entries are explicitly marked as original-shape
rechecks. Unknown values, unrun experiments, measured zero, and no measurable performance change
remain distinct. Runtime percentages use the source-reported values, not ratios inferred from
rounded timings. Runtime reductions are displayed as **faster**, and increases as **slower**. These percentages
describe changes in kernel runtime relative to the original, not throughput speedups.

The live loader validates removal counts and timings. The UI keeps verification results usable
if the optional embedded study is missing or invalid; it does not substitute the old study file.

## Overview video and annotated files

The homepage includes a narrated 2:40 video with native playback controls and English and Chinese
subtitles. “How SentryWard works” follows “What SentryWard verifies” and presents the annotated
files of a CUTLASS GEMM from SentryWard's examples, verified against its PyTorch reference. File
tabs and numbered notes connect the PTX, input configuration, reference, binding, and verification
output; the PTX tab shows the start and end of the file and links to the full file.

The interactive demo, `/demo/`, is linked from the navigation and from “How SentryWard works”. It
runs the WebAssembly engine in `js/sim/` (SentryWard 0.1.0, synchronization and memory checks), live,
on the same CUTLASS GEMM and on a TileLang GEMM with a race; visitors can also check their own PTX
with its input.json. It registers `sw.js` when Run first needs threads; the worker makes the demo
page cross-origin isolated.

## Files

- `index.html`: project overview and usage.
- `js/home.mjs`, `js/examples.mjs`, `css/home.css`: homepage video styling and annotated example files.
- `demo/index.html`, `js/demo.mjs`, `css/demo.css`: the interactive demo; its recorded runs are `RUNS` in `js/examples.mjs`.
- `js/sim/`: browser engine assets: `engine.js` loads the WebAssembly engine and mirrors `sentryward.verify()`,
  `worker.js` runs it, `results.js` applies the public result contract, `examples/` holds the live examples, and
  `engine/` holds the build output and its licenses (`NOTICE.txt`).
- `scripts/engine/`: engine build script, the patch it applies to the sdist, and the SHA-256 shim that replaces OpenSSL.
- `sw.js`: cross-origin isolation worker for the demo page.
- `slack/index.html`: forwards `/slack/`, which every page's navigation links to, to the Slack workspace invite. When the invite link changes, update it here.
- `media/`: the overview film, its subtitles, and its poster.
- `blog/index.html`: technical article and author links.
- `blog/verifying-warp-specialized-gpu-kernels/index.html`: legacy redirect to `/blog/`, preserving query strings and section anchors.
- `css/style.css`: article and figure styles.
- `css/site.css`: shared navigation, homepage, and blog layouts.
- `results/index.html`, `css/results.css`: verification database page and responsive layout.
- `js/results.mjs`, `js/results-model.mjs`: database UI, filtering, and data validation.
- `js/results-source.mjs`: publication pointer, checksum-bound catalog, embedded study, and pinned input loading.
- `data/`: historical verification snapshot, input configurations, provenance, and synchronization study (not used by the live page).
- `js/kernel-inputs.mjs`, `scripts/kernel_inputs.py`: input hash verification and import.
- `js/sync-removal.mjs`, `scripts/sync_removal.py`: study validation, display semantics, and import.
- `scripts/update-verification-results.py`: authenticated, validated snapshot refresh.
- `tests/results-source.test.mjs`: snapshot identity, freshness, failure handling, studies, and input loading.
- `tests/results-detail.test.mjs`: current and historical detail rendering, including source and report links.
- `tests/results-model.test.mjs`: historical snapshot integrity and query behavior checks.
- `tests/home-examples.test.mjs`: bundled example lines, marks, and recorded witnesses match the PTX fixtures.
- `js/anim.js`: figure helpers and animation runtime.
- `js/figs1.js`, `js/figs2.js`, `js/figs3.js`: interactive figures.

Serve the repository root to preserve relative links and assets. Fonts and KaTeX load from external CDNs.

## Origin and license

The site was migrated from the `blog/` directory of
[wmdi/wasp_verification](https://github.com/wmdi/wasp_verification/tree/4645264bcbc910aee813db3a67f60ef4a4a190dd/blog),
including the saved homepage and blog navigation updates. The original Apache 2.0 license is preserved in [LICENSE](LICENSE).

The verifier implementation is in [gpu-verifier/sentryward](https://github.com/gpu-verifier/sentryward).
