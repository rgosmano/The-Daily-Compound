# Shows the morning "time to read The Daily Compound" Windows notification.
# Clicking it (or "Open the brief") opens index.html in your default browser.
param([switch]$OpenNow)

$root  = Split-Path -Parent $PSScriptRoot
$cfg   = Get-Content (Join-Path $root 'site.config.json') -Raw | ConvertFrom-Json
$index = Join-Path $root 'public\index.html'
# Open the live site once it's published, otherwise the local copy
$uri   = if ($cfg.url) { $cfg.url.TrimEnd('/') + '/' } else { ([System.Uri]$index).AbsoluteUri }
$today = Get-Date -Format 'yyyy-MM-dd'
$ready = Test-Path (Join-Path $root "content\$today.json")

if ($OpenNow) { Start-Process $uri; return }

if ($ready) {
  $title = 'The Daily Compound is ready'
  $body  = "Today's ~30-minute read on markets, investing and biotech, plus your quiz."
} else {
  $title = 'Time for The Daily Compound'
  $body  = "Today's edition is still being written (Claude needs to be open). Start with the latest one."
}

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$esc = [System.Security.SecurityElement]::Escape($uri)
$xml = @"
<toast activationType="protocol" launch="$esc" scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>$([System.Security.SecurityElement]::Escape($title))</text>
      <text>$([System.Security.SecurityElement]::Escape($body))</text>
    </binding>
  </visual>
  <actions>
    <action content="Open the brief" activationType="protocol" arguments="$esc"/>
    <action content="Later" activationType="system" arguments="dismiss"/>
  </actions>
</toast>
"@

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
