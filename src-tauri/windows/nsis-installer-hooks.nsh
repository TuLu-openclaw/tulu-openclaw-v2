!include LogicLib.nsh

!macro _HIDDEN_TASKKILL_EXE PROC_NAME
  DetailPrint "Closing ${PROC_NAME} if running..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${PROC_NAME}"'
!macroend

!macro _CLEAR_XINGSHU_SELF_EXIT_SIGNAL
  Delete "$PROFILE\.openclaw\星枢OpenClaw\install-shutdown.signal"
  Delete "$LOCALAPPDATA\星枢OpenClaw\install-shutdown.signal"
!macroend

!macro _REQUEST_XINGSHU_SELF_EXIT
  DetailPrint "Requesting running XingShu/OpenClaw to exit..."
  CreateDirectory "$PROFILE\.openclaw\星枢OpenClaw"
  FileOpen $0 "$PROFILE\.openclaw\星枢OpenClaw\install-shutdown.signal" w
  FileWrite $0 "install`r`n"
  FileClose $0
  CreateDirectory "$LOCALAPPDATA\星枢OpenClaw"
  FileOpen $0 "$LOCALAPPDATA\星枢OpenClaw\install-shutdown.signal" w
  FileWrite $0 "install`r`n"
  FileClose $0
!macroend

!macro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _REQUEST_XINGSHU_SELF_EXIT
  Sleep 3000

  DetailPrint "Force closing XingShu/OpenClaw process tree without visible console..."
  !insertmacro _HIDDEN_TASKKILL_EXE "XingShu.exe"
  !insertmacro _HIDDEN_TASKKILL_EXE "星枢OpenClaw.exe"
  !insertmacro _HIDDEN_TASKKILL_EXE "XingShuOpenClaw.exe"
  !insertmacro _HIDDEN_TASKKILL_EXE "TuLuOpenClaw.exe"
  !insertmacro _HIDDEN_TASKKILL_EXE "clawpanel.exe"
  Sleep 3000
!macroend

!macro _CLEAN_FAILED_INSTALL_LEFTOVERS
  ; Remove previous failed-install leftovers. Do not use /REBOOTOK and do not create new .old files.
  ${If} ${FileExists} "$INSTDIR\XingShu.exe.old"
    Delete "$INSTDIR\XingShu.exe.old"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _CLEAR_XINGSHU_SELF_EXIT_SIGNAL
  SetRebootFlag false
  !insertmacro _CLOSE_XINGSHU_PROCESSES
  !insertmacro _CLEAN_FAILED_INSTALL_LEFTOVERS
  SetRebootFlag false
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _CLEAR_XINGSHU_SELF_EXIT_SIGNAL
  SetRebootFlag false
  !insertmacro _CLOSE_XINGSHU_PROCESSES
  SetRebootFlag false
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro _CLEAR_XINGSHU_SELF_EXIT_SIGNAL
  SetRebootFlag false
!macroend
