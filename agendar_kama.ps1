# agendar_kama.ps1
# Registra o hedge_monitor.py como tarefa agendada: seg-sex 16h20 BRT
# Execute como Administrador: powershell -ExecutionPolicy Bypass -File .\agendar_kama.ps1

$TaskName   = "BBDC4_Hedge_KAMA_Monitor"
$ProjectDir = "C:\Users\rafae\Documents\FINHOUSE\SITES\trade_2"
$ScriptPath = Join-Path $ProjectDir "hedge_monitor.py"
$LogPath    = Join-Path $ProjectDir "kama_cron.log"

$PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonExe) {
    $PythonExe = (Get-Command python3 -ErrorAction SilentlyContinue).Source
}
if (-not $PythonExe) {
    Write-Error "Python nao encontrado no PATH."
    exit 1
}

Write-Host "Python: $PythonExe"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$PythonExe`" `"$ScriptPath`" >> `"$LogPath`" 2>&1" `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
    -At "16:20"

$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Robo BBDC4 Collar - KAMA diario seg-sex 16h20" `
    -RunLevel Highest `
    -Force

Write-Host "Tarefa '$TaskName' registrada com sucesso!"
Write-Host "Script: $ScriptPath"
Write-Host "Log:    $LogPath"
Write-Host "Para testar: Start-ScheduledTask -TaskName '$TaskName'"
