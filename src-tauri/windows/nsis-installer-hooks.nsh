!include LogicLib.nsh

!macro _CLOSE_XINGSHU_BY_POWERSHELL
  DetailPrint "Closing running XingShu/OpenClaw before install..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = ''SilentlyContinue''; $names = @(''XingShu'', ''星枢OpenClaw'', ''XingShuOpenClaw'', ''TuLuOpenClaw'', ''clawpanel''); $installDir = [IO.Path]::GetFullPath(''$INSTDIR''); $targets = Get-Process | Where-Object { $names -contains $_.ProcessName -or ($_.Path -and ([IO.Path]::GetFullPath($_.Path).StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase))) }; foreach ($p in $targets) { try { $p.CloseMainWindow() | Out-Null } catch {} }; Start-Sleep -Milliseconds 1200; $targets = Get-Process | Where-Object { $names -contains $_.ProcessName -or ($_.Path -and ([IO.Path]::GetFullPath($_.Path).StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase))) }; foreach ($p in $targets) { try { Stop-Process -Id $p.Id -Force } catch {} }; for ($i = 0; $i -lt 20; $i++) { $left = Get-Process | Where-Object { $names -contains $_.ProcessName -or ($_.Path -and ([IO.Path]::GetFullPath($_.Path).StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase))) }; if (-not $left) { exit 0 }; Start-Sleep -Milliseconds 300 }; exit 0"'
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
        DetailPrint "Old XingShu.exe could not be moved. Please close XingShu/OpenClaw and retry install."
        MessageBox MB_ICONEXCLAMATION|MB_OK "旧版 星枢OpenClaw 仍在运行，安装器无法替换文件。请在任务栏右键退出 星枢OpenClaw 后重新运行安装器。"
        Abort
      ${Else}
        Delete "$INSTDIR\XingShu.exe.old"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _CLOSE_XINGSHU_BY_POWERSHELL
  !insertmacro _UNLOCK_OLD_XINGSHU_EXE
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _CLOSE_XINGSHU_BY_POWERSHELL
!macroend
