!include LogicLib.nsh
!include x64.nsh

!macro _CLOSE_PROCESS_BY_NAME PROC_NAME
  ClearErrors
  FindProcDLL::FindProc "${PROC_NAME}"
  ${If} $R0 == 1
    DetailPrint "Closing ${PROC_NAME}..."
    KillProcDLL::KillProc "${PROC_NAME}"
    Sleep 800
  ${Else}
    DetailPrint "${PROC_NAME} is not running."
  ${EndIf}
!macroend

!macro _KILL_XINGSHU_PROCESSES
  DetailPrint "Closing running XingShu/OpenClaw processes before install..."
  !insertmacro _CLOSE_PROCESS_BY_NAME "XingShu.exe"
  !insertmacro _CLOSE_PROCESS_BY_NAME "星枢OpenClaw.exe"
  !insertmacro _CLOSE_PROCESS_BY_NAME "XingShuOpenClaw.exe"
  !insertmacro _CLOSE_PROCESS_BY_NAME "TuLuOpenClaw.exe"
  !insertmacro _CLOSE_PROCESS_BY_NAME "clawpanel.exe"
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShu.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "星枢OpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "TuLuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "clawpanel.exe"'
  Sleep 1200
!macroend

!macro _UNLOCK_OLD_XINGSHU_EXE
  ${If} ${FileExists} "$INSTDIR\XingShu.exe"
    ClearErrors
    Delete "$INSTDIR\XingShu.exe"
    ${If} ${Errors}
      DetailPrint "XingShu.exe is still locked; scheduling old file replacement after reboot."
      Rename "$INSTDIR\XingShu.exe" "$INSTDIR\XingShu.exe.old"
      ${If} ${Errors}
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
