/* SentryWard blog: a small engine for looping, GIF-like animations of the paper's figures.
   Each figure is drawn once and then rendered as a function of time. A figure plays
   while it is on screen, loops, and pauses on click. Plain script, so the page also works
   when opened from the file system. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SW = (window.SW = { figs: {}, all: [] });
  // Translates English text into the page's language (its <html lang>) using the dictionary
  // that js/i18n/<lang>.js registers; text without a translation stays in English.
  var DICT = (window.SW_I18N || {})[document.documentElement.lang] || {};
  SW.t = function (en) { return Object.prototype.hasOwnProperty.call(DICT, en) ? DICT[en] : en; };
  SW.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- DOM ----------
  SW.el = function (tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  SW.div = function (cls, parent, html) {
    var e = document.createElement('div');
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };

  // Rich SVG text. Markup: `code`, *math italic* (a whole word in text italic), _x or _{...}
  // for a subscript, ^x or ^{...} for a superscript. A bare _x is a subscript only if no
  // letter follows it, so that names such as expect_tx stay intact.
  var TOK = /(`[^`]*`|\*[^*]+\*|_\{[^}]*\}|_[A-Za-z0-9](?![A-Za-z0-9])|\^\{[^}]*\}|\^[A-Za-z0-9](?![A-Za-z0-9]))/;
  SW.rich = function (parent, s, fs) {
    var back = 0;
    String(s).split(TOK).forEach(function (p) {
      if (!p) return;
      var cls = null, txt = p, shift = 0;
      if (p.charAt(0) === '`' && p.length > 1) { cls = 'mono'; txt = p.slice(1, -1); }
      else if (p.charAt(0) === '*' && p.length > 2) { cls = p.length > 3 ? 'mw' : 'mi'; txt = p.slice(1, -1); }
      else if (p.charAt(0) === '_' && p.length > 1) { cls = 'sub'; txt = p.charAt(1) === '{' ? p.slice(2, -1) : p.slice(1); shift = 0.28 * fs; }
      else if (p.charAt(0) === '^' && p.length > 1) { cls = 'sup'; txt = p.charAt(1) === '{' ? p.slice(2, -1) : p.slice(1); shift = -0.38 * fs; }
      var a = cls ? { 'class': cls } : {};
      var dy = back + shift;
      if (dy) a.dy = dy.toFixed(2);
      back = -shift;
      SW.el('tspan', a, parent).textContent = txt;
    });
  };

  // Text, possibly on several lines ("\n"), placed like a TikZ node: o.valign is 'middle'
  // (default), 'top' (y is the top edge), or 'bottom' (y is the bottom edge).
  SW.text = function (parent, x, y, s, o) {
    o = o || {};
    var fs = o.fs || 12, lh = (o.lh || 1.25) * fs;
    var lines = String(s).split('\n'), n = lines.length;
    var y0;
    if (o.valign === 'top') y0 = y + 0.8 * fs;
    else if (o.valign === 'bottom') y0 = y - (n - 1) * lh - 0.25 * fs;
    else y0 = y - (n - 1) * lh / 2 + 0.35 * fs;
    var t = SW.el('text', { x: x, y: y0.toFixed(2), 'text-anchor': o.anchor || 'middle', 'class': o.cls || null, style: 'font-size:' + fs + 'px' }, parent);
    lines.forEach(function (line, i) {
      var ts = SW.el('tspan', { x: x, dy: i === 0 ? 0 : lh.toFixed(2) }, t);
      SW.rich(ts, line, fs);
    });
    return t;
  };
  SW.setText = function (t, s, fs) {
    var first = t.firstChild;
    while (first.firstChild) first.removeChild(first.firstChild);
    SW.rich(first, s, fs || 12);
  };

  SW.box = function (parent, cx, cy, w, h, cls, rx) {
    return SW.el('rect', { x: (cx - w / 2).toFixed(2), y: (cy - h / 2).toFixed(2), width: w.toFixed(2), height: h.toFixed(2), rx: rx == null ? 3 : rx, 'class': cls || 'box' }, parent);
  };
  SW.path = function (pts) {
    return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
  };
  SW.anchor = function (n, side) {
    var w = n.w / 2, h = n.h / 2;
    return {
      n: [n.x, n.y - h], s: [n.x, n.y + h], e: [n.x + w, n.y], w: [n.x - w, n.y],
      ne: [n.x + w, n.y - h], nw: [n.x - w, n.y - h], se: [n.x + w, n.y + h], sw: [n.x - w, n.y + h]
    }[side] || [n.x, n.y];
  };

  // ---------- Time ----------
  SW.clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  SW.lerp = function (a, b, u) { return a + (b - a) * u; };
  SW.ease = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
  SW.ramp = function (t, t0, t1) { return t1 <= t0 ? (t >= t1 ? 1 : 0) : SW.ease(SW.clamp((t - t0) / (t1 - t0), 0, 1)); };
  SW.bump = function (t, t0, t1) { return t <= t0 || t >= t1 ? 0 : Math.sin(Math.PI * (t - t0) / (t1 - t0)); };

  // A point at fraction u along a polyline.
  SW.along = function (pts, u) {
    var L = [], tot = 0, i;
    for (i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
    var s = SW.clamp(u, 0, 1) * tot;
    for (i = 1; i < pts.length; i++) {
      if (s <= L[i - 1] || i === pts.length - 1) {
        var v = L[i - 1] ? SW.clamp(s / L[i - 1], 0, 1) : 1;
        return [SW.lerp(pts[i - 1][0], pts[i][0], v), SW.lerp(pts[i - 1][1], pts[i][1], v)];
      }
      s -= L[i - 1];
    }
    return pts[pts.length - 1];
  };

  // Draw a solid path progressively: u = 0 hidden, u = 1 complete. The arrowhead appears
  // at the end. Paths must carry pathLength="1".
  SW.draw = function (p, u, base) {
    if (u <= 0) { p.setAttribute('opacity', base || 0); p.style.strokeDasharray = ''; p.classList.remove('nomark'); return; }
    p.setAttribute('opacity', 1);
    if (u >= 1) { p.style.strokeDasharray = ''; p.classList.remove('nomark'); return; }
    p.style.strokeDasharray = u.toFixed(4) + ' 1';
    p.classList.add('nomark');
  };
  SW.show = function (e, u) { e.setAttribute('opacity', SW.clamp(u, 0, 1).toFixed(3)); };

  // ---------- Shared definitions ----------
  SW.defs = function () {
    if (document.getElementById('sw-defs')) return;
    var s = SW.el('svg', { id: 'sw-defs', width: 0, height: 0, 'aria-hidden': 'true' });
    s.style.position = 'absolute';
    var d = SW.el('defs', null, s);
    // TikZ Stealth-like arrowheads.
    [['dep', 8], ['faint', 8], ['hb', 9], ['data', 11], ['dash', 8], ['good', 8], ['bad', 9]].forEach(function (m) {
      var mk = SW.el('marker', { id: 'm-' + m[0], viewBox: '0 0 10 10', refX: 9.2, refY: 5, markerWidth: m[1], markerHeight: m[1], markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, d);
      SW.el('path', { d: 'M0,0.6 L10,5 L0,9.4 L2.6,5 z', 'class': 'mk-' + m[0] }, mk);
    });
    document.body.insertBefore(s, document.body.firstChild);
  };

  // ---------- Animation player ----------
  // o = {vb: [w, h] (omit for an HTML figure), minw, alt, duration, hold, steps: [{t, label}],
  //      labels (false hides the step box above the figure), build(container, anim) -> render(t)}
  function Anim(host, o) {
    var self = this;
    SW.all.push(this);
    this.o = o;
    this.host = host;
    this.d = o.duration;
    this.hold = o.hold == null ? 2.6 : o.hold;
    this.wrap = SW.div('anim', host);
    this.step = o.steps && o.labels !== false ? SW.div('anim-step', this.wrap) : null;
    this.stage = SW.div('anim-stage', this.wrap);
    var target = this.stage;
    if (o.vb) {
      this.svg = SW.el('svg', { viewBox: '0 0 ' + o.vb[0] + ' ' + o.vb[1], role: 'img', 'aria-label': o.alt || '' }, this.stage);
      if (o.minw) this.svg.style.minWidth = o.minw + 'px';
      target = this.svg;
    }
    this.render = o.build(target, this);
    SW.div('anim-pp', this.wrap, '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>');
    this.t = 0;
    this.si = -1;
    this.running = false;
    this.paused = false;
    this.visible = false;
    this.looped = false;
    this._frame = this._frame.bind(this);
    this.wrap.setAttribute('title', SW.t('Click to pause or resume'));
    this.wrap.addEventListener('click', function () { self.paused = !self.paused; self.sync(); });
    if (SW.reduced) { this.seek(this.d); return; }
    this.seek(0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { self.visible = e.isIntersecting && e.intersectionRatio > 0.3; self.sync(); });
      }, { threshold: [0, 0.3, 0.6] }).observe(this.wrap);
    } else { this.visible = true; this.sync(); }
  }
  Anim.prototype.sync = function () {
    var want = this.visible && !this.paused;
    this.wrap.classList.toggle('paused', this.paused);
    if (want && !this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this._frame); }
    else if (!want) this.running = false;
  };
  Anim.prototype.seek = function (t) {
    this.t = t;
    var tt = Math.min(t, this.d);
    this.render(tt);
    if (this.step) {
      var s = this.o.steps, i = 0;
      for (var k = 0; k < s.length; k++) if (s[k].t <= tt + 1e-6) i = k;
      if (i !== this.si) { this.si = i; this.step.innerHTML = s[i].label; }
    }
    var f = 1;
    if (t > this.d) { var r = this.d + this.hold - t; if (r < 0.4) f = 0.15 + 0.85 * Math.max(0, r) / 0.4; }
    else if (this.looped && t < 0.3) f = 0.15 + 0.85 * t / 0.3;
    this.stage.style.opacity = f.toFixed(3);
  };
  Anim.prototype._frame = function (now) {
    if (!this.running) return;
    var dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    var t = this.t + dt;
    if (t > this.d + this.hold) { t = 0; this.looped = true; }
    this.seek(t);
    requestAnimationFrame(this._frame);
  };
  SW.Anim = Anim;

  document.addEventListener('DOMContentLoaded', function () {
    SW.defs();
    Array.prototype.forEach.call(document.querySelectorAll('[data-fig]'), function (el) {
      var f = SW.figs[el.getAttribute('data-fig')];
      if (!f) return;
      try { f(el); } catch (e) {
        console.error(e);
        SW.div('fig-error', el, SW.t('This figure failed to load: ') + e.message);
      }
    });
  });
})();
