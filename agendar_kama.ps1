# ==========================================================
# agendar_kama.ps1  —  Configura o Task Scheduler do Windows
# para rodar o hedge_monitor.py todo dia útil às 16h45
#
# COMO USAR: Execute como Administrador no PowerShell
#   cd C:\Users\rafae\Documents\FINHOUSE\SITES\trade_2
#   .\agendar_kama.ps1
# ==========================================================

$TaskName    = "BBDC4_Hedge_KAMA_Monitor"
$ProjectDir  = "C:\Users\rafae\Documents\FINHOUSE\SITES\trade_2"
$ScriptPath  = Join-Path $ProjectDir "hedge_monitor.py"
$LogPath     = Join-Path $ProjectDir "kama_cron.log"

# Detecta o Python disponível no sistema
$PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonExe) {
    $PythonExe = (Get-Command python3 -ErrorAction SilentlyContinue).Source
}
if (-not $PythonExe) {
    Write-Error "Python não encontrado no PATH. Instale o Python e tente novamente."
    exit 1
}

Write-Host "✔ Python encontrado: $PythonExe" -ForegroundColor Green

# Remove tarefa anterior com mesmo nome (se existir)
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Ação: executa python hedge_monitor.py e redireciona output para log
$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$ScriptPath`" >> `"$LogPath`" 2>&1" `
    -WorkingDirectory $ProjectDir

# Gatilho: seg a sex, 16h45
$Trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday `
    -At "16:45"

# Configurações adicionais
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

# Registra a tarefa
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Robô quantitativo BBDC4 — calcula KAMA/Regime diário e atualiza o monitor web (Supabase + Telegram)" `
    -RunLevel Highest `
    -Force

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Tarefa '$TaskName' registrada com sucesso!" -ForegroundColor Green
Write-Host " Executará: seg a sex às 16:45 BRT" -ForegroundColor Green
Write-Host " Script:    $ScriptPath" -ForegroundColor Yellow
Write-Host " Log:       $LogPath" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para verificar: Abra 'Agendador de Tarefas' e procure por '$TaskName'" -ForegroundColor Gray
Write-Host "Para testar agora: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
