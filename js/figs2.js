/* Figures 4-7 of the blog: the event graph (paper Fig. 5), the happens-before graph
   (paper Fig. 8), the phase check (paper Fig. 9), and the two views and a race (paper Fig. 6).
   Figures 8 and 9 are plain HTML in the page. Layouts follow the paper's TikZ coordinates. */
(function () {
  'use strict';
  var S = SW;

  // ---------- The event-graph layout (figures/event-graph-layout.tex) ----------
  var KX = 66, KY = 35;
  function X(x) { return 24 + (x + 1.3) * KX; }
  function Y(y) { return 26 + (y + 0.95) * KY; }
  // id, x, y, label, kind (ev | hw | ph), width in cm
  var NODES = [
    ['i1', 0, 0, 'init `full`'],
    ['i2', 0, 1, 'init `mma_done`'],
    ['sync', 5.5, 2.1, S.t('`syncthreads`: one join event for all 128 threads'), 'ev', 13.6],
    ['ae', 0, 3.2, 'arrive.expect_tx 32 KB'],
    ['qa', 0, 4.2, S.t('tma A (issue)')],
    ['qb', 0, 5.2, S.t('tma B (issue)')],
    ['la', 2.65, 4.2, S.t('copy sA ← A'), 'hw', 2.1],
    ['ca', 2.65, 5.2, 'complete_tx 16 KB', 'hw', 2.1],
    ['lb', 2.65, 6.2, S.t('copy sB ← B'), 'hw', 2.1],
    ['cb', 2.65, 7.2, 'complete_tx 16 KB', 'hw', 2.1],
    ['vi0', 0, 7.2, S.t('wait `mma_done` (issue)')],
    ['wi', 5.45, 3.2, S.t('wait `full` (issue)')],
    ['wr', 5.45, 8.2, S.t('wait `full` (return)')],
    ['mi', 5.45, 9.3, S.t('mma (issue)')],
    ['ki', 5.45, 10.5, S.t('commit (issue)')],
    ['vi32', 5.45, 11.5, S.t('wait `mma_done` (issue)')],
    ['mx', 8.15, 9.3, S.t('mma (execute)\nacc ← sA · sB'), 'hw', 2.2],
    ['ka', 8.15, 10.5, 'arrive `mma_done`', 'hw', 2.2],
    ['vit', 11.0, 3.2, S.t('wait `mma_done` (issue)')],
    ['vr0', 0, 13.5, S.t('wait `mma_done` (return)')],
    ['vr32', 5.45, 13.5, S.t('wait `mma_done` (return)')],
    ['vrt', 11.0, 13.5, S.t('wait `mma_done` (return)')],
    ['ri0', 0, 14.5, S.t('tcgen05.ld (issue)')],
    ['rw0', 0, 15.8, S.t('wait::ld (return)')],
    ['st0', 0, 16.8, S.t('store *C*[0, :]')],
    ['rc0', 2.65, 14.5, S.t('read acc[0, :]\n(execute)'), 'hw', 2.1],
    ['ri32', 5.45, 14.75, S.t('tcgen05.ld (issue)')],
    ['rw32', 5.45, 15.75, S.t('wait::ld (return)')],
    ['st32', 5.45, 16.75, S.t('store *C*[32, :]')],
    ['rc32', 8.15, 15.75, S.t('read acc[32, :]\n(execute)'), 'hw', 2.2],
    ['rit', 11.0, 14.5, S.t('tcgen05.ld (issue)')],
    ['rwt', 11.0, 15.8, S.t('wait::ld (return)')],
    ['stt', 11.0, 16.8, S.t('store *C*[*t*, :]')],
    ['rct', 8.15, 14.5, S.t('read acc[*t*, :]\n(execute)'), 'hw', 2.2],
    ['ef', 5.45, 5.9, 'end(`full`, 0)', 'ph', 2.6],
    ['ed', 8.15, 12.5, 'end(`mma_done`, 0)', 'ph', 2.2]
  ];
  var G = {};
  NODES.forEach(function (n) {
    G[n[0]] = { id: n[0], x: X(n[1]), y: Y(n[2]), w: (n[5] || 2.6) * KX, h: n[3].indexOf('\n') >= 0 ? 38 : 27, label: n[3], kind: n[4] || 'ev' };
  });
  function A(id, side) { return S.anchor(G[id], side); }
  function vert(a, b) { return [A(a, 's'), A(b, 'n')]; }
  function hz(a, b, fs, ts) { return [A(a, fs || 'e'), A(b, ts || 'w')]; }
  function fromSync(b) { var p = A(b, 'n'); return [[p[0], G.sync.y + G.sync.h / 2], p]; }
  var PO = [
    ['i1', 'i2', vert('i1', 'i2')],
    ['i2', 'sync', [A('i2', 's'), [G.i2.x, G.sync.y - G.sync.h / 2]]],
    ['sync', 'ae', fromSync('ae')], ['sync', 'wi', fromSync('wi')], ['sync', 'vit', fromSync('vit')],
    ['ae', 'qa', vert('ae', 'qa')], ['qa', 'qb', vert('qa', 'qb')],
    ['qa', 'la', hz('qa', 'la')], ['la', 'ca', vert('la', 'ca')],
    ['qb', 'lb', hz('qb', 'lb')], ['lb', 'cb', vert('lb', 'cb')], ['qb', 'vi0', vert('qb', 'vi0')],
    ['wi', 'wr', (function () { var a = A('wi', 'e'), b = A('wr', 'e'); return [a, [a[0] + 10, a[1]], [a[0] + 10, b[1]], b]; })()],
    ['wr', 'mi', vert('wr', 'mi')], ['mi', 'mx', hz('mi', 'mx')], ['mx', 'ka', vert('mx', 'ka')],
    ['mi', 'ki', vert('mi', 'ki')], ['ki', 'ka', hz('ki', 'ka')], ['ki', 'vi32', vert('ki', 'vi32')],
    ['vi0', 'vr0', vert('vi0', 'vr0')], ['vi32', 'vr32', vert('vi32', 'vr32')], ['vit', 'vrt', vert('vit', 'vrt')]
  ];
  ['0', '32', 't'].forEach(function (c) {
    PO.push(['vr' + c, 'ri' + c, vert('vr' + c, 'ri' + c)]);
    PO.push(['ri' + c, 'rw' + c, vert('ri' + c, 'rw' + c)]);
    PO.push(['rw' + c, 'st' + c, vert('rw' + c, 'st' + c)]);
  });
  PO.push(['ri0', 'rc0', hz('ri0', 'rc0')], ['rc0', 'rw0', hz('rc0', 'rw0', 'sw', 'ne')]);
  PO.push(['ri32', 'rc32', hz('ri32', 'rc32')], ['rc32', 'rw32', hz('rc32', 'rw32', 'w', 'e')]);
  PO.push(['rit', 'rct', hz('rit', 'rct', 'w', 'e')], ['rct', 'rwt', hz('rct', 'rwt', 'se', 'nw')]);
  var HB = [
    ['ae', 'ef', (function () { var a = A('ae', 'e'), w = G.ef.x - G.ef.w / 2; return [a, [X(3.95), a[1]], [X(3.95), Y(5.72)], [w, Y(5.72)]]; })()],
    ['ca', 'ef', (function () { var a = A('ca', 'e'), w = G.ef.x - G.ef.w / 2; return [a, [a[0] + 7, a[1]], [a[0] + 7, Y(6.08)], [w, Y(6.08)]]; })()],
    ['cb', 'ef', [A('cb', 'e'), A('ef', 'sw')]],
    ['ef', 'wr', vert('ef', 'wr')],
    ['ka', 'ed', vert('ka', 'ed')],
    ['ed', 'vr32', [A('ed', 'sw'), A('vr32', 'ne')]],
    ['ed', 'vrt', (function () { var a = A('ed', 'e'), b = A('vrt', 'w'); return [a, [a[0] + 16, a[1]], [a[0] + 16, b[1]], b]; })()],
    ['ed', 'vr0', (function () { var a = A('ed', 'w'), b = A('vr0', 'e'); return [a, [X(1.5), a[1]], [X(1.5), b[1]], b]; })()]
  ];

  // The epilogue's waits on mma_done, which the buggy kernel omits, and the program-order
  // edges with which the buggy kernel goes straight to its tcgen05.ld.
  var EPI_WAITS = { vi0: 1, vr0: 1, vi32: 1, vr32: 1, vit: 1, vrt: 1 };
  var PO_BUGGY = [['qb', 'ri0', vert('qb', 'ri0')], ['ki', 'ri32', vert('ki', 'ri32')], ['sync', 'rit', fromSync('rit')]];

  // opts.phases adds the completion vertices and synchronization edges; opts.toggle also
  // draws the buggy kernel, with the parts that differ in groups of class only-c (correct
  // kernel only) and only-b (buggy kernel only).
  function drawGraph(svg, opts) {
    var gE = S.el('g', null, svg);
    var gEC = opts.toggle ? S.el('g', { 'class': 'only-c' }, svg) : gE;
    var gEB = opts.toggle ? S.el('g', { 'class': 'only-b' }, svg) : null;
    var gN = S.el('g', null, svg);
    var gNC = opts.toggle ? S.el('g', { 'class': 'only-c' }, svg) : gN;
    S.text(svg, X(1.2), Y(-0.95), S.t('thread 0'), { fs: 12, cls: 'role' });
    S.text(svg, X(6.7), Y(-0.95), S.t('thread 32'), { fs: 12, cls: 'role' });
    S.text(svg, X(11.0), Y(-0.95), S.t('thread *t* ∉ {0, 32}'), { fs: 12, cls: 'role' });
    var nodes = {}, edges = [];
    Object.keys(G).forEach(function (id) {
      var n = G[id];
      if (n.kind === 'ph' && !opts.phases) return;
      var g = S.el('g', null, EPI_WAITS[id] ? gNC : gN);
      var cls = 'box' + (n.kind === 'hw' ? ' hw' : n.kind === 'ph' ? ' ph' : '');
      var r = S.box(g, n.x, n.y, n.w, n.h, cls, 3);
      S.text(g, n.x, n.y, n.label, { fs: 11.5 });
      nodes[id] = { g: g, r: r, cls: cls };
    });
    function edge(e, kind, parent) {
      edges.push({ from: e[0], to: e[1], kind: kind, pts: e[2], p: S.el('path', { d: S.path(e[2]), 'class': kind === 'hb' ? 'ln hb' : 'ln' + (opts.faintPO ? ' faint' : ''), pathLength: 1 }, parent) });
    }
    PO.forEach(function (e) { edge(e, 'po', EPI_WAITS[e[0]] || EPI_WAITS[e[1]] ? gEC : gE); });
    if (opts.toggle) PO_BUGGY.forEach(function (e) { edge(e, 'po', gEB); });
    if (opts.phases) HB.forEach(function (e) { edge(e, 'hb', EPI_WAITS[e[0]] || EPI_WAITS[e[1]] ? gEC : gE); });
    return { nodes: nodes, edges: edges };
  }
  function setBox(nd, extra) {
    var c = nd.cls + (extra ? ' ' + extra : '');
    if (nd._c !== c) { nd.r.setAttribute('class', c); nd._c = c; }
  }

  // ---------- Figure 4: the event graph (static) ----------
  S.figs['event-graph'] = function (host) {
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 946 680', role: 'img', 'aria-label': S.t('The event graph of the running example: events of thread 0, thread 32, and any other thread t, with program-order edges.') }, stage);
    svg.style.minWidth = '760px';
    drawGraph(svg, {});
  };

  // A switch between the correct and the buggy kernel, placed above a figure. It returns a
  // function that selects a kernel and calls onChange with 'correct' or 'buggy'.
  function kernelSwitch(host, onChange) {
    var seg = S.div('seg', S.div('kswitch', host)), btns = {};
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Kernel');
    [['correct', S.t('Correct kernel')], ['buggy', S.t('Buggy kernel')]].forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = m[0];
      b.innerHTML = '<span class="kdot" aria-hidden="true"></span>' + m[1];
      b.addEventListener('click', function () { select(m[0]); });
      seg.appendChild(b);
      btns[m[0]] = b;
    });
    function select(m) {
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-pressed', String(k === m)); });
      onChange(m);
    }
    return select;
  }

  // ---------- Figure 5: the happens-before graphs of the correct and the buggy kernel ----------
  S.figs['hb-graph'] = function (host) {
    // Highlighted: the path from the MMA's execution to thread t's read in the correct kernel,
    // and in the buggy kernel the part of it that remains, with the unordered pair in red.
    var PATH = { correct: ['mx', 'ka', 'ed', 'vrt', 'rit', 'rct'], buggy: ['mx', 'ka', 'ed'] };
    var BOX = { correct: { mx: 'on', ka: 'on', vrt: 'on', rit: 'on', rct: 'on' }, buggy: { mx: 'bad', ka: 'on', rct: 'bad' } };
    var select = kernelSwitch(host, paint);
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 946 680', role: 'img', 'class': 'hbfig', 'aria-label': S.t('The happens-before graph of the correct or the buggy kernel: completion vertices and synchronization edges added to the event graph.') }, stage);
    svg.style.minWidth = '760px';
    var D = drawGraph(svg, { phases: true, faintPO: true, toggle: true });
    var note = S.el('g', { 'class': 'only-b' }, svg);
    S.text(note, G.ed.x, G.ed.y + G.ed.h / 2 + 19, S.t('no wait targets this phase'), { fs: 11.5, cls: 'badtext' });
    function paint(mode) {
      var p = PATH[mode], box = BOX[mode];
      svg.classList.toggle('buggy', mode === 'buggy');
      D.edges.forEach(function (e) {
        var i = p.indexOf(e.from), hl = i >= 0 && p[i + 1] === e.to;
        e.p.setAttribute('class', e.kind === 'hb' ? 'ln hb' + (hl ? ' path' : '') : 'ln' + (hl ? ' hb path' : ' faint'));
      });
      ['mx', 'ka', 'vrt', 'rit', 'rct'].forEach(function (id) { setBox(D.nodes[id], box[id] || ''); });
    }
    select('correct');
  };

  // ---------- Figure 6: can phase 0 of full complete early? (paper Fig. 9), static ----------
  S.figs['phase-check'] = function (host) {
    var K = 60, H = 34;
    function XA(x) { return 112 + x * K; }
    function XB(x) { return 590 + x * K; }
    function YY(y) { return 50 + y * K; }
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 930 300', role: 'img', 'aria-label': S.t('The updates to barrier full in phase 0: with separate announcements, the first announcement and the arrival of copy A can complete the phase early; in the correct kernel, only all three updates together complete it.') }, stage);
    svg.style.minWidth = '720px';
    function card(x, y, w, s, cls) {
      S.box(svg, x, y, w, H, 'box' + (cls ? ' ' + cls : ''), 3);
      S.text(svg, x, y, s, { fs: 11.5 });
    }
    function arrow(pts) { S.el('path', { d: S.path(pts), 'class': 'ln' }, svg); }
    // (a) Separate announcements: the first announcement and copy A can happen first and reach (0, 0).
    var W = 3.0 * K;
    card(XA(0), YY(0), W, '`arrive.expect_tx` 16 KB', 'bad');
    card(XA(0), YY(1.4), W, '`expect_tx` 16 KB', 'omit');
    card(XA(0), YY(2.8), W, S.t('copy B: `complete_tx` 16 KB'), 'omit');
    card(XA(3.5), YY(1.4), W, S.t('copy A: `complete_tx` 16 KB'), 'bad');
    arrow([[XA(0), YY(0) + H / 2], [XA(0), YY(1.4) - H / 2]]);
    arrow([[XA(0), YY(1.4) + H / 2], [XA(0), YY(2.8) - H / 2]]);
    arrow([[XA(0) + W / 2, YY(0)], [XA(3.5), YY(0)], [XA(3.5), YY(1.4) - H / 2]]);
    S.text(svg, XA(1.9), YY(2.35), S.t('Announce A, then copy A completes:\n(1, 0) \u2192 (0, 16 KB) \u2192 (0, 0)\nphase 0 completes early'), { fs: 12, lh: 1.3, valign: 'top', anchor: 'start', cls: 'badtext' });
    S.text(svg, XA(1.75), YY(3.75), S.t('(a) Separate announcements'), { fs: 12, cls: 'muted' });
    // (b) Correct kernel: the announcement always comes first, so only the complete phase reaches (0, 0).
    var WB = 2.6 * K, yb = YY(0) + H / 2 + 0.3 * K;
    card(XB(1.45), YY(0), WB, '`arrive.expect_tx` 32 KB');
    card(XB(0), YY(1.4), WB, S.t('copy A: `complete_tx` 16 KB'));
    card(XB(2.9), YY(1.4), WB, S.t('copy B: `complete_tx` 16 KB'));
    arrow([[XB(1.45), YY(0) + H / 2], [XB(1.45), yb], [XB(0), yb], [XB(0), YY(1.4) - H / 2]]);
    arrow([[XB(1.45), yb], [XB(2.9), yb], [XB(2.9), YY(1.4) - H / 2]]);
    S.text(svg, XB(1.45), YY(2.35), S.t('The announcement always comes first:\n(1, 0) \u2192 (0, 32 KB) \u2192 (0, 16 KB) \u2192 (0, 0)\nonly the complete phase reaches (0, 0)'), { fs: 12, lh: 1.3, valign: 'top', cls: 'goodtext' });
    S.text(svg, XB(1.45), YY(3.75), S.t('(b) Correct kernel'), { fs: 12, cls: 'muted' });
  };

  // ---------- Figure 7: the two views of the MMA and one epilogue thread, and the race ----------
  // Paper Fig. 6 (figures/views.tex): event view on top, value view below, and eventOf links.
  // Static; a switch above the figure selects the kernel.
  S.figs['views'] = function (host) {
    var K = 66;
    function X(x) { return 100 + x * K; }
    function Y(y) { return 24 + (1.55 - y) * 64; }
    var select = kernelSwitch(host, paint);
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 940 345', role: 'img', 'aria-label': S.t('The event view and the value view of the MMA and one epilogue thread: ordered in the correct kernel, a race on acc in the buggy kernel.') }, stage);
    svg.style.minWidth = '740px';
    S.text(svg, X(-1.245), Y(0), S.t('event view'), { fs: 11.5, cls: 'muted bold' }).setAttribute('transform', 'rotate(-90 ' + X(-1.245) + ' ' + Y(0) + ')');
    S.text(svg, X(-1.245), Y(-2.45), S.t('value view'), { fs: 11.5, cls: 'muted bold' }).setAttribute('transform', 'rotate(-90 ' + X(-1.245) + ' ' + Y(-2.45) + ')');
    S.el('path', { d: S.path([[X(-1.05), Y(-1.2)], [X(12.4), Y(-1.2)]]), 'class': 'sep' }, svg);
    S.text(svg, X(1.025), Y(1.25), S.t('MMA (thread 32 and tensor core)'), { fs: 12, cls: 'role' });
    S.text(svg, X(8.375), Y(1.25), S.t('epilogue (thread *t*)'), { fs: 12, cls: 'role' });
    // Event view.
    var ev = {}, ew = 1.85 * K, eh = 46;
    [['mi', 0, S.t('mma\n(issue)')], ['mx', 2.05, S.t('mma\n(execute)'), 'hw'], ['ri', 5.3, S.t('tcgen05.ld\n(issue)')],
     ['rc', 7.35, S.t('tcgen05.ld\n(execute)'), 'hw'], ['rw', 9.4, S.t('wait::ld\n(return)')], ['st', 11.45, S.t('store\n*C*[*t*, :]')]].forEach(function (n) {
      var cls = n[3] === 'hw' ? 'box hw' : 'box';
      var r = S.box(svg, X(n[1]), Y(0), ew, eh, cls, 3);
      S.text(svg, X(n[1]), Y(0), n[2], { fs: 11.5 });
      ev[n[0]] = { r: r, x: X(n[1]), y: Y(0), w: ew, h: eh, cls: cls };
    });
    [['mi', 'mx'], ['ri', 'rc'], ['rc', 'rw'], ['rw', 'st']].forEach(function (e) {
      S.el('path', { d: S.path([S.anchor(ev[e[0]], 'e'), S.anchor(ev[e[1]], 'w')]), 'class': 'ln' }, svg);
    });
    // In thread t's program, the issue of tcgen05.ld also precedes the return of wait::ld.
    var q0 = S.anchor(ev.ri, 'n'), q1 = S.anchor(ev.rw, 'n'), c = 0.9 * 0.3915 * (q1[0] - q0[0]);
    var cx = c * Math.cos(22 * Math.PI / 180), cy = c * Math.sin(22 * Math.PI / 180);
    S.el('path', { d: 'M' + q0[0] + ',' + q0[1] + ' C' + (q0[0] + cx) + ',' + (q0[1] - cy) + ' ' + (q1[0] - cx) + ',' + (q1[1] - cy) + ' ' + q1[0] + ',' + q1[1], 'class': 'ln' }, svg);
    // Synchronization through mma_done: present in the correct kernel only.
    var hbPts = [S.anchor(ev.mx, 'e'), S.anchor(ev.ri, 'w')];
    var hb = S.el('path', { d: S.path(hbPts), 'class': 'ln hb' }, svg);
    var gone = S.el('path', { d: S.path(hbPts), 'class': 'ln gone' }, svg);
    var hbx = (hbPts[0][0] + hbPts[1][0]) / 2;
    var hbLab = S.text(svg, hbx, Y(0) - 7, S.t('→_{hb} via\n`mma_done`'), { fs: 11.5, cls: 'hbtext', valign: 'bottom' });
    var cross = S.el('path', { d: 'M' + (hbx - 7) + ',' + (Y(0) - 7) + ' L' + (hbx + 7) + ',' + (Y(0) + 7) + ' M' + (hbx + 7) + ',' + (Y(0) - 7) + ' L' + (hbx - 7) + ',' + (Y(0) + 7), 'class': 'xmark' }, svg);
    // Value view.
    var ops = {};
    function op(id, x, y, label, mem) {
      var w = label.replace(/[`*_]/g, '').length * 6.6 + 20;
      var cls = mem ? 'box memop' : 'box';
      var r = S.box(svg, X(x), Y(y), w, 30, cls, 3);
      S.text(svg, X(x), Y(y), label, { fs: 11.5 });
      ops[id] = { r: r, x: X(x), y: Y(y), w: w, h: 30, cls: cls };
    }
    op('la', 0.35, -1.95, S.t('load `sA`'), true);
    op('lb', 1.7, -1.95, S.t('load `sB`'), true);
    op('mm', 1.025, -2.95, '`matmul`', false);
    op('sacc', 3.0, -2.95, S.t('store `acc`'), true);
    op('lr', 7.35, -1.95, S.t('load row *t* of `acc`'), true);
    op('sr', 11.45, -1.95, S.t('store row *t* of *C*'), true);
    [
      [S.anchor(ops.la, 's'), S.anchor(ops.mm, 'n')],
      [S.anchor(ops.lb, 's'), S.anchor(ops.mm, 'n')],
      [S.anchor(ops.mm, 'e'), S.anchor(ops.sacc, 'w')],
      [S.anchor(ops.lr, 'e'), S.anchor(ops.sr, 'w')]
    ].forEach(function (pts) { S.el('path', { d: S.path(pts), 'class': 'ln' }, svg); });
    // eventOf: the event that performs each memory operation.
    var mxs = S.anchor(ev.mx, 's');
    [
      [S.anchor(ops.la, 'n'), [mxs[0] - 0.6 * K, mxs[1] + 1]],
      [S.anchor(ops.lb, 'n'), [mxs[0], mxs[1] + 1]],
      [S.anchor(ops.sacc, 'n'), [mxs[0] + 0.7 * K, mxs[1] + 1]],
      [S.anchor(ops.lr, 'n'), [ev.rc.x, mxs[1] + 1]],
      [S.anchor(ops.sr, 'n'), [ev.st.x, mxs[1] + 1]]
    ].forEach(function (pts) { S.el('path', { d: S.path(pts), 'class': 'ln link' }, svg); });
    S.text(svg, ev.rc.x + 8, Y(-0.82), S.t('performed by'), { fs: 11, cls: 'goodtext', anchor: 'start' });
    // The race: the store to acc and the load of row t, unordered in the buggy kernel.
    var raceLn = S.el('path', { d: S.path([S.anchor(ops.sacc, 'e'), S.anchor(ops.lr, 'w')]), 'class': 'ln race' }, svg);
    var raceLab = S.text(svg, X(5.15), Y(-2.85), S.t('race on `acc`'), { fs: 12.5, cls: 'badtext bold' });
    function paint(mode) {
      var buggy = mode === 'buggy';
      S.show(hb, buggy ? 0 : 1);
      S.show(hbLab, buggy ? 0.3 : 1);
      S.show(gone, buggy ? 0.6 : 0);
      [cross, raceLn, raceLab].forEach(function (e) { S.show(e, buggy ? 1 : 0); });
      ['mx', 'rc'].forEach(function (k) { ev[k].r.setAttribute('class', ev[k].cls + (buggy ? ' bad' : ' good')); });
      ['sacc', 'lr'].forEach(function (k) { ops[k].r.setAttribute('class', ops[k].cls + (buggy ? ' bad' : ' good')); });
    }
    select('correct');
  };
})();
