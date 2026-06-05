!macro _KILL_XINGSHU_PROCESSES
  DetailPrint "Closing running XingShu/OpenClaw processes before install..."
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShu.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "星枢OpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "TuLuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "clawpanel.exe"'
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$names = @(''XingShu'',''星枢OpenClaw'',''XingShuOpenClaw'',''TuLuOpenClaw'',''clawpanel''); $roots = @(''$INSTDIR''); if ($env:LOCALAPPDATA) { $roots += Join-Path $env:LOCALAPPDATA ''星枢OpenClaw''; $roots += Join-Path $env:LOCALAPPDATA ''Programs\XingShu'' }; $roots = $roots | Where-Object { $_ } | ForEach-Object { try { [IO.Path]::GetFullPath($_).TrimEnd([char]92) } catch { $_ } }; Get-Process | Where-Object { $proc = $_; ($names -contains $proc.ProcessName) -or ($proc.Path -and ($roots | Where-Object { $proc.Path.StartsWith(($_ + [char]92), [StringComparison]::OrdinalIgnoreCase) })) } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$names = @(''XingShu'',''星枢OpenClaw'',''XingShuOpenClaw'',''TuLuOpenClaw'',''clawpanel''); $roots = @(''$INSTDIR''); if ($env:LOCALAPPDATA) { $roots += Join-Path $env:LOCALAPPDATA ''星枢OpenClaw''; $roots += Join-Path $env:LOCALAPPDATA ''Programs\XingShu'' }; $roots = $roots | Where-Object { $_ } | ForEach-Object { try { [IO.Path]::GetFullPath($_).TrimEnd([char]92) } catch { $_ } }; for ($i = 0; $i -lt 30; $i++) { $p = Get-Process | Where-Object { $proc = $_; ($names -contains $proc.ProcessName) -or ($proc.Path -and ($roots | Where-Object { $proc.Path.StartsWith(($_ + [char]92), [StringComparison]::OrdinalIgnoreCase) })) }; if (-not $p) { exit 0 }; $p | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; exit 1"'
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _KILL_XINGSHU_PROCESSES
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _KILL_XINGSHU_PROCESSES
!macroend
