# CodexDesk 2

แอป Electron สำหรับใช้งาน Codex CLI กับโปรเจกต์ในเครื่อง

## ติดตั้ง

1. ติดตั้ง Node.js LTS x64
2. เปิด `build.cmd`
3. เปิด `CodexDesk-Setup-2.1.0-x64.exe` ในโฟลเดอร์ `release`
4. กดปุ่มเข้าสู่ระบบภายใน CodexDesk

## พัฒนา

```cmd
npm install
npm run dev
```

## ระบบ

- Electron และ React
- Monaco Editor
- Motion spring animation
- Codex CLI
- เข้าสู่ระบบ ChatGPT ผ่านเบราว์เซอร์เป็นค่าเริ่มต้น และมี Device Code เป็นวิธีสำรอง
- ปุ่มสถานะการเชื่อมต่อ ChatGPT บนแถบด้านบน
- ไม่มีหน้าต่าง CMD ระหว่างใช้งาน
- เรียก Codex แบบ Native background process และปิด stdin อัตโนมัติ
- ตรวจสอบ Codex runtime ก่อนสร้างแอป
- ปิดโปรเซส Codex ทั้งหมดเมื่อหยุดงานหรือปิดแอป
- ใช้ CODEX_HOME แยกจาก Codex ตัวอื่นเพื่อป้องกันแคชชนกัน
- แชต Codex มี Scrollbar และเลื่อนไปข้อความล่าสุดอัตโนมัติ
- ลบรหัสสี ANSI ออกจากลิงก์และข้อความทั้งหมด
- ไม่มี Terminal ในหน้าหลัก ใช้งานผ่านแชต Codex เท่านั้น
- โหมดแก้ไขไฟล์รองรับ Windows Server 2019 โดยไม่เรียก PowerShell
- ซ่อน diagnostic log ภายในและแสดงเฉพาะคำตอบของ Codex
- รองรับโฟลเดอร์ที่ไม่ได้เปิดใช้ Git
- ตรวจ GitHub Releases อัตโนมัติและมีปุ่มดาวน์โหลดกับติดตั้งอัปเดตในแอป
- Git diff
- จำกัดการอ่านและเขียนไฟล์ในโปรเจกต์ที่เลือก

Canva UI: https://www.canva.com/d/OOjZvaU2lCDR880
