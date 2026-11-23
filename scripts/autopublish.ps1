# Run by Windows Task Scheduler every 20 minutes each morning. Publishes today's edition once it is
# finished (unchanged for 10+ minutes) and hasn't been emailed yet. publish.ps1 never double-posts or double-sends.
$root  = Split-Path -Parent $PSScriptRoot
$today = Get-Date -Format 'yyyy-MM-dd'
$file  = Join-Path $root "content\$today.json"
$state = Join-Path $env:USERPROFILE '.daily-compound'
$log   = Join-Path $state 'publish.log'
New-Item -ItemType Directory -Force $state | Out-Null

if (-not (Test-Path $file)) { exit 0 }                                   # not written yet
if (((Get-Date) - (Get-Item $file).LastWriteTime).TotalMinutes -lt 10) { exit 0 }   # still being written
$sent = Join-Path $state 'sent.json'
if ((Test-Path $sent) -and ((Get-Content $sent -Raw) -match "`"$today`"")) { exit 0 }   # already published and emailed

"=== $(Get-Date -Format s) publishing $today" | Add-Content $log
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'publish.ps1') *>&1 | Add-Content $log
