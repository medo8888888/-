// publish-check — «قبل أن تنشر: افحص المادة» on method.html (markup: tools/yanabee/feat_publish_check.py).
// Progressive enhancement of a static checklist: adds yes/no buttons, one step at a time on phones (all steps on
// wide screens), and a result in an aria-live region. Answers live in memory only: no storage, no network, no upload.
(function () {
  'use strict';
  var root = document.querySelector('[data-pc]');
  if (!root) return;
  var steps = [].slice.call(root.querySelectorAll('[data-pc-step]'));
  if (steps.length !== 3) return;
  var res = {};
  [].forEach.call(root.querySelectorAll('[data-pc-res]'), function (r) { res[r.getAttribute('data-pc-res')] = r; });
  var stat = root.querySelector('[data-pc-static]');
  var again = root.querySelector('[data-pc-again]');
  var prog = root.querySelector('[data-pc-prog]');
  var A = { 1: null, 2: null, 3: null };

  // which step is open, or which result shows
  function state() {
    if (A[1] == null) return { cur: 1 };
    if (A[1] && A[2] == null) return { cur: 2 };
    if (A[1] && A[2] === false) return { res: 'consent' };
    if (A[3] == null) return { cur: 3 };
    return { res: A[3] ? 'next' : 'channel' };
  }
  // per step: 'cur' (being asked), 'done' (answered), 'skip' (not on the path), 'later' (not reached yet)
  function stepState(n, s) {
    if (n === 2 && A[1] === false) return 'skip';
    if (n === 3 && A[1] && A[2] === false) return 'skip';
    if (A[n] != null) return 'done';
    return s.cur === n ? 'cur' : 'later';
  }
  function render(focusTo) {
    var s = state();
    steps.forEach(function (li) {
      var n = +li.getAttribute('data-pc-step'), st = stepState(n, s);
      li.setAttribute('data-state', st);
      if (st === 'cur') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      var off = st === 'skip' || st === 'later';
      [].forEach.call(li.querySelectorAll('[data-pc-ans]'), function (b) {
        var yes = b.getAttribute('data-pc-ans') === 'yes';
        b.setAttribute('aria-pressed', A[n] != null && A[n] === yes ? 'true' : 'false');
        b.disabled = off;
        b.hidden = st === 'skip';
      });
      li.querySelector('[data-pc-skip]').hidden = st !== 'skip';
    });
    Object.keys(res).forEach(function (k) { res[k].hidden = k !== s.res; });
    root.setAttribute('data-pc-done', s.res ? 'true' : 'false');
    again.hidden = A[1] == null;
    if (prog) {
      prog.textContent = s.res ? '' : 'السؤال ' + s.cur + ' من 3';
      prog.hidden = !!s.res;
    }
    if (focusTo === 'auto') {
      var target = s.res ? res[s.res].querySelector('.pc-res-h') : root.querySelector('#pc-q' + s.cur);
      if (target) { try { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    }
  }
  function answer(n, yes) {
    A[n] = yes;
    // a changed answer clears the answers after it
    for (var k = n + 1; k <= 3; k++) A[k] = null;
    render('auto');
  }
  steps.forEach(function (li) {
    var n = +li.getAttribute('data-pc-step');
    li.querySelector('[data-pc-yn]').hidden = false;
    [].forEach.call(li.querySelectorAll('[data-pc-ans]'), function (b) {
      b.addEventListener('click', function () { answer(n, b.getAttribute('data-pc-ans') === 'yes'); });
    });
  });
  root.querySelector('[data-pc-reset]').addEventListener('click', function () {
    A = { 1: null, 2: null, 3: null };
    render();
    var q = root.querySelector('#pc-q1');
    try { q.focus({ preventScroll: true }); q.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
  });
  if (stat) stat.hidden = true;
  root.classList.add('pc-on');
  render();
  window.YanabeePublishCheck = { answers: function () { return { 1: A[1], 2: A[2], 3: A[3] }; } };
})();
