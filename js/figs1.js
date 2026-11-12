/* Figures 1-3 of the blog: the running example (paper Fig. 2), two schedules of the buggy
   kernel (in the style of paper Fig. 7), and SentryWard's pipeline (paper Fig. 4), plus an
   unused mbarrier timeline (paper Fig. 1). Coordinates are the paper's TikZ coordinates in cm. */
(function () {
  'use strict';
  var S = SW;

  // A label preceded by a circled step number, as \step{n} in the paper.
  function stepLabel(g, x, y, n, text, o) {
    o = o || {};
    var fs = o.fs || 11.5, lines = text.split('\n').length;
    var top = y - (lines - 1) * 1.25 * fs / 2;
    var east = o.anchor === 'end';
    var c = S.el('g', { 'class': 'stepc' }, g);
    // CJK characters are about twice as wide as Latin ones.
    var first = text.split('\n')[0].replace(/[`*]/g, '');
    var w0 = (first.length + (first.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length) * fs * 0.52;
    var cx = east ? x - w0 - 12 : x + 8;
    S.el('circle', { cx: cx, cy: top, r: 8 }, c);
    S.text(c, cx, top, String(n), { fs: 10 });
    var t = S.text(g, east ? x : x + 20, y, text, { fs: fs, anchor: east ? 'end' : 'start', cls: o.cls });
    return { badge: c, text: t };
  }

  // ---------- An mbarrier timeline (paper Fig. 1), currently unused ----------
  S.figs['mbarrier'] = function (host) {
    var K = 66;
    function X(x) { return 22 + (x + 1.35) * K; }
    function Y(y) { return 40 + (1.1 - y) * K; }
    var XS = [1.0, 3.5, 6.0, 8.5, 11.8], VALS = ['(2, 0)', '(1, 0)', '(1, 64)', '(1, 0)', '(2, 0)'];
    var TOPS = ['`arrive`', '`expect_tx(64)`', S.t('copy lands:\n`complete_tx(64)`'), S.t('`arrive`: state reaches\n(0, 0), phase 0 completes')];
    var BOTS = ['(−1, 0)', '(0, +64)', '(0, −64)', '(−1, 0)'];
    var MIDS = [2.25, 4.75, 7.25, 10.15];
    var steps = [
      { t: 0, label: S.t('<code>init(bar, 2)</code> starts phase 0 with two pending arrivals and no pending bytes.') },
      { t: 1.8, label: S.t('<code>arrive</code> removes one pending arrival.') },
      { t: 3.6, label: S.t('<code>expect_tx(64)</code> announces 64 bytes: the phase now also waits for them.') },
      { t: 5.4, label: S.t('A copy lands and subtracts its 64 bytes. One arrival is still pending, so phase 0 is not complete.') },
      { t: 7.4, label: S.t('The second <code>arrive</code> brings both counters to zero. Phase 0 completes, the counters reset for phase 1, and <code>wait(bar, 0)</code> returns.') }
    ];
    new S.Anim(host, {
      vb: [960, 236], minw: 680, duration: 10, steps: steps,
      alt: S.t('The state of an mbarrier through phase 0 and into phase 1.'),
      build: function (svg) {
        var hw = 0.675 * K, hh = 0.4 * K;
        S.text(svg, X(-0.55), Y(0), '`init`\n`(bar, 2)`', { fs: 12, cls: 'muted' });
        S.el('path', { d: S.path([[X(-0.55) + 30, Y(0)], [X(1.0) - hw - 1, Y(0)]]), 'class': 'ln' }, svg);
        var states = XS.map(function (x, i) {
          var g = S.el('g', null, svg);
          S.box(g, X(x), Y(0), 2 * hw, 2 * hh, i === 4 ? 'box st1' : 'box st', 3);
          S.text(g, X(x), Y(0), VALS[i], { fs: 13.5 });
          return g;
        });
        var arrows = [];
        for (var i = 0; i < 4; i++) {
          arrows.push({
            p: S.el('path', { d: S.path([[X(XS[i]) + hw + 1, Y(0)], [X(XS[i + 1]) - hw - 1, Y(0)]]), 'class': 'ln' + (i === 3 ? ' hb' : ''), pathLength: 1 }, svg),
            top: S.text(svg, X(MIDS[i]), Y(0.5), TOPS[i], { fs: 11.5, valign: 'bottom' }),
            bot: S.text(svg, X(MIDS[i]), Y(-0.5), BOTS[i], { fs: 11.5, valign: 'top', cls: 'hbtext' }),
            pts: [[X(XS[i]) + hw + 1, Y(0)], [X(XS[i + 1]) - hw - 1, Y(0)]]
          });
        }
        var br0 = S.el('path', { 'class': 'bracket' }, svg);
        var br0t = S.text(svg, X(4.75), Y(-1.38), S.t('phase 0 of `bar`'), { fs: 11.5, cls: 'muted' });
        var br1 = S.el('path', { 'class': 'bracket', d: S.path([[X(11.1), Y(-1.0)], [X(11.1), Y(-1.1)], [X(12.5), Y(-1.1)], [X(12.5), Y(-1.0)]]) }, svg);
        var br1t = S.text(svg, X(11.8), Y(-1.38), S.t('phase 1'), { fs: 11.5, cls: 'muted' });
        var wait = S.text(svg, X(10.15), Y(-1.38), S.t('`wait(bar, 0)`\nwaits'), { fs: 11.5, cls: 'muted' });
        var waitR = S.text(svg, X(10.15), Y(-1.38), S.t('`wait(bar, 0)`\nreturns'), { fs: 11.5, cls: 'badtext' });
        var dot = S.el('circle', { r: 4, 'class': 'dot' }, svg);
        var flash = S.el('rect', { x: X(11.8) - hw - 5, y: Y(0) - hh - 5, width: 2 * hw + 10, height: 2 * hh + 10, rx: 6, 'class': 'flash' }, svg);

        return function (t) {
          S.show(states[0], S.ramp(t, 0.1, 0.6));
          var dotOn = false;
          arrows.forEach(function (a, i) {
            var t0 = steps[i + 1].t + 0.15, t1 = t0 + 0.8;
            S.draw(a.p, S.ramp(t, t0, t1), 0);
            S.show(a.top, S.ramp(t, t0, t0 + 0.4));
            S.show(a.bot, S.ramp(t, t0 + 0.3, t0 + 0.7));
            S.show(states[i + 1], S.ramp(t, t1 - 0.1, t1 + 0.3));
            if (t > t0 && t < t1) {
              var p = S.along(a.pts, S.ramp(t, t0, t1));
              dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dotOn = true;
            }
          });
          S.show(dot, dotOn ? 1 : 0);
          // Phase 0's bracket grows with the states that belong to it.
          var right = 0.3 + 1.35;
          for (var k = 1; k < 4; k++) if (t >= steps[k].t + 0.95) right = XS[k] + 0.7;
          if (t >= steps[4].t + 0.6) right = 9.2;
          br0.setAttribute('d', S.path([[X(0.3), Y(-1.0)], [X(0.3), Y(-1.1)], [X(right), Y(-1.1)], [X(right), Y(-1.0)]]));
          S.show(br0, S.ramp(t, 0.3, 0.8));
          S.show(br0t, S.ramp(t, 0.3, 0.8));
          var done = S.ramp(t, steps[4].t + 0.95, steps[4].t + 1.3);
          S.show(br1, done);
          S.show(br1t, done);
          S.show(wait, S.ramp(t, 0.6, 1.0) * (1 - done));
          S.show(waitR, done);
          S.show(flash, S.bump(t, steps[4].t + 0.9, steps[4].t + 1.7));
        };
      }
    });
  };

  // ---------- Figure 1: the running example at a glance (paper Fig. 2) ----------
  S.figs['dataflow'] = function (host) {
    var K = 66;
    function X(x) { return 78 + x * K; }
    function Y(y) { return 26 + (5.45 - y) * K; }
    var steps = [
      { t: 0, label: S.t('Thread 0 initializes both barriers to expect one arrival, and a <code>syncthreads</code> makes sure all threads see them before any role starts.') },
      { t: 2.2, label: S.t('<b>1</b>&ensp;The producer’s <code>arrive.expect_tx</code> gives <code>full</code> its one arrival and announces 32 KB, the size of both tiles.') },
      { t: 4.6, label: S.t('<b>2</b>&ensp;The producer starts both TMA copies.') },
      { t: 6.8, label: S.t('<b>3</b>&ensp;Each copy reports its bytes to <code>full</code> when its data lands. Once all 32 KB have landed, phase 0 completes.') },
      { t: 9.8, label: S.t('<b>4</b>&ensp;The consumer was waiting for phase 0 of <code>full</code>, so it proceeds only now, with both tiles in shared memory.') },
      { t: 12.0, label: S.t('<b>5</b>&ensp;It starts the multiplication <code>acc ← sA · sB</code> on the tensor core.') },
      { t: 14.4, label: S.t('<b>6</b>&ensp;When the multiplication completes, the hardware arrives on <code>mma_done</code>, completing its phase 0.') },
      { t: 16.6, label: S.t('<b>7</b>&ensp;Every thread was waiting for phase 0 of <code>mma_done</code>; now the epilogue starts.') },
      { t: 18.6, label: S.t('<b>8</b>&ensp;Each thread <i>t</i> loads row <i>t</i> of the accumulator and stores it to row <i>t</i> of <i>C</i>.') }
    ];
    var T = {
      s1: [2.4, 3.2], tA: [5.0, 7.3], tB: [5.3, 8.4], s3a: [7.3, 7.8], s3b: [8.4, 8.9], done0: 8.9,
      s4: [10.0, 10.8], mm: [12.4, 13.8], s6: [14.6, 15.4], s7: [16.8, 17.6], rows: 18.9
    };
    new S.Anim(host, {
      vb: [944, 478], minw: 700, duration: 22.2, steps: steps, labels: false,
      alt: S.t('The running example: data moves from global memory through shared and tensor memory to C, coordinated by two barriers.'),
      build: function (svg) {
        var mw = 2.0 * K, mh = 1.0 * K;
        var MEM = [['ga', 0, 'global memory\n`A`, `B`'], ['sh', 2.9, 'shared memory\n`sA`, `sB`'], ['tm', 6.1, 'tensor memory\n`acc`'], ['rg', 8.95, S.t('registers of *t*\nrow *t* of `acc`')], ['gc', 11.85, 'global memory\n*C*']];
        var mem = {};
        MEM.forEach(function (m) {
          mem[m[0]] = S.box(svg, X(m[1]), Y(4.4), mw, mh, 'box mem', 3);
          S.text(svg, X(m[1]), Y(4.4), m[2], { fs: 12 });
        });
        for (var i = 0; i < 4; i++) {
          S.el('path', { d: S.path([[X(MEM[i][1]) + mw / 2 + 1, Y(4.4)], [X(MEM[i + 1][1]) - mw / 2 - 2, Y(4.4)]]), 'class': 'ln data' }, svg);
        }
        [['TMA copy', 1.45], [S.t('tensor-core MMA'), 4.5], [S.t('load'), 7.525], [S.t('store'), 10.4]].forEach(function (l) {
          S.text(svg, X(l[1]), Y(5.15), l[0], { fs: 11, valign: 'bottom', cls: 'muted' });
        });
        // Barriers, with their state (pending arrivals, pending bytes) as a second line.
        function barrier(x, name) {
          var b = S.box(svg, X(x), Y(2.2), 2.3 * K, 0.95 * K, 'box bar', 16);
          S.text(svg, X(x), Y(2.2) - 10, 'barrier `' + name + '`', { fs: 12 });
          var st = S.text(svg, X(x), Y(2.2) + 11, '', { fs: 11.5, cls: 'hbtext' });
          var fl = S.el('rect', { x: X(x) - 1.15 * K - 5, y: Y(2.2) - 0.475 * K - 5, width: 2.3 * K + 10, height: 0.95 * K + 10, rx: 20, 'class': 'flash' }, svg);
          return { b: b, st: st, fl: fl };
        }
        var full = barrier(2.9, 'full'), done = barrier(7.0, 'mma_done');
        function thread(x, a, b) {
          var r = S.box(svg, X(x), Y(-0.25), 1.95 * K, 0.9 * K, 'box', 3);
          S.text(svg, X(x), Y(-0.25) - 8, a, { fs: 12 });
          S.text(svg, X(x), Y(-0.25) + 10, b, { fs: 10.5, cls: 'muted' });
          return r;
        }
        var prod = thread(1.6, 'producer', S.t('thread 0'));
        var mmai = thread(4.65, 'consumer', S.t('thread 32'));
        var epi = thread(10.05, 'epilogue', S.t('all 128 threads'));
        var waitM = S.text(svg, X(4.65), Y(-0.25) + 0.45 * K + 13, S.t('waits for `full`'), { fs: 11, cls: 'muted it' });
        var waitE = S.text(svg, X(10.05), Y(-0.25) + 0.45 * K + 13, S.t('waits for `mma_done`'), { fs: 11, cls: 'muted it' });

        // Arrows: blue updates and releases, dashed starts.
        function arrow(pts, cls) {
          return { p: S.el('path', { d: S.path(pts), 'class': 'ln ' + cls, pathLength: cls === 'start' ? null : 1 }, svg), pts: pts };
        }
        var A = {
          s1: arrow([[X(2.0), Y(0.2)], [X(2.2), Y(1.75)]], 'hb'),
          s2: arrow([[X(1.3), Y(0.2)], [X(1.3), Y(4.35)]], 'start'),
          s3: arrow([[X(2.9), Y(3.9)], [X(2.9), Y(2.68)]], 'hb'),
          s4: arrow([[X(3.65), Y(1.75)], [X(3.9), Y(0.2)]], 'hb'),
          s5: arrow([[X(5.45), Y(0.2)], [X(4.85), Y(4.35)]], 'start'),
          s6: arrow([[X(6.4), Y(3.9)], [X(6.65), Y(2.68)]], 'hb'),
          s7: arrow([[X(7.8), Y(1.75)], [X(9.35), Y(0.2)]], 'hb'),
          s8a: arrow([[X(9.6), Y(0.2)], [X(8.95), Y(3.85)]], 'start'),
          s8b: arrow([[X(10.4), Y(0.2)], [X(10.4), Y(4.35)]], 'start')
        };
        var L = [
          stepLabel(svg, X(2.3), Y(0.95), 1, S.t('arrive,\nannounce\n32 KB'), { cls: 'hbtext' }),
          stepLabel(svg, X(1.2), Y(2.2), 2, S.t('start\ncopies'), { anchor: 'end' }),
          stepLabel(svg, X(3.0), Y(3.3), 3, S.t('bytes\nland'), { cls: 'hbtext' }),
          stepLabel(svg, X(3.95), Y(0.75), 4, S.t('release'), { cls: 'hbtext' }),
          stepLabel(svg, X(5.05), Y(3.3), 5, S.t('start\nMMA')),
          stepLabel(svg, X(6.7), Y(3.35), 6, S.t('MMA done:\narrive'), { cls: 'hbtext' }),
          stepLabel(svg, X(8.55), Y(0.75), 7, S.t('release'), { anchor: 'end', cls: 'hbtext' }),
          stepLabel(svg, X(10.5), Y(2.3), 8, S.t('load and\nstore row *t*'))
        ];
        // Moving data.
        function chip(label, w, h) {
          var g = S.el('g', { opacity: 0 }, svg);
          S.box(g, 0, 0, w, h, 'box chip', 2);
          if (label) S.text(g, 0, 0, label, { fs: 11 });
          return g;
        }
        var cA = chip('*A*', 20, 20), cB = chip('*B*', 20, 20), mA = chip('', 14, 14), mB = chip('', 14, 14);
        var rows = [chip('', 46, 7), chip('', 46, 7), chip('', 46, 7)];
        var dot = S.el('circle', { r: 4.2, 'class': 'dot', opacity: 0 }, svg);
        function at(g, x, y, op) { g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')'); S.show(g, op); }
        function moveChip(g, t, a, b, x0, x1, y) {
          if (t <= a || t >= b) { S.show(g, 0); return; }
          var u = S.ramp(t, a, b);
          at(g, S.lerp(x0, x1, u), y, Math.min(1, 5 * Math.min(u, 1 - u) + 0.2));
        }

        return function (t) {
          // Barrier states.
          var fs, ds;
          if (t < T.s1[1]) fs = S.t('phase 0: (1, 0)');
          else if (t < T.s3a[1]) fs = S.t('phase 0: (0, 32 KB)');
          else if (t < T.done0) fs = S.t('phase 0: (0, 16 KB)');
          else if (t < T.done0 + 0.7) fs = S.t('phase 0 completes');
          else fs = S.t('phase 1: (1, 0)');
          if (t < T.s6[1]) ds = S.t('phase 0: (1, 0)');
          else if (t < T.s6[1] + 0.7) ds = S.t('phase 0 completes');
          else ds = S.t('phase 1: (1, 0)');
          if (full._s !== fs) { S.setText(full.st, fs, 11.5); full._s = fs; }
          if (done._s !== ds) { S.setText(done.st, ds, 11.5); done._s = ds; }
          S.show(full.fl, Math.max(S.bump(t, 0.2, 1.4), S.bump(t, T.done0 - 0.1, T.done0 + 0.8)));
          S.show(done.fl, Math.max(S.bump(t, 0.2, 1.4), S.bump(t, T.s6[1] - 0.1, T.s6[1] + 0.8)));

          // Arrows and labels: faint until their step, then drawn.
          var stepOf = { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, s6: 6, s7: 7, s8a: 8, s8b: 8 };
          var dotPos = null;
          Object.keys(A).forEach(function (k) {
            var a = A[k], st = steps[stepOf[k]].t;
            var t0 = k === 's3' ? T.s3a[0] : st + 0.2, t1 = t0 + 0.7;
            var u = S.ramp(t, t0, t1);
            if (a.p.classList.contains('start')) S.show(a.p, 0.18 + 0.82 * u);
            else S.draw(a.p, u, 0.18);
            var pulses = { s1: [T.s1], s3: [T.s3a, T.s3b], s4: [T.s4], s6: [T.s6], s7: [T.s7] }[k] || [];
            pulses.forEach(function (w) { if (t > w[0] && t < w[1]) dotPos = S.along(a.pts, S.ramp(t, w[0], w[1])); });
          });
          if (dotPos) { dot.setAttribute('cx', dotPos[0]); dot.setAttribute('cy', dotPos[1]); }
          S.show(dot, dotPos ? 1 : 0);
          L.forEach(function (l, i) {
            var st = steps[i + 1].t, nextT = i + 2 < steps.length ? steps[i + 2].t : 1e9;
            S.show(l.text, t < st ? 0.3 : 1);
            S.show(l.badge, t < st ? 0.3 : 1);
            l.badge.setAttribute('class', 'stepc' + (t >= st && t < nextT ? ' on' : ''));
          });

          // Roles.
          prod.setAttribute('class', 'box' + (t >= steps[1].t && t < steps[3].t ? ' on' : ''));
          mmai.setAttribute('class', 'box' + (t >= steps[4].t && t < steps[7].t ? ' on' : ''));
          epi.setAttribute('class', 'box' + (t >= steps[7].t ? ' on' : ''));
          S.show(waitM, t >= 1.2 && t < T.s4[1] ? 1 : 0);
          S.show(waitE, t >= 1.2 && t < T.s7[1] ? 1 : 0);

          // Data.
          moveChip(cA, t, T.tA[0], T.tA[1], X(0.45), X(2.35), Y(4.4) - 13);
          moveChip(cB, t, T.tB[0], T.tB[1], X(0.45), X(2.35), Y(4.4) + 13);
          moveChip(mA, t, T.mm[0], T.mm[1] - 0.3, X(3.4), X(5.6), Y(4.4) - 11);
          moveChip(mB, t, T.mm[0] + 0.3, T.mm[1], X(3.4), X(5.6), Y(4.4) + 11);
          rows.forEach(function (r, k) {
            var a = T.rows + k * 0.5;
            if (t > a && t < a + 0.9) moveChip(r, t, a, a + 0.9, X(6.6), X(8.6), Y(4.4) + (k - 1) * 12);
            else moveChip(r, t, a + 1.0, a + 1.9, X(9.3), X(11.35), Y(4.4) + (k - 1) * 12);
          });
          mem.sh.setAttribute('class', 'box mem' + (t >= T.tB[1] ? ' filled' : ''));
          mem.tm.setAttribute('class', 'box mem' + (t >= T.mm[1] ? ' filled' : ''));
          mem.rg.setAttribute('class', 'box mem' + (t >= T.rows + 0.9 ? ' filled' : ''));
          mem.gc.setAttribute('class', 'box mem' + (t >= T.rows + 2.9 ? ' filled' : ''));
        };
      }
    });
  };

  // ---------- Figure 2: two schedules of the buggy kernel, whose epilogue does not wait ----------
  // In the style of paper Fig. 7. Like the animations, the steps advance on their own while the
  // figure is on screen, loop, and pause on click; the previous and next buttons step by hand.
  S.figs['schedules'] = function (host) {
    // Each row: event, state of mma_done, note, row class, and the step at which it appears.
    var A = [
      ['init(<code>mma_done</code>, 1)', '(1, 0)', '', '', 0],
      [S.t('MMA and commit issued'), '', '', '', 0],
      [S.t('Epilogue reads <code>acc</code>'), '', S.t('<b>not yet written</b>'), 'bad', 1],
      [S.t('Tensor core writes <code>acc</code>'), '', '', '', 2],
      [S.t('Commit arrives'), '(0, 0)', S.t('<b>phase 0 completes</b>'), 'ph', 2]
    ];
    var B = [
      ['init(<code>mma_done</code>, 1)', '(1, 0)', '', '', 0],
      [S.t('MMA and commit issued'), '', '', '', 0],
      [S.t('Tensor core writes <code>acc</code>'), '', '', '', 1],
      [S.t('Commit arrives'), '(0, 0)', S.t('<b>phase 0 completes</b>'), 'ph', 1],
      [S.t('Epilogue reads <code>acc</code>'), '', S.t('<b>already written</b>'), 'good', 2]
    ];
    var LABELS = [
      S.t('In both executions, the copies land and complete phase 0 of <code>full</code>, as in the correct kernel, and the consumer issues the MMA and the commit. Since the epilogue no longer waits, nothing holds back its read of <code>acc</code>.'),
      S.t('In Schedule A, the epilogue reads <code>acc</code> right away, before the tensor core has written it. In Schedule B, the epilogue happens to be slow: the tensor core writes <code>acc</code> first, and the commit\u2019s arrival completes phase 0 of <code>mma_done</code>.'),
      S.t('In Schedule A, the tensor core writes <code>acc</code> only after the read, and phase 0 completes just the same. The barrier behaved the same way in both executions; only in Schedule B does the epilogue read the product.')
    ];
    var wrap = S.div('anim', host);
    var head = S.div('stepper-head', wrap);
    var label = S.div('anim-step', head);
    function button(cls, title, d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'step-btn ' + cls;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.appendChild(b);
      return b;
    }
    var prev = button('prev', 'Previous step', 'M10.5 2.5 5 8l5.5 5.5');
    var next = button('next', 'Next step', 'M5.5 2.5 11 8l-5.5 5.5');
    var grid = S.div('sched', wrap);
    function table(title, rows) {
      var col = S.div('sched-col', grid);
      S.div('sched-title', col, title);
      var t = document.createElement('table');
      t.className = 'booktabs';
      t.innerHTML = S.t('<thead><tr><th>Event</th><th>State</th><th></th></tr></thead>');
      var tb = document.createElement('tbody');
      t.appendChild(tb);
      col.appendChild(t);
      return rows.map(function (r) {
        var tr = document.createElement('tr');
        if (r[3]) tr.className = r[3];
        tr.innerHTML = '<td>' + r[0] + '</td><td class="st">' + r[1] + '</td><td>' + r[2] + '</td>';
        tb.appendChild(tr);
        return { tr: tr, step: r[4] };
      });
    }
    var ra = table(S.t('<b>Schedule A:</b> the epilogue reads first'), A);
    var rb = table(S.t('<b>Schedule B:</b> the tensor core writes first'), B);
    var cur = -1;
    function show(k) {
      if (k < 0 || k >= LABELS.length) return;
      var forward = k > cur;
      cur = k;
      label.innerHTML = LABELS[k];
      ra.concat(rb).forEach(function (row) {
        var tr = row.tr;
        tr.style.opacity = row.step <= k ? 1 : 0;
        tr.classList.remove('fresh');
        if (forward && row.step === k && k > 0) { void tr.offsetWidth; tr.classList.add('fresh'); }
      });
      prev.disabled = k === 0;
      next.disabled = k === LABELS.length - 1;
    }
    // Each step stays long enough to read its label. Stepping by hand pauses the playback.
    var STEP = 6500, timer = null, visible = false, paused = false;
    function sync() {
      wrap.classList.toggle('paused', paused);
      clearTimeout(timer);
      timer = null;
      if (visible && !paused && !SW.reduced) timer = setTimeout(function () { show((cur + 1) % LABELS.length); sync(); }, STEP);
    }
    function step(k) { show(k); paused = true; sync(); }
    S.div('anim-pp', wrap, '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>');
    wrap.setAttribute('title', S.t('Click to pause or resume'));
    wrap.addEventListener('click', function () { paused = !paused; sync(); });
    prev.addEventListener('click', function (e) { e.stopPropagation(); step(cur - 1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); step(cur + 1); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { step(cur - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { step(cur + 1); e.preventDefault(); }
    });
    show(SW.reduced ? LABELS.length - 1 : 0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting && e.intersectionRatio > 0.3; sync(); });
      }, { threshold: [0, 0.3, 0.6] }).observe(wrap);
    } else { visible = true; sync(); }
  };

  // ---------- Figure 3: how SentryWard verifies a kernel (paper Fig. 4), static ----------
  S.figs['pipeline'] = function (host) {
    var KX = 68, KY = 62;
    function X(x) { return 106 + x * KX; }
    function Y(y) { return 18 + (1.62 - y) * KY; }
    var W = 2.3 * KX, WN = 2.4 * KX, H = 0.9 * KY;
    var stage = S.div('anim-stage', S.div('anim static', host));
    var svg = S.el('svg', { viewBox: '0 0 972 512', role: 'img', 'aria-label': S.t('The stages of SentryWard: specialization, two views, the well-synchronization check, the race and lifecycle check, memory elimination, and the expression check.') }, stage);
    svg.style.minWidth = '700px';
    var N = {};
    function node(id, x, y, w, cls, label) {
      var g = S.el('g', { 'class': 'pnode ' + cls }, svg);
      S.box(g, X(x), Y(y), w, H, 'box', 4);
      S.text(g, X(x), Y(y), label, { fs: 14 });
      N[id] = { x: X(x), y: Y(y), w: w, h: H };
    }
    node('kernel', 0, 1.15, W, 'input', S.t('PTX kernel +\nlaunch configuration'));
    node('spec', 0, -0.95, W, 'artifact', S.t('Specialized\nPTX program'));
    node('events', 3.17, 0, W, 'artifact', S.t('Event view'));
    node('values', 3.17, -1.9, W, 'artifact', S.t('Value view'));
    node('cert', 6.34, 0, W, 'stage', S.t('Well-synchronization\ncheck'));
    node('hb', 9.4, 0, WN, 'artifact', S.t('Happens-before\ngraph'));
    node('race', 9.4, -1.9, WN, 'stage', S.t('Race and\nlifecycle check'));
    node('serial', 9.4, -3.8, WN, 'artifact', S.t('Serialized program'));
    node('elim', 6.34, -3.8, W, 'stage', S.t('Memory elimination'));
    node('scalar', 3.17, -3.8, W, 'artifact', S.t('Scalar expressions'));
    node('equiv', 3.17, -5.7, W, 'stage', S.t('Expression check'));
    node('ref', 0, -5.7, W, 'input', S.t('Reference program +\nparameter binding'));
    function a(id, side) { return S.anchor(N[id], side); }
    function flow(pts, cls, label, lp) {
      var p = S.el('path', { d: S.path(pts), 'class': 'ln ' + (cls || '') }, svg);
      if (label) S.text(svg, lp[0], lp[1], label, { fs: 12.5, cls: lp[2] || 'muted', anchor: lp[3] || 'middle' });
      return p;
    }
    var sx = a('spec', 'e')[0] + 0.22 * KX;
    flow([a('kernel', 's'), a('spec', 'n')]);
    flow([a('spec', 'e'), [sx, a('spec', 'e')[1]], [sx, Y(0)], a('events', 'w')]);
    flow([a('spec', 'e'), [sx, a('spec', 'e')[1]], [sx, Y(-1.9)], a('values', 'w')]);
    flow([a('events', 'e'), a('cert', 'w')]);
    flow([a('cert', 'e'), a('hb', 'w')]);
    flow([a('cert', 'n'), [X(6.34), Y(1.15) + 18]], 'bad');
    flow([a('hb', 's'), a('race', 'n')]);
    flow([a('values', 'e'), a('race', 'w')], '', S.t('(symbolic) memory addresses'), [(X(3.17) + X(9.4)) / 2, Y(-1.9) - 10]);
    flow([a('race', 's'), a('serial', 'n')], '', S.t('race-free'), [X(9.4) + 8, (Y(-1.9) + Y(-3.8)) / 2, 'muted', 'start']);
    flow([a('race', 'e'), [a('race', 'e')[0] + 12, a('race', 'e')[1]]], 'bad');
    flow([a('serial', 'w'), a('elim', 'e')]);
    flow([a('values', 'se'), a('elim', 'nw')], '', S.t('symbolic tensor expressions'), [X(3.17) + 115, (Y(-1.9) + Y(-3.8)) / 2 - 4, 'muted', 'start']);
    flow([a('elim', 'w'), a('scalar', 'e')]);
    flow([a('scalar', 's'), a('equiv', 'n')]);
    flow([a('ref', 'e'), a('equiv', 'w')]);
    flow([a('equiv', 'e'), [X(6.34) - 70, Y(-5.7)]]);
    S.text(svg, X(6.34), Y(1.22), S.t('not well-synchronized\n(with a witness)'), { fs: 13, cls: 'badtext' });
    S.text(svg, a('race', 'e')[0] + 18, Y(-1.9), S.t('race\n(with a witness)'), { fs: 13, cls: 'badtext', anchor: 'start' });
    S.text(svg, X(6.34) - 60, Y(-5.7), S.t('equivalent / no proof found'), { fs: 13, anchor: 'start' });
  };
})();
