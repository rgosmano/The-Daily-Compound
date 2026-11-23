# Publishes new editions: builds locally (to catch errors), then commits content/ and pushes to GitHub.
# GitHub Actions rebuilds and deploys the site within about a minute of the push.
# Usage: powershell -File scripts\publish.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

node scripts/build.js
if ($LASTEXITCODE -ne 0) { throw 'Build failed; nothing was published. Fix the errors above first.' }

if (-not (git remote 2>$null)) { Write-Output 'No GitHub remote set up yet; the edition was built locally only.'; return }

git add content/ site/ scripts/ docs/ site.config.json README.md .github/ .gitignore
if (-not (git diff --cached --name-only)) { Write-Output 'Nothing new to publish.'; return }

# Refuse to publish anything that looks like a secret
$staged = git diff --cached --name-only
$hits = $staged | Where-Object { Test-Path $_ } | Select-String -Pattern '(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key\s*[:=]\s*["''][A-Za-z0-9]{16,})' -List
if ($hits) { git reset -q; throw ('Possible secret found, publishing stopped: ' + ($hits.Path -join ', ')) }

$today = Get-Date -Format 'yyyy-MM-dd'
git commit -q -m "Edition $today"
git push -q origin HEAD:main
Write-Output "Published. The site updates in about a minute."
