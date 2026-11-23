# Registers the Windows task that publishes each morning's edition automatically.
# It checks every 20 minutes from 6:30 AM to 12:30 PM and runs on wake if the PC was asleep.
# Remove it with:  Unregister-ScheduledTask -TaskName 'Daily Compound Auto-Publish' -Confirm:$false
$script  = Join-Path $PSScriptRoot 'autopublish.ps1'
$argLine = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$action  = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $argLine
$trigger = New-ScheduledTaskTrigger -Daily -At '6:30am'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '6:30am' -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 6)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Daily Compound Auto-Publish' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Publishes the day''s Daily Compound edition to the site and emails subscribers.' -Force | Out-Null
Get-ScheduledTask -TaskName 'Daily Compound Auto-Publish' | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
