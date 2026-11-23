# Registers (or updates) the daily 7:00 AM Market Brief reminder in Windows Task Scheduler.
# Run again with -Time to change it, e.g.  .\install-reminder.ps1 -Time 6:45am
# Remove it with:  Unregister-ScheduledTask -TaskName 'Market Brief Morning Reminder' -Confirm:$false
param([string]$Time = '7:00am')

$notify   = Join-Path $PSScriptRoot 'notify.ps1'
$argLine  = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$notify`""
$action   = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $argLine
$trigger  = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName 'Market Brief Morning Reminder' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Morning notification to read the Market Brief.' -Force | Out-Null

Get-ScheduledTask -TaskName 'Market Brief Morning Reminder' | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
