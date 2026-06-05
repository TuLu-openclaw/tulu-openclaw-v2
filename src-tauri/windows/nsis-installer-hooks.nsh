!include LogicLib.nsh

!macro _TASKKILL_PROCESS PROC_NAME
  DetailPrint "Closing ${PROC_NAME} if running..."
  nsExec::ExecToLog 'cmd /C taskkill /F /T /IM "${PROC_NAME}" 2>NUL || exit /B 0'
!macroend

!macro _WAIT_PROCESS_EXIT PROC_NAME
  DetailPrint "Waiting for ${PROC_NAME} to exit..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$name = [IO.Path]::GetFileNameWithoutExtension(\"${PROC_NAME}\"); for ($i = 0; $i -lt 20; $i++) { if (-not (Get-Process -Name $name -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Milliseconds 300 }; exit 0"'
!macroend

!macro _KILL_PROCESS_BY_INSTDIR PROC_NAME
  DetailPrint "Closing ${PROC_NAME} from install directory if still running..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = Join-Path \"$INSTDIR\" \"${PROC_NAME}\"; Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ([IO.Path]::GetFullPath($_.Path) -ieq [IO.Path]::GetFullPath($target)) } | Stop-Process -Force -ErrorAction SilentlyContinue"'
!macroend

!macro _CLOSE_PROCESS PROC_NAME
  !insertmacro _TASKKILL_PROCESS "${PROC_NAME}"
  !insertmacro _WAIT_PROCESS_EXIT "${PROC_NAME}"
  !insertmacro _KILL_PROCESS_BY_INSTDIR "${PROC_NAME}"
  !insertmacro _WAIT_PROCESS_EXIT "${PROC_NAME}"
!macroend

!macro _KILL_XINGSHU_PROCESSES
  DetailPrint "Closing running XingShu/OpenClaw processes before install..."
  !insertmacro _CLOSE_PROCESS "XingShu.exe"
  !insertmacro _CLOSE_PROCESS "星枢OpenClaw.exe"
  !insertmacro _CLOSE_PROCESS "XingShuOpenClaw.exe"
  !insertmacro _CLOSE_PROCESS "TuLuOpenClaw.exe"
  !insertmacro _CLOSE_PROCESS "clawpanel.exe"
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
        DetailPrint "Old XingShu.exe could not be moved; scheduling deletion after reboot."
        Delete /REBOOTOK "$INSTDIR\XingShu.exe"
      ${Else}
        Delete /REBOOTOK "$INSTDIR\XingShu.exe.old"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _KILL_XINGSHU_PROCESSES
  !insertmacro _UNLOCK_OLD_XINGSHU_EXE
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _KILL_XINGSHU_PROCESSES
!macroend
