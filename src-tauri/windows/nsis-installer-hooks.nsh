!include LogicLib.nsh

!macro _TASKKILL_EXE PROC_NAME
  DetailPrint "Force closing ${PROC_NAME}..."
  ClearErrors
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM "${PROC_NAME}"' $1
!macroend

!macro _CLOSE_XINGSHU_BY_TASKKILL
  DetailPrint "Force closing known XingShu/OpenClaw process names..."
  !insertmacro _TASKKILL_EXE "XingShu.exe"
  !insertmacro _TASKKILL_EXE "星枢OpenClaw.exe"
  !insertmacro _TASKKILL_EXE "XingShuOpenClaw.exe"
  !insertmacro _TASKKILL_EXE "TuLuOpenClaw.exe"
  !insertmacro _TASKKILL_EXE "clawpanel.exe"
!macroend

!macro _CLOSE_XINGSHU_BY_SCRIPT
  DetailPrint "Closing running XingShu/OpenClaw by process path..."
  FileOpen $0 "$TEMP\xingshu-close-running.ps1" w
  FileWrite $0 "$$ErrorActionPreference = 'SilentlyContinue'`r`n"
  FileWrite $0 "$$names = @('XingShu', '星枢OpenClaw', 'XingShuOpenClaw', 'TuLuOpenClaw', 'clawpanel')`r`n"
  FileWrite $0 "$$installDir = [IO.Path]::GetFullPath('$INSTDIR')`r`n"
  FileWrite $0 "function Test-XingShuProcess($$p) {`r`n"
  FileWrite $0 "  if ($$names -contains $$p.ProcessName) { return $$true }`r`n"
  FileWrite $0 "  if ($$p.Path) { try { return [IO.Path]::GetFullPath($$p.Path).StartsWith($$installDir, [StringComparison]::OrdinalIgnoreCase) } catch {} }`r`n"
  FileWrite $0 "  return $$false`r`n"
  FileWrite $0 "}`r`n"
  FileWrite $0 "$$targets = Get-Process | Where-Object { Test-XingShuProcess $$_ }`r`n"
  FileWrite $0 "foreach ($$p in $$targets) { try { $$p.CloseMainWindow() | Out-Null } catch {} }`r`n"
  FileWrite $0 "Start-Sleep -Milliseconds 1000`r`n"
  FileWrite $0 "foreach ($$p in (Get-Process | Where-Object { Test-XingShuProcess $$_ })) { try { Stop-Process -Id $$p.Id -Force } catch {} }`r`n"
  FileWrite $0 "for ($$i = 0; $$i -lt 30; $$i++) {`r`n"
  FileWrite $0 "  $$left = Get-Process | Where-Object { Test-XingShuProcess $$_ }`r`n"
  FileWrite $0 "  if (-not $$left) { exit 0 }`r`n"
  FileWrite $0 "  Start-Sleep -Milliseconds 300`r`n"
  FileWrite $0 "}`r`n"
  FileWrite $0 "exit 1`r`n"
  FileClose $0
  ClearErrors
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\xingshu-close-running.ps1"' $1
  Delete "$TEMP\xingshu-close-running.ps1"
!macroend

!macro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _CLOSE_XINGSHU_BY_TASKKILL
  Sleep 1000
  !insertmacro _CLOSE_XINGSHU_BY_SCRIPT
  Sleep 1000
  !insertmacro _CLOSE_XINGSHU_BY_TASKKILL
  Sleep 1000
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
        MessageBox MB_ICONSTOP|MB_OK "安装器已自动尝试关闭旧版 星枢OpenClaw，但 Windows 仍报告文件被占用。请等待 5 秒后重新运行安装器；如果仍失败，再在任务栏右键退出 星枢OpenClaw。"
        Abort
      ${Else}
        Delete "$INSTDIR\XingShu.exe.old"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  SetRebootFlag false
  !insertmacro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _UNLOCK_OLD_XINGSHU_EXE
  SetRebootFlag false
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  SetRebootFlag false
  !insertmacro _CLOSE_XINGSHU_PROCESSES
  SetRebootFlag false
!macroend

!macro NSIS_HOOK_POSTINSTALL
  SetRebootFlag false
!macroend
