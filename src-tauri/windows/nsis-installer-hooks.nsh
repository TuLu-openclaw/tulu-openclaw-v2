!include LogicLib.nsh

!macro _HIDDEN_TASKKILL_EXE PROC_NAME
  DetailPrint "Closing ${PROC_NAME} if running..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${PROC_NAME}"'
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

!macro _UNLOCK_OLD_XINGSHU_EXE
  ; Remove previous failed-install leftovers. Do not use /REBOOTOK and do not create new .old files.
  ${If} ${FileExists} "$INSTDIR\XingShu.exe.old"
    Delete "$INSTDIR\XingShu.exe.old"
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\XingShu.exe"
    ClearErrors
    Delete "$INSTDIR\XingShu.exe"
    ${If} ${Errors}
      DetailPrint "Old XingShu.exe is still locked after self-exit signal and hidden taskkill."
      MessageBox MB_ICONSTOP|MB_OK "安装器无法替换旧版 XingShu.exe。旧版程序或 Windows WebView2 子进程仍占用文件。请打开任务管理器结束 XingShu.exe 后重新安装。新版安装后，后续更新会通过自退出信号自动退出。"
      Abort
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
