#!/usr/bin/env node
// Emails today's edition to Buttondown subscribers (free-plan alternative to RSS-to-email).
// The API key comes from the BUTTONDOWN_API_KEY environment variable. scripts/send-email.ps1 supplies it
// from an encrypted file outside the repo. Never put the key in this repo.
//
// Usage: node scripts/send-email.js [--date YYYY-MM-DD] [--draft] [--force]
//   --draft  create a draft in Buttondown instead of sending (for testing)
//   --force  send even if this date was already sent, or isn't today
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const date = opt('--date') || today;
const draft = flag('--draft');
const force = flag('--force');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const baseUrl = (config.url || '').replace(/\/$/, '');
const key = process.env.BUTTONDOWN_API_KEY || '';
const stateDir = path.join(os.homedir(), '.daily-compound');
const sentFile = path.join(stateDir, 'sent.json');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('--date must be YYYY-MM-DD');
if (!key) { console.log('No Buttondown API key set up; skipping the subscriber email. Run scripts\\set-buttondown-key.ps1 once to enable it.'); process.exit(0); }
if (!baseUrl) fail('site.config.json needs "url" so the email can link to the edition');
const file = path.join(root, 'content', `${date}.json`);
if (!fs.existsSync(file)) fail(`no edition for ${date}`);
if (date !== today && !force && !draft) fail(`${date} isn't today, so it won't be emailed (use --force to send anyway)`);

const sent = fs.existsSync(sentFile) ? JSON.parse(fs.readFileSync(sentFile, 'utf8')) : {};
if (sent[date] && !force && !draft) { console.log(`Edition ${date} was already emailed (${sent[date].id}). Nothing to do.`); process.exit(0); }

const ed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const link = `${baseUrl}/e/${date}/`;

// ---------- email HTML (inline styles: email clients ignore stylesheets) ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n\s*\n/)).map((p) => String(p).trim()).filter(Boolean);
const paras = (v) => list(v).map((p) => (p.split('\n').every((l) => /^\s*[-•]\s+/.test(l))
  ? '<ul>' + p.split('\n').map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('') + '</ul>'
  : `<p>${inline(p)}</p>`)).join('\n');
const plain = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');
const longDate = (() => { const [y, m, d] = date.split('-').map(Number); return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); })();
const button = (text) => `<p style="margin:24px 0;font-size:17px;"><strong><a href="${link}">${esc(text)}</a></strong></p>`;

let html = '';
if (ed.dek) html += `<p><em>${inline(ed.dek)}</em></p>`;
html += button(`Read the full brief and take the ${ed.quiz.length}-question quiz →`);
if (ed.bigPicture) html += `<h2>The big picture</h2>\n${paras(ed.bigPicture)}`;
if (ed.marketPulse && (ed.marketPulse.items || []).length) {
  html += `<h2>Market pulse</h2><ul>${ed.marketPulse.items.map((it) => `<li><strong>${esc(it.name)}:</strong> ${esc(it.value)}${it.change ? ` (${esc(it.change)})` : ''}</li>`).join('')}</ul>`;
}
for (const sec of ed.sections) {
  html += `<h2>${inline(sec.title)}</h2>`;
  for (const st of sec.stories) {
    html += `<h3>${inline(st.headline)}</h3>`;
    if (st.disclosure) html += `<p style="font-size:13px;color:#5f6670;">${inline(st.disclosure)}</p>`;
    if (st.takeaway) html += `<p><strong>In one line:</strong> ${inline(st.takeaway)}</p>`;
    const why = list(st.whyItMatters)[0];
    if (why) html += `<p><strong>Why it matters:</strong> ${inline(why.replace(/^\s*[-•]\s+/, ''))}</p>`;
  }
}
if ((ed.concepts || []).length) {
  html += `<h2>Concepts of the day</h2><ul>${ed.concepts.map((c) => `<li><strong>${esc(c.area)}:</strong> ${inline(c.title)}</li>`).join('')}</ul>`;
}
html += button('Read the full explanations, the week ahead and the quiz →');
html += `<p style="font-size:12px;color:#5f6670;">Written by Claude, an AI model, from public reporting, with every source linked in the full edition. Educational news analysis, not investment advice.</p>`;

// ---------- send ----------
async function waitForPage() { // the site deploys a minute or two after publish; don't email a dead link
  for (let i = 0; i < 36; i++) {
    try { const r = await fetch(link, { method: 'HEAD' }); if (r.ok) return true; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

(async () => {
  if (!draft) {
    console.log(`Waiting for ${link} to go live…`);
    if (!(await waitForPage())) fail('the edition page never went live, so no email was sent. Re-run after the site deploys.');
  }
  const res = await fetch('https://api.buttondown.com/v1/emails', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
      // Buttondown asks API keys to opt in once before sending real emails; this automation is that opt-in.
      ...(draft ? {} : { 'X-Buttondown-Live-Dangerously': 'true' }),
    },
    body: JSON.stringify({
      subject: plain(ed.title),
      description: plain(ed.dek || ''),
      body: html,
      canonical_url: link,
      status: draft ? 'draft' : 'about_to_send',
      secondary_id: Number(date.replace(/-/g, '')),
    }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Buttondown returned ${res.status}: ${text.slice(0, 400)}`);
  const email = JSON.parse(text);
  if (!draft) {
    fs.mkdirSync(stateDir, { recursive: true });
    sent[date] = { id: email.id, at: new Date().toISOString() };
    fs.writeFileSync(sentFile, JSON.stringify(sent, null, 2));
  }
  console.log(`✓ ${draft ? 'Draft created' : 'Email queued for subscribers'}: "${email.subject}" (status: ${email.status})`);
})().catch((e) => fail(e.message));
