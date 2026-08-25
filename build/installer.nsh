!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "ลบประวัติแชทและข้อมูลย้อนกลับทั้งหมดหรือไม่?$\r$\n$\r$\nDelete all chat and undo history?" IDNO codexdesk_keep_history
      RMDir /r "$APPDATA\CodexDesk\chat-history"
      RMDir /r "$APPDATA\CodexDesk\undo-history"
      RMDir /r "$APPDATA\codexdesk\chat-history"
      RMDir /r "$APPDATA\codexdesk\undo-history"
    codexdesk_keep_history:

    MessageBox MB_YESNO|MB_ICONQUESTION "ลบการตั้งค่าและข้อมูลลงชื่อเข้าใช้ทั้งหมดหรือไม่?$\r$\n$\r$\nDelete all settings and sign-in data?" IDNO codexdesk_keep_settings
      Delete "$APPDATA\CodexDesk\settings.json"
      RMDir /r "$APPDATA\CodexDesk\codex-home"
      RMDir /r "$APPDATA\CodexDesk\Local Storage"
      RMDir /r "$APPDATA\CodexDesk\Session Storage"
      Delete "$APPDATA\CodexDesk\Preferences"
      Delete "$APPDATA\codexdesk\settings.json"
      RMDir /r "$APPDATA\codexdesk\codex-home"
      RMDir /r "$APPDATA\codexdesk\Local Storage"
      RMDir /r "$APPDATA\codexdesk\Session Storage"
      Delete "$APPDATA\codexdesk\Preferences"
    codexdesk_keep_settings:

    RMDir "$APPDATA\CodexDesk"
    RMDir "$APPDATA\codexdesk"
  ${endIf}
!macroend
