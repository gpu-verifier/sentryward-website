/* Figures 10-13 of the blog. Figures 10-12 show the issues in the results, each as a small
   static slice of the happens-before graph: white boxes are thread events, shaded boxes
   asynchronous events, and blue edges orders through a barrier. Figure 13 shows the kernel
   time after removing redundant synchronization. */
(function () {
  'use strict';
  var S = SW;

  // nodes: {id: [x, y, label, class, width]}; two-line labels get taller boxes.
  function graph(host, vb, alt, nodes) {
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 ' + vb[0] + ' ' + vb[1], role: 'img', 'aria-label': alt }, stage);
    svg.style.minWidth = '600px';
    var gE = S.el('g', null, svg), gN = S.el('g', null, svg), N = {};
    Object.keys(nodes).forEach(function (id) {
      var n = nodes[id], w = n[4] || 160, h = n[2].indexOf('\n') >= 0 ? 40 : 28;
      S.box(gN, n[0], n[1], w, h, 'box' + (n[3] ? ' ' + n[3] : ''), 3);
      S.text(gN, n[0], n[1], n[2], { fs: 11.5 });
      N[id] = { x: n[0], y: n[1], w: w, h: h };
    });
    return {
      at: function (id, side) { return S.anchor(N[id], side); },
      edge: function (pts, cls) { return S.el('path', { d: S.path(pts), 'class': 'ln' + (cls ? ' ' + cls : '') }, gE); },
      text: function (x, y, s, cls, anchor) { return S.text(svg, x, y, s, { fs: 11.5, cls: cls, anchor: anchor }); },
      role: function (x, y, s, anchor) { return S.text(svg, x, y, s, { fs: 12, cls: 'role', anchor: anchor }); },
      cross: function (p) {
        S.el('path', { d: 'M' + (p[0] - 6) + ',' + (p[1] - 6) + ' L' + (p[0] + 6) + ',' + (p[1] + 6) + ' M' + (p[0] + 6) + ',' + (p[1] - 6) + ' L' + (p[0] - 6) + ',' + (p[1] + 6), 'class': 'xmark' }, svg);
      }
    };
  }
  function mid(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }

  // ---------- Figure 11: TileLang, the copy of tile k + 2 races with the MMA of tile k ----------
  S.figs['bug-tilelang'] = function (host) {
    var g = graph(host, [760, 230], S.t('In TileLang’s pipelined GEMM, the copy of tile k + 2 into buffer s is not ordered after the MMA of tile k, which reads buffer s asynchronously.'), {
      iss: [175, 70, S.t('issue MMA\nof tile *k*'), '', 150],
      cp: [415, 70, S.t('copy tile *k* + 2\ninto buffer *s*'), 'bad', 160],
      wt: [655, 70, S.t('wait for the MMA\nof tile *k* returns'), '', 160],
      mx: [175, 180, S.t('MMA of tile *k*\nreads buffer *s*'), 'hw bad', 150],
      cm: [415, 180, S.t('commit arrives\non the barrier'), 'hw', 160]
    });
    g.role(14, 70, S.t('thread'), 'start');
    g.role(14, 180, S.t('tensor core'), 'start');
    g.edge([g.at('iss', 'e'), g.at('cp', 'w')]);
    g.edge([g.at('cp', 'e'), g.at('wt', 'w')]);
    g.edge([g.at('iss', 's'), g.at('mx', 'n')]);
    g.edge([g.at('mx', 'e'), g.at('cm', 'w')]);
    var p = g.at('cm', 'e'), q = g.at('wt', 's');
    g.edge([p, [q[0], p[1]], q], 'hb');
    g.text((p[0] + q[0]) / 2 - 8, p[1] + 16, S.t('→_{hb} via the barrier'), 'hbtext');
    var r0 = g.at('cp', 'sw'), r1 = g.at('mx', 'ne');
    g.edge([r0, r1], 'race');
    var m = mid(r0, r1);
    g.text(m[0] + 14, m[1] + 4, S.t('race on buffer *s*'), 'badtext bold', 'start');
  };

  // ---------- Figure 12: CUTLASS, the statistics store races with the correction load ----------
  S.figs['bug-cutlass-stats'] = function (host) {
    var g = graph(host, [760, 240], S.t('In CUTLASS’s attention example, the arrival does not wait for the asynchronous statistics store, so the store is not ordered before the correction warpgroup’s load.'), {
      st: [95, 70, S.t('issue `tcgen05.st`\nof the statistics'), '', 160],
      ar: [270, 70, S.t('arrive on\nthe barrier'), '', 120],
      wt: [505, 70, S.t('wait returns'), '', 120],
      ld: [665, 70, S.t('`tcgen05.ld` reads\nthe statistics'), 'hw bad', 170],
      wr: [95, 185, S.t('store writes\nthe statistics'), 'hw bad', 160]
    });
    g.role(182, 24, 'softmax warpgroup');
    g.role(585, 24, 'correction warpgroup');
    g.edge([g.at('st', 'e'), g.at('ar', 'w')]);
    g.edge([g.at('st', 's'), g.at('wr', 'n')]);
    g.edge([g.at('ar', 'e'), g.at('wt', 'w')], 'hb');
    var a = g.at('ar', 'e'), b = g.at('wt', 'w');
    g.text((a[0] + b[0]) / 2, a[1] - 22, S.t('→_{hb} via\nthe barrier'), 'hbtext');
    g.edge([g.at('wt', 'e'), g.at('ld', 'w')]);
    // The ordering that tcgen05.wait::st would provide is missing.
    var g0 = g.at('wr', 'ne'), g1 = g.at('ar', 's');
    g.edge([g0, g1], 'gone');
    var x = mid(g0, g1);
    g.cross(x);
    g.text(x[0] + 12, x[1] + 4, S.t('no `tcgen05.wait::st`'), 'badtext', 'start');
    var r0 = g.at('wr', 'e'), r1 = g.at('ld', 's');
    g.edge([r0, r1], 'race');
    g.text(470, 148, S.t('race on the statistics'), 'badtext bold');
  };

  // ---------- Figure 10: PyTorch, the target gradient is scaled before it is written ----------
  S.figs['bug-pytorch'] = function (host) {
    var g = graph(host, [760, 240], S.t('In PyTorch 2.8.0\u2019s MultiMarginLoss backward kernel, thread 0\u2019s write of the target class\u2019s gradient is not ordered before another thread scales that entry.'), {
      bar: [380, 56, '`__syncthreads()`', '', 560],
      sum: [230, 120, S.t('sum the shared buffer'), '', 190],
      wr: [230, 195, S.t('write `gradInput`[*target*]'), 'bad', 190],
      sc: [530, 195, S.t('scale `gradInput`[*target*]'), 'bad', 190]
    });
    g.role(230, 22, S.t('thread 0'));
    g.role(530, 22, S.t('thread that owns the target class'));
    g.edge([[230, 70], g.at('sum', 'n')]);
    g.edge([g.at('sum', 's'), g.at('wr', 'n')]);
    g.edge([[530, 70], g.at('sc', 'n')]);
    // PyTorch 2.9.0 adds a barrier here.
    g.edge([[110, 158], [650, 158]], 'gone');
    g.text(380, 146, S.t('missing `__syncthreads()`'), 'badtext');
    g.edge([g.at('wr', 'e'), g.at('sc', 'w')], 'race');
    g.text(380, 218, S.t('race on `gradInput`[*target*]'), 'badtext bold');
  };

  // ---------- Figure 13: kernel time after removing redundant synchronization ----------
  S.figs['sync-removal'] = function (host) {
    // Reduction in kernel time (%) on a B200 for the 44 kernels that were reduced at both the
    // example inputs and larger inputs (examples/index.md, PR #303); 0 is no measurable change.
    var SETS = [
      { key: 'example', label: S.t('Example inputs'), median: 7.5,
        note: S.t('48.6% of synchronization removed \u00b7 35 of 44 kernels faster'),
        data: [4.1, 11, 13.4, 13.3, 9.8, 14.1, 0, 9.3, 6.7, 3.3, 11, 0, 10.2, 14.5, 13.8, 2.7, 11.5,
                6, 6.5, 5.2, 8.2, 12.7, 9.2, 11.6, 9.6, 0, 0, 5.9, 0, 13.5, 37.5, 12.5, 4.2, -2.5,
                3.9, 2.9, 15.9, 16, 0, 0, 0, 5.1, 10.8, 6.9] },
      { key: 'larger', label: S.t('Larger inputs'), median: 3.0,
        note: S.t('42.4% of synchronization removed \u00b7 37 of 44 kernels faster'),
        data: [2.4, 4.7, 6.7, 6.3, 0, 5.2, 2.9, 3, 1.9, 1.6, 2.7, 0.4, 8.3, 1.1, 0.8, 2.8, 6.1, 0,
                4, 2.8, 4.9, 5, 5.3, 4.1, 3.8, 1, 0, 3.4, 0, 2.2, 14.9, 3.5, 1.4, 0, 3.8, 2.7, 16,
                16, 0.9, 0, 0, 4.6, 4.5, 4] }
    ];
    var X0 = 60, X1 = 730, LO = -5, HI = 40, MID = 98, BOT = 166, R = 5;
    function X(v) { return X0 + (v - LO) / (HI - LO) * (X1 - X0); }
    var seg = S.div('seg', S.div('kswitch', host)), btns = {}, groups = {};
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', S.t('Input size'));
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 760 216', role: 'img', 'aria-label': S.t('One dot per kernel on an axis of reduction in kernel time. At the example inputs, the median reduction is 7.5 percent; at larger inputs, 3.0 percent.') }, stage);
    svg.style.minWidth = '600px';
    [0, 10, 20, 30, 40].forEach(function (v) {
      S.el('line', { x1: X(v), y1: 30, x2: X(v), y2: BOT, 'class': v === 0 ? 'sr-zero' : 'sr-grid' }, svg);
      S.text(svg, X(v), BOT + 14, v + '%', { fs: 11, cls: 'muted' });
    });
    S.text(svg, (X0 + X1) / 2, BOT + 36, S.t('reduction in kernel time'), { fs: 12 });
    SETS.forEach(function (set) {
      var g = S.el('g', null, svg), placed = [];
      S.el('line', { x1: X(set.median), y1: 26, x2: X(set.median), y2: BOT, 'class': 'sr-median' }, g);
      S.text(g, X(set.median) + 5, 20, S.t('median ') + set.median.toFixed(1) + '%', { fs: 11, cls: 'hbtext', anchor: 'start' });
      S.text(g, X1, 20, set.note, { fs: 11, cls: 'muted', anchor: 'end' });
      // A simple beeswarm: each dot takes the closest free height to the axis line.
      set.data.slice().sort(function (a, b) { return a - b; }).forEach(function (v) {
        var x = X(v), dy = 0;
        for (var k = 0; k < 40; k++) {
          dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * R + 1);
          if (!placed.some(function (p) { return Math.hypot(p[0] - x, p[1] - dy) < 2 * R + 1; })) break;
        }
        placed.push([x, dy]);
        S.el('circle', { cx: x.toFixed(1), cy: (MID + dy).toFixed(1), r: R, 'class': 'sr-dot' }, g);
      });
      groups[set.key] = g;
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = set.label;
      b.addEventListener('click', function () { select(set.key); });
      seg.appendChild(b);
      btns[set.key] = b;
    });
    function select(key) {
      Object.keys(groups).forEach(function (k) {
        groups[k].style.display = k === key ? '' : 'none';
        btns[k].setAttribute('aria-pressed', String(k === key));
      });
    }
    select('example');
  };
})();
