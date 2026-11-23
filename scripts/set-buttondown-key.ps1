# Saves your Buttondown API key, encrypted so only your Windows account can read it.
# It's stored outside this project (in your user folder), so it can never be published to GitHub.
# Run once:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-buttondown-key.ps1
$dir  = Join-Path $env:USERPROFILE '.daily-compound'
$file = Join-Path $dir 'buttondown.key'
New-Item -ItemType Directory -Force $dir | Out-Null
$secure = Read-Host -AsSecureString 'Paste your Buttondown API key (it will not be shown), then press Enter'
if ($secure.Length -lt 10) { Write-Output 'That looks too short to be an API key. Nothing was saved.'; exit 1 }
$secure | ConvertFrom-SecureString | Set-Content -Path $file -Encoding ASCII
Write-Output "Saved (encrypted) to $file. The daily task will now email subscribers."
