!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing running XingShuOpenClaw processes before install..."
  nsExec::ExecToLog 'taskkill /F /T /IM "星枢OpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShu.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "XingShuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "TuLuOpenClaw.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "clawpanel.exe"'
  Sleep 1000
!macroend
