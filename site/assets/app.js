/* The Daily Compound — renders a daily edition, tracks reading, runs the quiz.
   Works straight from file:// (editions are plain <script> files). */
(function () {
  'use strict';

  var manifest = (window.MB_MANIFEST || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  window.MB_EDITIONS = window.MB_EDITIONS || {};
  var SITE = window.MB_SITE || { name: 'The Daily Compound' };
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var PAGE_DATE = document.documentElement.getAttribute('data-date') || '';
  var IS_FILE = location.protocol === 'file:';
  var REVIEW_COUNT = 3;
  var LOOKBACK = 7;
  var wideQuery = window.matchMedia('(min-width: 961px)');
  var plural = new Intl.PluralRules('en-US');

  // ---------- storage ----------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('mb:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('mb:' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  };

  // ---------- helpers ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Only plain http(s) links are ever rendered (edition text comes from web research).
  function safeUrl(u) { return /^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : null; }
  function inline(s) {
    var h = esc(s);
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    return h;
  }
  function paras(s) {
    if (!s) return '';
    var arr = Array.isArray(s) ? s : String(s).split(/\n\s*\n/);
    return arr.map(function (p) {
      p = String(p).trim();
      if (!p) return '';
      var lines = p.split('\n');
      if (lines.every(function (l) { return /^\s*[-•]\s+/.test(l); })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + inline(p) + '</p>';
    }).join('');
  }
  function count(n, one, many) { return n + ' ' + (plural.select(n) === 'one' ? one : many); }
  function fmtDate(iso, opts) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return new Intl.DateTimeFormat('en-US', opts || { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  }
  function shortDate(iso) { return fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function todayISO() { return toISO(new Date()); }
  function addDays(iso, n) { var p = iso.split('-'); return toISO(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
  function seededShuffle(arr, seedStr) {
    var seed = 0; for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }
  function editionHref(date) { return ROOT + 'e/' + date + '/' + (IS_FILE ? 'index.html' : ''); }
  function homeHref() { return ROOT + (IS_FILE ? 'index.html' : ''); }
  function shareUrl(date) { return SITE.url ? SITE.url.replace(/\/$/, '') + '/e/' + date + '/' : location.href.split('#')[0]; }
  function subscribeForm(idSuffix) {
    var rss = '<a href="' + ROOT + 'feed.xml">RSS feed</a>';
    if (!/^[A-Za-z0-9_-]+$/.test(SITE.buttondown || '')) {
      return '<div class="subscribe"><p class="sub-title">Follow along</p><p class="sub-note">New editions every morning. Follow with the ' + rss + '.</p></div>';
    }
    var id = 'sub-email-' + idSuffix;
    return '<form class="subscribe" action="https://buttondown.com/api/emails/embed-subscribe/' + esc(SITE.buttondown) + '" method="post" target="_blank">' +
      '<label class="sub-title" for="' + id + '">Get the brief by email every morning</label>' +
      '<div class="sub-row"><input id="' + id + '" type="email" name="email" autocomplete="email" required placeholder="you@example.com">' +
      '<button type="submit" class="btn btn-primary">Subscribe</button></div>' +
      '<p class="sub-note">Free. Unsubscribe anytime. Or use the ' + rss + '.</p></form>';
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

  function loadEdition(date) {
    return new Promise(function (resolve, reject) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reject(new Error('bad date'));
      if (window.MB_EDITIONS[date]) return resolve(window.MB_EDITIONS[date]);
      var s = document.createElement('script');
      s.src = ROOT + 'editions/' + date + '.js';
      s.onload = function () { window.MB_EDITIONS[date] ? resolve(window.MB_EDITIONS[date]) : reject(new Error('empty edition')); };
      s.onerror = function () { reject(new Error('missing edition ' + date)); };
      document.head.appendChild(s);
    });
  }

  // ---------- state ----------
  var current = null;      // edition object
  var blocks = [];         // [{id, label}]
  var observer = null;
  var sideOpen = null;     // narrow-screen disclosure state (null = follow screen width)

  function readSet(date) { return store.get('read:' + date, []); }
  function markRead(date, id) {
    var r = readSet(date);
    if (r.indexOf(id) === -1) { r.push(id); store.set('read:' + date, r); renderSidebar(); }
  }
  function quizState(date) { return store.get('quiz:' + date, { answers: {}, done: false }); }
  function missedPool() { return store.get('missed', []); }
  function setMissed(key, wrong) {
    var m = missedPool(); var i = m.indexOf(key);
    if (wrong && i === -1) m.push(key);
    if (!wrong && i !== -1) m.splice(i, 1);
    store.set('missed', m);
  }
  function streak() {
    var d = todayISO();
    if (!quizState(d).done) d = addDays(d, -1);
    var n = 0;
    while (quizState(d).done) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- sidebar ----------
  function updateMeter() {
    if (!current) return;
    var goal = current.readingMinutes || 30;
    var mins = Math.floor(store.get('time:' + current.date, 0) / 60);
    var fill = $('#meter-fill'), txt = $('#meter-text');
    if (fill) fill.style.transform = 'scaleX(' + Math.min(1, mins / goal) + ')';
    if (txt) txt.textContent = mins + ' of ~' + goal + ' min read';
  }

  function renderSidebar() {
    var sb = $('#sidebar');
    if (!sb) return;
    var date = current ? current.date : null;
    var idx = date ? manifest.findIndex(function (m) { return m.date === date; }) : -1;
    var read = date ? readSet(date) : [];
    var qs = date ? quizState(date) : null;
    var quizzed = manifest.filter(function (m) { return quizState(m.date).done; }).length;
    var open = sideOpen == null ? wideQuery.matches : sideOpen;

    var h = '';
    h += '<a class="brand" href="' + homeHref() + '"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M8 46 L24 30 L34 40 L56 16" stroke="#e9c46a" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
         '<span><span class="brand-name">' + esc(SITE.name) + '</span><span class="brand-sub">Markets · Investing · Biotech</span></span></a>';

    if (date) {
      var newer = idx > 0 ? manifest[idx - 1].date : null;
      var older = idx < manifest.length - 1 ? manifest[idx + 1].date : null;
      var navLink = function (d, label, none, glyph) {
        return d ? '<a class="nav-btn" href="' + editionHref(d) + '" aria-label="' + label + ', ' + esc(shortDate(d)) + '"><span aria-hidden="true">' + glyph + '</span></a>'
                 : '<span class="nav-btn is-disabled" role="img" aria-label="' + none + '"><span aria-hidden="true">' + glyph + '</span></span>';
      };
      h += '<nav class="side-block" aria-label="Editions"><div class="date-nav">' +
        navLink(older, 'Previous edition', 'No earlier edition', '←') +
        '<div class="current">' + esc(shortDate(date)) + '</div>' +
        navLink(newer, 'Next edition', 'No later edition', '→') + '</div></nav>';

      var s = streak();
      h += '<div class="side-block"><div class="stats">' +
        '<div class="stat"><b>' + s + '</b><span>' + (plural.select(s) === 'one' ? 'day' : 'days') + ' in your quiz streak</span></div>' +
        '<div class="stat"><b>' + (qs && qs.done ? qs.score + '/' + qs.total : '—') + '</b><span>' + (qs && qs.done ? 'quiz score' : 'quiz not taken') + '</span></div>' +
        '</div><div class="meter" aria-hidden="true"><div id="meter-fill"></div></div>' +
        '<div class="meter-label"><span id="meter-text"></span><span>' + read.length + ' of ' + blocks.length + ' sections</span></div></div>';
    }

    h += '<details class="side-more"' + (open ? ' open' : '') + '><summary>Sections and past editions</summary>';
    if (date) {
      h += '<nav class="side-block" aria-label="Sections"><div class="side-title">Today\'s reading</div><ul class="toc">' +
        blocks.map(function (b) {
          var isDone = read.indexOf(b.id) !== -1;
          return '<li class="' + (isDone ? 'done' : '') + '"><a href="#' + esc(b.id) + '" data-jump="' + esc(b.id) + '"><span class="dot" aria-hidden="true">✓</span><span>' + esc(b.label) +
            (isDone ? '<span class="visually-hidden"> (read)</span>' : '') + '</span></a></li>';
        }).join('') + '</ul></nav>';
    }
    h += '<nav class="side-block" aria-label="Past editions"><div class="side-title">Archive · ' + count(manifest.length, 'edition', 'editions') + ' · ' + quizzed + ' quizzed</div><ul class="archive">' +
      manifest.map(function (m) {
        var q = quizState(m.date);
        return '<li><a href="' + editionHref(m.date) + '"' + (m.date === date ? ' aria-current="page"' : '') + '>' +
          (q.done ? '<span class="a-badge">' + q.score + '/' + q.total + '<span class="visually-hidden"> on the quiz</span></span>' : '') +
          '<span class="a-date">' + esc(shortDate(m.date)) + '</span><span class="a-title">' + esc(m.title) + '</span></a></li>';
      }).join('') + '</ul></nav></details>';

    // Dynamic part re-renders as you read; the subscribe form lives in a static part so typing is never wiped.
    if (!$('#side-dyn', sb)) {
      sb.innerHTML = '<div id="side-dyn"></div><div class="side-block">' + subscribeForm('side') + '</div>' +
        '<div class="side-foot">A new edition every morning. <a href="' + ROOT + 'about/' + (IS_FILE ? 'index.html' : '') + '">About this brief</a></div>';
    }
    $('#side-dyn', sb).innerHTML = h;
    updateMeter();
    var det = $('.side-more', sb);
    det.addEventListener('toggle', function () { sideOpen = det.open; });
  }
  wideQuery.addEventListener('change', function () { sideOpen = null; renderSidebar(); });

  document.addEventListener('click', function (e) {
    var skip = e.target.closest('.skip-link');
    if (skip) { e.preventDefault(); var m = $('#main'); m.focus(); m.scrollIntoView(); return; }
    var sh = e.target.closest('#share');
    if (sh && current) {
      var url = shareUrl(current.date), title = SITE.name + ': ' + current.title;
      var say = function (t) { var st = $('#share-status'); if (st) { st.textContent = ''; setTimeout(function () { st.textContent = t; }, 50); } };
      if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function () { say('Link copied'); }, function () { say('Copy failed. Copy the address bar instead.'); }); }
      return;
    }
    var j = e.target.closest('[data-jump]');
    if (j) {
      e.preventDefault();
      var el = document.getElementById(j.getAttribute('data-jump'));
      if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); el.scrollIntoView(); }
    }
  });

  // ---------- main render ----------
  function renderStory(s, i, sectionId) {
    var id = s.id || (sectionId + '-' + (i + 1) + '-' + slug(s.headline));
    var h = '<article class="story" id="' + esc(id) + '">';
    if (s.tags && s.tags.length) h += '<div class="tags">' + s.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>';
    h += '<h3>' + inline(s.headline) + '</h3>';
    if (s.disclosure) h += '<div class="disclosure">' + inline(s.disclosure) + '</div>';
    if (s.takeaway) h += '<div class="takeaway"><b>In one line</b>' + inline(s.takeaway) + '</div>';
    if (s.whatHappened) h += '<h4>What happened</h4>' + paras(s.whatHappened);
    if (s.whyItMatters) h += '<h4>Why it matters</h4>' + paras(s.whyItMatters);
    if (s.bigPicture) h += '<h4>The bigger picture</h4>' + paras(s.bigPicture);
    if (s.whatToWatch) h += '<h4>What to watch</h4>' + paras(s.whatToWatch);
    var links = (s.sources || []).filter(function (src) { return safeUrl(src.url); });
    if (links.length) {
      h += '<div class="sources">Sources: ' + links.map(function (src) {
        return '<a href="' + esc(src.url) + '" target="_blank" rel="noopener noreferrer">' + esc(src.name) + '</a>';
      }).join(' · ') + '</div>';
    }
    return h + '</article>';
  }

  function renderEdition(ed, moveFocus) {
    current = ed;
    blocks = [];
    var nStories = ed.sections.reduce(function (n, s) { return n + s.stories.length; }, 0);
    var h = '';
    h += '<header class="masthead"><div class="kicker">' + esc(SITE.name) + ' · ' + esc(fmtDate(ed.date)) + '</div>' +
      '<h1 id="edition-title" tabindex="-1">' + inline(ed.title) + '</h1>' + (ed.dek ? '<p class="dek">' + inline(ed.dek) + '</p>' : '') +
      '<div class="meta"><span>About ' + (ed.readingMinutes || 30) + ' min read</span>' +
      '<span>' + count(nStories, 'story', 'stories') + '</span>' +
      '<span>' + count((ed.concepts || []).length, 'concept', 'concepts') + '</span>' +
      '<span>' + (ed.quiz || []).length + '-question quiz</span></div>' +
      ((navigator.share || navigator.clipboard) ? '<div class="share-row"><button type="button" class="btn" id="share">' + (navigator.share ? 'Share this edition' : 'Copy link to this edition') + '</button><span id="share-status" class="share-status" role="status"></span></div>' : '') +
      '</header>';

    if (ed.bigPicture) {
      blocks.push({ id: 'big-picture', label: 'The big picture' });
      h += '<section class="big-picture block" id="big-picture" aria-labelledby="h-big-picture"><h2 id="h-big-picture">The big picture</h2>' + paras(ed.bigPicture) + '<div class="end-marker" data-block="big-picture"></div></section>';
    }

    if (ed.marketPulse) {
      var mp = ed.marketPulse;
      blocks.push({ id: 'pulse', label: 'Market pulse' });
      h += '<section class="block" id="pulse" aria-labelledby="h-pulse"><h2 id="h-pulse">Market pulse</h2>' +
        (mp.asOf ? '<p class="section-kicker">' + inline(mp.asOf) + '</p>' : '') +
        '<div class="pulse-grid">' + (mp.items || []).map(function (it) {
          var dir = it.direction || (/^\s*[-−]/.test(it.change || '') ? 'down' : (/^\s*\+/.test(it.change || '') ? 'up' : 'flat'));
          return '<div class="pulse"><div class="p-name">' + esc(it.name) + '</div><div class="p-value">' + esc(it.value) + '</div>' +
            (it.change ? '<div class="p-change ' + dir + '">' + esc(it.change) + '</div>' : '') +
            (it.note ? '<div class="p-note">' + inline(it.note) + '</div>' : '') + '</div>';
        }).join('') + '</div><div class="pulse-summary">' + paras(mp.summary) + '</div><div class="end-marker" data-block="pulse"></div></section>';
    }

    ed.sections.forEach(function (sec) {
      var sid = sec.id || slug(sec.title);
      blocks.push({ id: sid, label: sec.title });
      h += '<section class="block" id="' + esc(sid) + '" aria-labelledby="h-' + esc(sid) + '"><h2 id="h-' + esc(sid) + '">' + inline(sec.title) + '</h2>' +
        (sec.kicker ? '<p class="section-kicker">' + inline(sec.kicker) + '</p>' : '') +
        sec.stories.map(function (s, i) { return renderStory(s, i, sid); }).join('') +
        '<div class="end-marker" data-block="' + esc(sid) + '"></div></section>';
    });

    if (ed.concepts && ed.concepts.length) {
      blocks.push({ id: 'concepts', label: 'Concepts of the day' });
      h += '<section class="block" id="concepts" aria-labelledby="h-concepts"><h2 id="h-concepts">Concepts of the day</h2><p class="section-kicker">The ideas underneath today\'s news, explained from the ground up.</p>' +
        ed.concepts.map(function (c) {
          return '<div class="concept"><div class="c-area">' + esc(c.area) + '</div><h3>' + inline(c.title) + '</h3>' + paras(c.body) +
            (c.example ? '<div class="example"><b>Worked example</b>' + paras(c.example) + '</div>' : '') + '</div>';
        }).join('') + '<div class="end-marker" data-block="concepts"></div></section>';
    }

    if (ed.weekAhead && ed.weekAhead.length) {
      blocks.push({ id: 'week-ahead', label: 'What\'s coming' });
      h += '<section class="block" id="week-ahead" aria-labelledby="h-week"><h2 id="h-week">What\'s coming</h2><p class="section-kicker">The calendar that will move markets and biotech stocks next.</p>' +
        '<table class="week"><thead><tr><th scope="col">When</th><th scope="col">Event</th></tr></thead><tbody>' +
        ed.weekAhead.map(function (w) {
          return '<tr><td>' + esc(w.when) + '</td><td><b>' + inline(w.event) + '</b>' + (w.why ? '<div class="w-why">' + inline(w.why) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table><div class="end-marker" data-block="week-ahead"></div></section>';
    }

    if (ed.glossary && ed.glossary.length) {
      blocks.push({ id: 'glossary', label: 'Glossary' });
      h += '<section class="block" id="glossary" aria-labelledby="h-glossary"><h2 id="h-glossary">Glossary</h2><p class="section-kicker">Terms from today\'s edition.</p><dl class="glossary">' +
        ed.glossary.map(function (g) { return '<div class="term"><dt>' + esc(g.term) + '</dt><dd>' + inline(g.definition) + '</dd></div>'; }).join('') +
        '</dl><div class="end-marker" data-block="glossary"></div></section>';
    }

    if (ed.quiz && ed.quiz.length) {
      blocks.push({ id: 'quiz', label: 'Quiz' });
      h += '<section class="block" id="quiz" aria-labelledby="h-quiz"><h2 id="h-quiz">Check what you learned</h2>' +
        '<p class="quiz-intro">Answer from memory first. Each answer comes with an explanation. Review questions come from earlier editions, starting with ones you missed.</p>' +
        '<div id="quiz-body"></div></section>';
    }

    h += '<footer class="disclaimer">' + (ed.footer ? inline(ed.footer) + ' ' : '') +
      'Written by Claude, an AI model, from public reporting, with links to every original source. This is educational news analysis, not investment advice. Figures are as reported at the time of writing and may be revised. ' +
      '<a href="' + ROOT + 'about/' + (IS_FILE ? 'index.html' : '') + '">How this brief is made</a></footer>';

    var main = $('#main');
    main.innerHTML = h;
    if (moveFocus) window.scrollTo(0, 0);
    document.title = ed.title + ' · ' + SITE.name;
    renderSidebar();
    watchBlocks();
    buildQuiz(ed);
    if (moveFocus) { var t = $('#edition-title'); if (t) t.focus({ preventScroll: true }); }
  }

  function watchBlocks() {
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && current) markRead(current.date, en.target.getAttribute('data-block')); });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.end-marker').forEach(function (m) { observer.observe(m); });
  }

  // ---------- quiz ----------
  function buildQuiz(ed) {
    var body = $('#quiz-body');
    if (!body) return;
    var own = ed.quiz.map(function (q, i) { return { q: q, key: ed.date + ':' + i, from: null }; });
    var older = manifest.filter(function (m) { return m.date < ed.date; }).slice(0, LOOKBACK);
    Promise.all(older.map(function (m) { return loadEdition(m.date).catch(function () { return null; }); })).then(function (eds) {
      var pool = [];
      eds.forEach(function (e) { if (e && e.quiz) e.quiz.forEach(function (q, i) { pool.push({ q: q, key: e.date + ':' + i, from: e.date }); }); });
      var missed = missedPool();
      var st = quizState(ed.date);
      var chosen;
      if (st.reviewKeys) {
        chosen = st.reviewKeys.map(function (k) { return pool.find(function (p) { return p.key === k; }); }).filter(Boolean);
      } else {
        var shuffled = seededShuffle(pool, ed.date);
        var answeredWrong = shuffled.filter(function (p) { return missed.indexOf(p.key) !== -1; });
        var unseen = shuffled.filter(function (p) { return missed.indexOf(p.key) === -1 && !Object.prototype.hasOwnProperty.call(quizState(p.from).answers || {}, p.key); });
        var rest = shuffled.filter(function (p) { return answeredWrong.indexOf(p) === -1 && unseen.indexOf(p) === -1; });
        chosen = answeredWrong.concat(unseen, rest).slice(0, REVIEW_COUNT);
        st.reviewKeys = chosen.map(function (c) { return c.key; });
        store.set('quiz:' + ed.date, st);
      }
      renderQuiz(ed, own.concat(chosen));
    });
  }

  function renderQuiz(ed, items) {
    var body = $('#quiz-body');
    var st = quizState(ed.date);
    var letters = 'ABCDEF';
    var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    body.innerHTML = items.map(function (it, n) {
      var q = it.q;
      var qid = 'q-' + n;
      return '<div class="q" role="group" aria-labelledby="' + qid + '" data-n="' + n + '"><div class="q-head"><span>Question ' + (n + 1) + ' of ' + items.length + (q.topic ? ' · ' + esc(q.topic) : '') + '</span>' +
        (it.from ? '<span class="review">Review from ' + esc(shortDate(it.from)) + '</span>' : '') + '</div>' +
        '<div class="q-text" id="' + qid + '">' + inline(q.question) + '</div><div class="choices">' +
        q.choices.map(function (c, i) { return '<button type="button" class="choice" data-i="' + i + '"><span class="letter" aria-hidden="true">' + letters[i] + '</span><span class="c-text">' + inline(c) + '</span><span class="c-state visually-hidden"></span></button>'; }).join('') +
        '</div><div class="explain-slot" role="status"></div></div>';
    }).join('') + '<div id="score-slot" role="status"></div>';

    function reveal(card, it, picked, announce) {
      var q = it.q;
      card.querySelectorAll('.choice').forEach(function (b, i) {
        b.disabled = true;
        var letter = b.querySelector('.letter'), state = b.querySelector('.c-state');
        if (i === q.answer) { b.classList.add('correct'); letter.textContent = '✓'; state.textContent = i === picked ? ' (your answer, correct)' : ' (correct answer)'; }
        else if (i === picked) { b.classList.add('wrong'); letter.textContent = '✗'; state.textContent = ' (your answer, incorrect)'; }
        else b.classList.add('dim');
      });
      var ok = picked === q.answer;
      var html = '<div class="explain"><span class="verdict ' + (ok ? 'ok">Correct' : 'no">Not quite') + '</span>: ' + inline(q.explanation) + '</div>';
      var slot = card.querySelector('.explain-slot');
      if (announce) { setTimeout(function () { slot.innerHTML = html; }, 50); } else { slot.innerHTML = html; }
    }

    items.forEach(function (it, n) {
      var card = body.querySelector('.q[data-n="' + n + '"]');
      if (has(st.answers, it.key)) reveal(card, it, st.answers[it.key], false);
      card.addEventListener('click', function (e) {
        var b = e.target.closest('.choice');
        if (!b || b.disabled) return;
        var picked = +b.getAttribute('data-i');
        st = quizState(ed.date);
        st.answers[it.key] = picked;
        store.set('quiz:' + ed.date, st);
        setMissed(it.key, picked !== it.q.answer);
        if (it.from) { // record on the origin edition too, so it counts as seen
          var os = quizState(it.from); os.answers = os.answers || {}; if (!has(os.answers, it.key)) { os.answers[it.key] = picked; store.set('quiz:' + it.from, os); }
        }
        reveal(card, it, picked, true);
        finish(true);
      });
    });

    function finish(justFinished) {
      st = quizState(ed.date);
      var answered = items.filter(function (it) { return has(st.answers, it.key); });
      if (answered.length < items.length) return;
      var right = items.filter(function (it) { return st.answers[it.key] === it.q.answer; });
      var wrong = items.filter(function (it) { return st.answers[it.key] !== it.q.answer; });
      if (!st.done) { // the first full attempt is the one that counts
        st.done = true; st.score = right.length; st.total = items.length; st.at = new Date().toISOString();
        store.set('quiz:' + ed.date, st);
        markRead(ed.date, 'quiz');
      }
      var pct = right.length / items.length;
      var msg = pct === 1 ? 'Perfect score. You really absorbed today\'s brief.' :
        pct >= 0.8 ? 'Strong work. You\'ve got the key ideas down.' :
        pct >= 0.6 ? 'Solid. Skim the topics below once more and they\'ll stick.' :
        'Worth a second pass on the topics below. Questions you missed come back as review in future quizzes.';
      var s = streak();
      var html = '<div class="score-card"><div class="big">' + right.length + ' / ' + items.length + '</div><p>' + msg + '</p>' +
        (st.retake ? '<p>Your first attempt (' + st.score + '/' + st.total + ') is the score that counts toward your streak.</p>' : '') +
        (wrong.length ? '<p><b>Revisit:</b></p><ul>' + wrong.map(function (w) {
          return '<li>' + inline(w.q.topic || w.q.question) + (w.from ? ' (from ' + esc(shortDate(w.from)) + ')' : '') + '</li>';
        }).join('') + '</ul>' : '') +
        '<p>Quiz streak: ' + count(s, 'day', 'days') + '.</p>' +
        '<button type="button" class="btn" id="retake">Retake quiz</button></div>' +
        '<div class="after-quiz">' + subscribeForm('quiz') + '</div>';
      var slot = $('#score-slot');
      if (justFinished) setTimeout(function () { slot.innerHTML = html; bindRetake(); }, 50); else { slot.innerHTML = html; bindRetake(); }
      renderSidebar();
    }
    function bindRetake() {
      $('#retake').addEventListener('click', function () {
        var s2 = quizState(ed.date);
        s2.answers = {}; s2.retake = true; // keep done/score so the streak is unaffected
        store.set('quiz:' + ed.date, s2);
        renderQuiz(ed, items);
        var first = $('#quiz-body .choice'); if (first) first.focus();
      });
    }
    finish(false);
  }

  // ---------- reading time + progress ----------
  var lastActive = Date.now();
  ['scroll', 'mousemove', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (!current || document.visibilityState !== 'visible') return;
    if (Date.now() - lastActive > 90000) return;
    var k = 'time:' + current.date;
    store.set(k, store.get(k, 0) + 15);
    updateMeter();
  }, 15000);
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    $('#progress-bar').style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
  }, { passive: true });

  // ---------- routing ----------
  function route(moveFocus) {
    var main = $('#main');
    if (!manifest.length) {
      current = null; blocks = []; renderSidebar();
      main.innerHTML = '<div class="empty"><p class="empty-title">No editions yet</p><p>The first edition arrives tomorrow morning.</p></div>';
      return;
    }
    // Old links used #YYYY-MM-DD; send them to the edition's own page.
    var want = (location.hash || '').replace('#', '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(want) && manifest.some(function (m) { return m.date === want; }) && want !== PAGE_DATE) {
      location.replace(editionHref(want)); return;
    }
    var date = manifest.some(function (m) { return m.date === PAGE_DATE; }) ? PAGE_DATE : manifest[0].date;
    loadEdition(date).then(function (ed) { renderEdition(ed, moveFocus); }).catch(function () {
      main.innerHTML = '<div class="empty"><p class="empty-title">This edition didn\'t load</p><p>Reload the page, or <a href="' + homeHref() + '">open the latest edition</a>.</p></div>';
    });
  }
  route(false);
})();
