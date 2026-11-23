# Decrypts the saved Buttondown key for this run only and passes it to send-email.js.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\send-email.ps1 [--draft] [--date YYYY-MM-DD] [--force]
$root = Split-Path -Parent $PSScriptRoot
$file = Join-Path $env:USERPROFILE '.daily-compound\buttondown.key'
if (-not (Test-Path $file)) { Write-Output 'No Buttondown API key saved yet; skipping the subscriber email. Run scripts\set-buttondown-key.ps1 once to enable it.'; exit 0 }
try {
  $secure = (Get-Content $file -Raw).Trim() | ConvertTo-SecureString
  $env:BUTTONDOWN_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password
  node (Join-Path $root 'scripts\send-email.js') @args
  $code = $LASTEXITCODE
} finally {
  Remove-Item Env:\BUTTONDOWN_API_KEY -ErrorAction SilentlyContinue
}
exit $code
