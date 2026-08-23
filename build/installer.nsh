!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "ต้องการลบประวัติแชท การตั้งค่า และบัญชี CodexDesk ออกจากเครื่องด้วยหรือไม่" IDNO codexdesk_keep_data
  RMDir /r "$APPDATA\CodexDesk"
  RMDir /r "$APPDATA\codexdesk"
  codexdesk_keep_data:
!macroend
