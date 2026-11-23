# Generates site/og.png, the 1200x630 image shown when a link is shared on social media.
# Re-run after changing the name or tagline in site.config.json:  powershell -File scripts\make-og.ps1
$root = Split-Path -Parent $PSScriptRoot
$cfg  = Get-Content (Join-Path $root 'site.config.json') -Raw | ConvertFrom-Json
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found; it is needed to render the image.' }
$name = [System.Security.SecurityElement]::Escape($cfg.name)
$tag  = [System.Security.SecurityElement]::Escape($cfg.tagline)
$tmp  = Join-Path $env:TEMP 'mb-og'
New-Item -ItemType Directory -Force $tmp | Out-Null
@"
<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#14171b;color:#e8e4da;font-family:Georgia,'Times New Roman',serif;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;position:relative}
.mark{width:96px;height:96px;border-radius:22px;background:#1d3557;display:grid;place-items:center;margin-bottom:44px}
h1{font-size:92px;line-height:1.05;margin:0 0 24px;letter-spacing:-0.02em}
p{font-family:'Segoe UI',Arial,sans-serif;font-size:36px;line-height:1.35;margin:0;color:#b6b0a3;max-width:900px;text-wrap:balance}
.tags{position:absolute;left:96px;bottom:64px;font-family:'Segoe UI',Arial,sans-serif;font-size:26px;letter-spacing:.08em;text-transform:uppercase;color:#5fc2b2;font-weight:700}
.bar{position:absolute;left:0;right:0;top:0;height:10px;background:linear-gradient(90deg,#5fc2b2,#e0b75a)}
</style></head><body><div class="bar"></div>
<div class="mark"><svg width="64" height="64" viewBox="0 0 64 64"><path d="M8 46 L24 30 L34 40 L56 16" stroke="#e9c46a" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<h1>$name</h1><p>$tag</p><div class="tags">Markets &middot; Investing &middot; Biotech &middot; Daily quiz</div></body></html>
"@ | Set-Content -Encoding UTF8 (Join-Path $tmp 'og.html')
$png = Join-Path $root 'site\og.png'
& $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot="$png" ("file:///" + ((Join-Path $tmp 'og.html') -replace '\\','/')) 2>$null | Out-Null
Start-Sleep -Seconds 2
if (Test-Path $png) { "Wrote $png" } else { throw 'Edge did not produce og.png' }
