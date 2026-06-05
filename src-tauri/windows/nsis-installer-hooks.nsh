!include LogicLib.nsh

!macro _TASKKILL_PROCESS PROC_NAME
  DetailPrint "Closing ${PROC_NAME} if running..."
  nsExec::ExecToLog 'cmd /C taskkill /F /T /IM "${PROC_NAME}" 2>NUL || exit /B 0'
!macroend

!macro _KILL_XINGSHU_PROCESSES
  DetailPrint "Closing running XingShu/OpenClaw processes before install..."
  !insertmacro _TASKKILL_PROCESS "XingShu.exe"
  !insertmacro _TASKKILL_PROCESS "星枢OpenClaw.exe"
  !insertmacro _TASKKILL_PROCESS "XingShuOpenClaw.exe"
  !insertmacro _TASKKILL_PROCESS "TuLuOpenClaw.exe"
  !insertmacro _TASKKILL_PROCESS "clawpanel.exe"
  Sleep 1500
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
