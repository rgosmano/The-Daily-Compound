#!/usr/bin/env node
// Validates every content/YYYY-MM-DD.json edition, then builds the complete static site into public/:
//   index.html (latest edition), e/<date>/index.html (one shareable page per edition),
//   editions/*.js + manifest.js + site.js (data the page script loads),
//   about/, 404.html, feed.xml (RSS, used for email), sitemap.xml, robots.txt, assets/.
// Usage: node scripts/build.js        Exit code 1 if any edition is invalid.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content');
const siteDir = path.join(root, 'site');
const out = path.join(root, 'public');
const config = Object.assign(
  { name: 'Market Brief', tagline: '', description: '', url: '', buttondown: '', contact: '' },
  JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'))
);
const baseUrl = (config.url || '').replace(/\/$/, '');
if (baseUrl && !/^https:\/\//.test(baseUrl)) { console.error('✗ site.config.json "url" must start with https://'); process.exit(1); }
if (config.buttondown && !/^[A-Za-z0-9_-]+$/.test(config.buttondown)) { console.error('✗ site.config.json "buttondown" must be just the username'); process.exit(1); }

// ---------- helpers ----------
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const textOf = (v) => (Array.isArray(v) ? v.join(' ') : String(v || ''));
const words = (v) => textOf(v).split(/\s+/).filter(Boolean).length;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s) => textOf(s).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');
const inline = (s) => esc(s)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
const paras = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n\s*\n/)).filter((p) => String(p).trim())
  .map((p) => (String(p).split('\n').every((l) => /^\s*[-•]\s+/.test(l))
    ? '<ul>' + String(p).split('\n').map((l) => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>'
    : '<p>' + inline(p) + '</p>')).join('\n');
const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };
const rfc822 = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 11, 0, 0)).toUTCString(); };
const write = (rel, data) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data, 'utf8'); };
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
};

