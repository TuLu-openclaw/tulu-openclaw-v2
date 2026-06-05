!include LogicLib.nsh

!macro _CLOSE_XINGSHU_BY_TASKKILL
  DetailPrint "Force closing known XingShu/OpenClaw process names..."
  nsExec::ExecToLog 'cmd /C taskkill /F /T /IM XingShu.exe 2>NUL & taskkill /F /T /IM "星枢OpenClaw.exe" 2>NUL & taskkill /F /T /IM XingShuOpenClaw.exe 2>NUL & taskkill /F /T /IM TuLuOpenClaw.exe 2>NUL & taskkill /F /T /IM clawpanel.exe 2>NUL & exit /B 0'
!macroend

!macro _CLOSE_XINGSHU_BY_SCRIPT
  DetailPrint "Closing running XingShu/OpenClaw from install directory..."
  FileOpen $0 "$TEMP\xingshu-close-running.ps1" w
  FileWrite $0 "$ErrorActionPreference = 'SilentlyContinue'`r`n"
  FileWrite $0 "$names = @('XingShu', '星枢OpenClaw', 'XingShuOpenClaw', 'TuLuOpenClaw', 'clawpanel')`r`n"
  FileWrite $0 "$installDir = [IO.Path]::GetFullPath('$INSTDIR')`r`n"
  FileWrite $0 "$match = { param($p) ($names -contains $p.ProcessName) -or ($p.Path -and [IO.Path]::GetFullPath($p.Path).StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase)) }`r`n"
  FileWrite $0 "$targets = Get-Process | Where-Object { & $match $_ }`r`n"
  FileWrite $0 "foreach ($p in $targets) { try { $p.CloseMainWindow() | Out-Null } catch {} }`r`n"
  FileWrite $0 "Start-Sleep -Milliseconds 1000`r`n"
  FileWrite $0 "foreach ($p in (Get-Process | Where-Object { & $match $_ })) { try { Stop-Process -Id $p.Id -Force } catch {} }`r`n"
  FileWrite $0 "for ($i = 0; $i -lt 30; $i++) { if (-not (Get-Process | Where-Object { & $match $_ })) { exit 0 }; Start-Sleep -Milliseconds 300 }`r`n"
  FileWrite $0 "exit 1`r`n"
  FileClose $0
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$TEMP\xingshu-close-running.ps1"'
  Delete "$TEMP\xingshu-close-running.ps1"
!macroend

!macro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _CLOSE_XINGSHU_BY_TASKKILL
  Sleep 800
  !insertmacro _CLOSE_XINGSHU_BY_SCRIPT
  Sleep 800
  !insertmacro _CLOSE_XINGSHU_BY_TASKKILL
  Sleep 800
!macroend

!macro _UNLOCK_OLD_XINGSHU_EXE
  ${If} ${FileExists} "$INSTDIR\XingShu.exe"
    ClearErrors
    Delete "$INSTDIR\XingShu.exe"
    ${If} ${Errors}
      DetailPrint "Old XingShu.exe is still locked; trying to move it aside."
      ClearErrors
      Rename "$INSTDIR\XingShu.exe" "$INSTDIR\XingShu.exe.old"
      ${If} ${Errors}
        DetailPrint "Old XingShu.exe could not be moved after automatic close attempts."
        MessageBox MB_ICONSTOP|MB_OK "安装器已尝试自动关闭旧版 星枢OpenClaw，但旧版程序仍占用文件。请稍等几秒后重新运行安装器；如果仍失败，再在任务栏右键退出 星枢OpenClaw。"
        Abort
      ${Else}
        Delete "$INSTDIR\XingShu.exe.old"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _UNLOCK_OLD_XINGSHU_EXE
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _CLOSE_XINGSHU_PROCESSES
!macroend
