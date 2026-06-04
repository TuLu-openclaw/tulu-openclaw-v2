!macro _KILL_XINGSHU_PROCESSES
  DetailPrint "Closing running XingShu/OpenClaw processes before install..."
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShu.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "TuLuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "clawpanel.exe"'
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = Join-Path $env:LOCALAPPDATA ''Programs\XingShu\XingShu.exe''; $installTarget = Join-Path ''$INSTDIR'' ''XingShu.exe''; Get-Process | Where-Object { $_.ProcessName -in @(''XingShu'',''XingShuOpenClaw'',''TuLuOpenClaw'',''clawpanel'') -or ($_.Path -and ($_.Path -eq $target -or $_.Path -eq $installTarget)) } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$installTarget = Join-Path ''$INSTDIR'' ''XingShu.exe''; for ($i = 0; $i -lt 30; $i++) { $p = Get-Process | Where-Object { $_.ProcessName -in @(''XingShu'',''XingShuOpenClaw'',''TuLuOpenClaw'',''clawpanel'') -or ($_.Path -and $_.Path -eq $installTarget) }; if (-not $p) { exit 0 }; $p | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; exit 1"'
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _KILL_XINGSHU_PROCESSES
!macroend