// ---------- validation ----------
function validate(ed, file) {
  const errs = [];
  const warns = [];
  const expect = path.basename(file, '.json');
  if (ed.date !== expect) errs.push(`date "${ed.date}" must match file name "${expect}"`);
  if (!isStr(ed.title)) errs.push('title is required');
  if (ed.readingMinutes != null && typeof ed.readingMinutes !== 'number') errs.push('readingMinutes must be a number');
  if (!Array.isArray(ed.sections) || !ed.sections.length) errs.push('sections must be a non-empty array');
  (ed.sections || []).forEach((s, si) => {
    if (!isStr(s.title)) errs.push(`sections[${si}].title is required`);
    if (!Array.isArray(s.stories) || !s.stories.length) errs.push(`sections[${si}].stories must be a non-empty array`);
    (s.stories || []).forEach((st, i) => {
      const at = `sections[${si}].stories[${i}]`;
      ['headline', 'whatHappened', 'whyItMatters'].forEach((k) => { if (!st[k] || !textOf(st[k]).trim()) errs.push(`${at}.${k} is required`); });
      if (!Array.isArray(st.sources) || !st.sources.length) errs.push(`${at}.sources needs at least one {name,url}`);
      (st.sources || []).forEach((src, k) => {
        if (!isStr(src.name) || !/^https?:\/\/[^\s"'<>]+$/.test(src.url || '')) errs.push(`${at}.sources[${k}] needs name and a plain http(s) url`);
      });
    });
  });
  if (ed.marketPulse) {
    if (!Array.isArray(ed.marketPulse.items)) errs.push('marketPulse.items must be an array');
    (ed.marketPulse.items || []).forEach((it, i) => { if (!isStr(it.name) || !isStr(String(it.value || ''))) errs.push(`marketPulse.items[${i}] needs name and value`); });
  }
  (ed.concepts || []).forEach((c, i) => { if (!isStr(c.title) || !c.body) errs.push(`concepts[${i}] needs title and body`); });
  (ed.weekAhead || []).forEach((w, i) => { if (!isStr(w.when) || !isStr(w.event)) errs.push(`weekAhead[${i}] needs when and event`); });
  (ed.glossary || []).forEach((g, i) => { if (!isStr(g.term) || !isStr(g.definition)) errs.push(`glossary[${i}] needs term and definition`); });
  if (!Array.isArray(ed.quiz) || ed.quiz.length < 8) errs.push('quiz needs at least 8 questions');
  (ed.quiz || []).forEach((q, i) => {
    if (!isStr(q.question)) errs.push(`quiz[${i}].question is required`);
    if (!Array.isArray(q.choices) || q.choices.length < 3 || q.choices.length > 5) errs.push(`quiz[${i}].choices must have 3-5 options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.choices || []).length) errs.push(`quiz[${i}].answer must be a valid choice index`);
    if (!isStr(q.explanation)) errs.push(`quiz[${i}].explanation is required`);
  });
  if (/<\s*(script|iframe|object|embed|style)\b/i.test(JSON.stringify(ed))) errs.push('raw HTML tags are not allowed in edition text');

  let total = words(ed.bigPicture) + words(ed.marketPulse && ed.marketPulse.summary);
  (ed.sections || []).forEach((s) => (s.stories || []).forEach((st) => {
    total += words(st.takeaway) + words(st.whatHappened) + words(st.whyItMatters) + words(st.bigPicture) + words(st.whatToWatch);
  }));
  (ed.concepts || []).forEach((c) => { total += words(c.body) + words(c.example); });
  (ed.weekAhead || []).forEach((w) => { total += words(w.event) + words(w.why); });
  (ed.glossary || []).forEach((g) => { total += words(g.definition); });
  if (total < 3500) warns.push(`only ~${total} words; target is 4,500-6,000 for a 30-minute read`);
  if (total > 7500) warns.push(`~${total} words; that is longer than a 30-minute read`);
  return { errs, warns, total };
}

// ---------- load + validate ----------
const files = fs.existsSync(contentDir) ? fs.readdirSync(contentDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const editions = [];
let failed = false;
for (const f of files) {
  let ed;
  try { ed = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8').replace(/^﻿/, '')); }
  catch (e) { console.error(`✗ ${f}: invalid JSON: ${e.message}`); failed = true; continue; }
  const { errs, warns, total } = validate(ed, path.join(contentDir, f));
  if (errs.length) { failed = true; console.error(`✗ ${f}:\n  - ${errs.join('\n  - ')}`); continue; }
  warns.forEach((w) => console.warn(`! ${f}: ${w}`));
  editions.push({ ed, total });
  console.log(`✓ ${f}  (~${total} words, ${ed.quiz.length} quiz questions)`);
}
editions.sort((a, b) => b.ed.date.localeCompare(a.ed.date));

// ---------- write site ----------
fs.rmSync(out, { recursive: true, force: true });
copyDir(path.join(siteDir, 'assets'), path.join(out, 'assets'));
if (fs.existsSync(path.join(siteDir, 'og.png'))) fs.copyFileSync(path.join(siteDir, 'og.png'), path.join(out, 'og.png'));
write('.nojekyll', '');

const manifest = editions.map(({ ed, total }) => ({
  date: ed.date, title: ed.title, words: total,
  stories: ed.sections.reduce((n, s) => n + s.stories.length, 0),
  concepts: (ed.concepts || []).map((c) => c.title),
}));
write('editions/manifest.js', `window.MB_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`);
write('editions/site.js', `window.MB_SITE = ${JSON.stringify({ name: config.name, tagline: config.tagline, url: baseUrl, buttondown: config.buttondown })};\n`);
for (const { ed } of editions) {
  write(`editions/${ed.date}.js`, `window.MB_EDITIONS = window.MB_EDITIONS || {};\nwindow.MB_EDITIONS[${JSON.stringify(ed.date)}] = ${JSON.stringify(ed)};\n`);
}

const template = fs.readFileSync(path.join(siteDir, 'index.template.html'), 'utf8');
function social({ title, desc, pathUrl, type }) {
  const lines = [
    `<meta property="og:site_name" content="${esc(config.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (baseUrl) {
    lines.push(`<meta property="og:url" content="${esc(baseUrl + pathUrl)}">`, `<link rel="canonical" href="${esc(baseUrl + pathUrl)}">`);
    if (fs.existsSync(path.join(siteDir, 'og.png'))) lines.push(`<meta property="og:image" content="${esc(baseUrl)}/og.png">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`);
  }
  return lines.map((l) => '  ' + l).join('\n');
}
function preview(ed) { // static content for search engines, link previews and no-JS readers; the app replaces it
  const stories = ed.sections.flatMap((s) => s.stories);
  return `      <div class="preview">
        <header class="masthead"><div class="kicker">${esc(config.name)} · ${esc(longDate(ed.date))}</div>
        <h1>${inline(ed.title)}</h1>${ed.dek ? `<p class="dek">${inline(ed.dek)}</p>` : ''}</header>
        ${ed.bigPicture ? `<section class="big-picture"><h2>The big picture</h2>${paras(ed.bigPicture)}</section>` : ''}
        <h2>In this edition</h2>
        <ul class="story-list">${stories.map((s) => `<li><strong>${inline(s.headline)}</strong>${s.takeaway ? `: ${inline(s.takeaway)}` : ''}</li>`).join('')}</ul>
        <p class="loading">Loading the full brief and quiz…</p>
      </div>`;
}
function page(ed, depth) {
  const rootRel = depth ? '../'.repeat(depth) : '';
  const desc = ed.dek || config.description;
  return template
    .replace(/{{ROOT}}/g, rootRel)
    .replace(/{{DATE}}/g, ed.date)
    .replace(/{{TITLE}}/g, esc(`${ed.title} · ${config.name}`))
    .replace(/{{DESC}}/g, esc(desc))
    .replace(/{{NAME}}/g, esc(config.name))
    .replace('{{SOCIAL}}', social({ title: ed.title, desc, pathUrl: depth ? `/e/${ed.date}/` : '/', type: 'article' }))
    .replace('{{PREVIEW}}', preview(ed));
}

if (editions.length) {
  write('index.html', page(editions[0].ed, 0));
  for (const { ed } of editions) write(`e/${ed.date}/index.html`, page(ed, 2));
} else {
  write('index.html', template.replace(/{{ROOT}}/g, '').replace(/{{DATE}}/g, '').replace(/{{TITLE}}|{{NAME}}/g, esc(config.name))
    .replace(/{{DESC}}/g, esc(config.description)).replace('{{SOCIAL}}', '').replace('{{PREVIEW}}', '<div class="empty">The first edition arrives tomorrow morning.</div>'));
}

// About page and 404: static, no script needed
function simplePage(title, body, depth, pathUrl) {
  const r = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action https://buttondown.com; base-uri 'none'; object-src 'none'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)} · ${esc(config.name)}</title>
  <meta name="description" content="${esc(config.description)}">
${pathUrl ? social({ title: `${title} · ${config.name}`, desc: config.description, pathUrl, type: 'website' }) : ''}
  <link rel="icon" href="${r}assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="${esc(config.name)}" href="${r}feed.xml">
  <link rel="stylesheet" href="${r}assets/style.css">
</head>
<body>
  <main id="main" class="prose-page">
    <p class="page-top"><a href="${r || './'}">← Today's ${esc(config.name)}</a></p>
${body}
  </main>
</body>
</html>
`;
}
const subscribeHtml = config.buttondown
  ? `<form class="subscribe" action="https://buttondown.com/api/emails/embed-subscribe/${esc(config.buttondown)}" method="post" target="_blank">
      <label class="sub-title" for="sub-email-about">Get the brief by email every morning</label>
      <div class="sub-row"><input id="sub-email-about" type="email" name="email" autocomplete="email" required placeholder="you@example.com"><button type="submit" class="btn btn-primary">Subscribe</button></div>
      <p class="sub-note">Free. Unsubscribe anytime.</p></form>`
  : `<p>Follow new editions with the <a href="../feed.xml">RSS feed</a>.</p>`;
write('about/index.html', simplePage('About', `    <div class="prose">
      <h1>About ${esc(config.name)}</h1>
      <p class="dek">${esc(config.tagline)}</p>
      <p>${esc(config.description)}</p>
      <h2>What's in each edition</h2>
      <ul>
        <li><strong>The big picture:</strong> the day's themes tied together.</li>
        <li><strong>Market pulse:</strong> stocks, rates, commodities and crypto, and how to read them.</li>
        <li><strong>Markets, the economy, biotech and pharma:</strong> each story covers what happened, why it matters, the bigger picture and what to watch.</li>
        <li><strong>Concepts of the day:</strong> one investing idea and one biotech idea, explained from the ground up with a worked example.</li>
        <li><strong>What's coming, a glossary, and a 10-question quiz</strong>, with review questions from earlier editions so ideas stick.</li>
      </ul>
      <h2>How it's made</h2>
      <p>Each edition is researched and written by Claude, an AI model made by Anthropic, from public reporting. Every story links to its original sources. The summaries and explanations are original, not copied. AI can make mistakes, so check the linked sources before relying on any figure.</p>
      <p>Because Claude is made by Anthropic, any story about Anthropic carries a disclosure and includes skeptical views.</p>
      <h2>Not investment advice</h2>
      <p>${esc(config.name)} is educational news analysis. It doesn't recommend buying or selling any security, and it isn't personalized financial, legal or medical advice.</p>
      <h2>Privacy</h2>
      <p>This site uses no cookies, ads or tracking. Your quiz scores and reading progress are stored only in your own browser. If you subscribe, your email address is handled by Buttondown and used only to send the brief.</p>
      ${config.contact ? `<h2>Corrections and contact</h2><p>Spotted an error? Email <a href="mailto:${esc(config.contact)}">${esc(config.contact)}</a>.</p>` : ''}
      <h2>Subscribe</h2>
      ${subscribeHtml}
    </div>`, 1, '/about/'));
write('404.html', simplePage('Page not found', `    <div class="prose"><h1>That page doesn't exist</h1><p>The link may be mistyped, or the edition may have moved. <a href="${baseUrl ? baseUrl + '/' : '/'}">Read today's edition</a> or browse past editions from the sidebar there.</p></div>`, 0, ''));

// RSS (Buttondown can email each new item automatically) + sitemap + robots
if (baseUrl) {
  const items = editions.slice(0, 20).map(({ ed }) => {
    const link = `${baseUrl}/e/${ed.date}/`;
    const stories = ed.sections.flatMap((s) => s.stories);
    const html = `${ed.dek ? `<p><em>${inline(ed.dek)}</em></p>` : ''}${ed.bigPicture ? `<h2>The big picture</h2>${paras(ed.bigPicture)}` : ''}` +
      `<h2>In today's brief</h2><ul>${stories.map((s) => `<li><strong>${inline(s.headline)}</strong>${s.takeaway ? `: ${inline(s.takeaway)}` : ''}</li>`).join('')}</ul>` +
      `${(ed.concepts || []).length ? `<p><strong>Concepts of the day:</strong> ${(ed.concepts || []).map((c) => esc(plain(c.title))).join(' · ')}</p>` : ''}` +
      `<p><a href="${link}">Read the full brief and take today's ${ed.quiz.length}-question quiz →</a></p>` +
      `<p><small>Written by Claude (AI) from public reporting. Educational, not investment advice.</small></p>`;
    return `    <item>
      <title>${esc(plain(ed.title))}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${rfc822(ed.date)}</pubDate>
      <description>${esc(plain(ed.dek || ed.title))}</description>
      <content:encoded><![CDATA[${html.replace(/]]>/g, ']]&gt;')}]]></content:encoded>
    </item>`;
  }).join('\n');
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(config.name)}</title>
    <link>${baseUrl}/</link>
    <description>${esc(config.description)}</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc></url>
  <url><loc>${baseUrl}/about/</loc></url>
${editions.map(({ ed }) => `  <url><loc>${baseUrl}/e/${ed.date}/</loc><lastmod>${ed.date}</lastmod></url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
} else {
  write('robots.txt', 'User-agent: *\nAllow: /\n');
  console.warn('! site.config.json has no "url" yet, so feed.xml and sitemap.xml were skipped. Set it after the first deploy.');
}

console.log(`Built public/ with ${editions.length} edition(s).`);
process.exit(failed ? 1 : 0);
