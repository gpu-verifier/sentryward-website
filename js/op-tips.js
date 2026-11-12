/* SentryWard blog: explains the operations in the code blocks. Each call of a known operation
   is marked when the page loads; hovering over it, tapping it, or focusing it with the
   keyboard shows what it does in a floating window. Comments and step numbers are skipped. */
(function () {
  'use strict';

  // Translates English text into the page's language; see js/i18n/ and SW.t in anim.js.
  var DICT = (window.SW_I18N || {})[document.documentElement.lang] || {};
  function t(en) { return Object.prototype.hasOwnProperty.call(DICT, en) ? DICT[en] : en; }

  // What each operation does, in one short sentence for readers who do not know PTX. Keys are
  // the names as the code blocks write them.
  var OPS = {
    'init': t('Initializes a barrier with the given number of pending arrivals and zero pending bytes.'),
    'syncthreads': t('Blocks each thread until all threads in the block reach this point.'),
    'arrive.expect_tx': t('Adds the given number of bytes to the barrier’s pending bytes, then decrements its pending arrivals by one.'),
    'expect_tx': t('Adds the given number of bytes to the barrier’s pending bytes.'),
    'arrive': t('Decrements the barrier’s pending arrivals by one.'),
    'wait': t('Blocks until the barrier completes the given phase. A phase completes when both of its counts reach zero.'),
    'tma_load': t('Issues an asynchronous copy of a tile into shared memory. On completion, the copied bytes are subtracted from the barrier’s pending bytes.'),
    'cp.async': t('Issues an asynchronous copy of data into shared memory.'),
    'tcgen05.mma': t('Issues an asynchronous matrix multiplication on the tensor core.'),
    'tcgen05.commit': t('Decrements the barrier’s pending arrivals by one once all tensor-core operations previously issued by this thread have completed.'),
    'tcgen05.ld': t('Issues an asynchronous load from tensor memory into registers.'),
    'tcgen05.wait::ld': t('Blocks until all outstanding tensor-memory loads of this thread have completed.'),
    'tcgen05.st': t('Issues an asynchronous store from registers into tensor memory.'),
    'tcgen05.wait::st': t('Blocks until all outstanding tensor-memory stores of this thread have completed.'),
    'st.global': t('Stores values to global memory.'),
    'T.Pipelined': t('A software-pipelined loop: copies for later iterations overlap with the computation of the current one.'),
    'T.copy': t('Copies a tile into a shared-memory buffer.'),
    'T.tcgen05_gemm': t('Issues an asynchronous matrix multiplication on the tensor core. On completion, the pending arrivals of mbar are decremented by one.'),
    'T.mbarrier_wait_parity': t('Blocks until the barrier completes the given phase. A phase completes when both of its counts reach zero.')
  };
  OPS.__syncthreads = OPS.syncthreads;

  // A known name, called (followed by an opening parenthesis) and not part of a longer name.
  // Longer names come first, so arrive.expect_tx wins over arrive.
  var names = Object.keys(OPS).sort(function (a, b) { return b.length - a.length; });
  var CALL = new RegExp('(^|[^\\w.:])(' + names.map(function (n) { return n.replace(/\./g, '\\.'); }).join('|') + ')(?=\\()', 'g');

  function mark(text) {
    var frag = null, last = 0, m;
    CALL.lastIndex = 0;
    while ((m = CALL.exec(text.nodeValue))) {
      var start = m.index + m[1].length;
      frag = frag || document.createDocumentFragment();
      frag.appendChild(document.createTextNode(text.nodeValue.slice(last, start)));
      var op = document.createElement('span');
      op.className = 'op';
      op.tabIndex = 0;
      op.textContent = m[2];
      frag.appendChild(op);
      last = start + m[2].length;
    }
    if (!frag) return;
    frag.appendChild(document.createTextNode(text.nodeValue.slice(last)));
    text.parentNode.replaceChild(frag, text);
  }

  var texts = [];
  document.querySelectorAll('article pre').forEach(function (pre) {
    var walk = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.parentNode.closest('.c, .sn') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    while (walk.nextNode()) texts.push(walk.currentNode);
  });
  texts.forEach(mark);

  // ---------- The floating window ----------
  var tip = document.createElement('div');
  tip.className = 'op-tip';
  tip.id = 'op-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  var current = null;

  function show(op) {
    if (current === op) return;
    hide();
    tip.textContent = OPS[op.textContent];
    // Measure at the left edge, where the window can take its full width; then place it
    // below the operation if it fits in the viewport, otherwise above it.
    tip.style.left = tip.style.top = '0px';
    tip.hidden = false;
    var r = op.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.max(12, Math.min(r.left, document.documentElement.clientWidth - w - 12));
    var y = r.bottom + 8 + h <= window.innerHeight - 8 || r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
    tip.style.left = x + window.scrollX + 'px';
    tip.style.top = y + window.scrollY + 'px';
    op.classList.add('on');
    op.setAttribute('aria-describedby', 'op-tip');
    current = op;
  }

  function hide() {
    if (!current) return;
    tip.hidden = true;
    current.classList.remove('on');
    current.removeAttribute('aria-describedby');
    current = null;
  }

  document.querySelectorAll('pre .op').forEach(function (op) {
    op.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(op); });
    op.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    op.addEventListener('focus', function () { show(op); });
    op.addEventListener('blur', hide);
    op.addEventListener('click', function () { show(op); });
  });
  // A tap shows the window; a tap anywhere else hides it. Pointer events also reach the
  // document from plain text on iOS, where click events may not.
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest || !e.target.closest('pre .op, .op-tip')) hide();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('resize', hide);
  document.querySelectorAll('article pre').forEach(function (pre) { pre.addEventListener('scroll', hide); });
})();
