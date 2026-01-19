# 📋 Task Checklist: Content Queue & Prompt Pipeline System

## 🎯 เป้าหมายหลัก (Main Objectives)
ทำให้ระบบสร้าง Prompt/Title/Tag พร้อมใช้งานจริง โดย:
1. ✅ Generate Test ให้ผลลัพธ์เหมือน Production 100%
2. ✅ Episode จาก Content Queue ถูกนำไปใช้ใน Prompt
3. ✅ มีระบบ Status + History สำหรับ Episode
4. ✅ Auto-Generate Episode เมื่อใกล้หมด

---

## Phase 1: แก้ไข Prompt Pipeline (Backend) <!-- priority: HIGH -->

### 1.1 สร้าง Shared Logic Function <!-- id: 1.1 -->
- [/] สร้าง `expandScenesWithTopic()` ใน `functions/index.js`
- [ ] รับ Input: modeData, expanderBlocks, episodeTopic
- [ ] ใช้ Per-Scene Loop (วนขยายทีละฉาก)
- [ ] Return: Array ของ Expanded Prompts

### 1.2 อัปเดต `testPromptPipeline` <!-- id: 1.2 -->
- [ ] เรียกใช้ `expandScenesWithTopic()` แทน Bulk Generation
- [ ] ดึง Episode จาก Content Queue (status: "pending")
- [ ] บันทึกผลลัพธ์ไปที่ `testLogs/` (แยกจาก Production)
- [ ] เพิ่ม TTL: ลบ Log เก่ากว่า 7 วัน

### 1.3 อัปเดต `scheduleJobs` <!-- id: 1.3 -->
- [ ] เรียกใช้ `expandScenesWithTopic()` เหมือน Test
- [ ] บันทึก Production Data ไปที่ `readyPrompts/`
- [ ] Mark Episode เป็น "used"

---

## Phase 2: ระบบ Episode Queue Management <!-- priority: HIGH -->

### 2.1 Episode Status System <!-- id: 2.1 -->
- [ ] เพิ่ม Field ใน Firestore: `status`, `usedAt`, `jobId`
- [ ] สถานะ: `pending` → `processing` → `used`
- [ ] แสดงสถานะใน UI (สีต่างกัน)

### 2.2 Episode Selection Mode <!-- id: 2.2 -->
- [ ] เพิ่ม Setting ใน Project: `episodeSelection`
- [ ] รองรับ 2 โหมด:
  - `sequential`: เรียงตาม `order` (1, 2, 3...)
  - `random`: สุ่มจาก Episode ที่ยังเป็น pending
- [ ] แสดง UI ให้เลือกโหมด

### 2.3 Episode History System <!-- id: 2.3 -->
- [ ] สร้าง Collection: `episodeHistory/`
- [ ] ย้าย Episode ที่ใช้แล้วไป History
- [ ] เก็บข้อมูล: usedAt, jobId, generatedPrompts
- [ ] แสดง History ใน UI (Tab แยก)

---

## Phase 3: Auto-Refill System <!-- priority: MEDIUM -->

### 3.1 Project Settings <!-- id: 3.1 -->
- [ ] เพิ่ม Settings ใน UI:
  - `autoRefillEnabled`: เปิด/ปิด
  - `autoRefillThreshold`: เหลือกี่ Episode ถึง Trigger (default: 5)
  - `autoRefillCount`: สร้างครั้งละกี่ Episode (default: 10)
  - `autoRefillPrompt`: คำสั่งให้ AI สร้าง Episode

### 3.2 Auto-Generate Function <!-- id: 3.2 -->
- [ ] สร้าง `autoGenerateEpisodes` Cloud Function
- [ ] Trigger เมื่อ Episode เหลือน้อยกว่า Threshold
- [ ] ดึง History มาเป็น Context ให้ AI เรียนรู้
- [ ] สร้าง Episode ใหม่ แล้วเพิ่มเข้า Queue

### 3.3 Notification System <!-- id: 3.3 -->
- [ ] แจ้งเตือน User เมื่อ Episode ใกล้หมด
- [ ] แจ้งเตือนเมื่อ AI สร้าง Episode ใหม่แล้ว
- [ ] Log การ Auto-Generate ไว้ตรวจสอบ

---

## Phase 4: Frontend UI Updates <!-- priority: MEDIUM -->

### 4.1 Content Queue UI <!-- id: 4.1 -->
- [ ] แสดง Status Badge (Pending/Processing/Used)
- [ ] Drag & Drop เรียงลำดับ Episode
- [ ] ปุ่ม "Move to Queue" (ย้ายจาก History กลับมา)

### 4.2 Project Settings UI <!-- id: 4.2 -->
- [ ] เพิ่ม Section "Episode Settings"
- [ ] Dropdown: Selection Mode (Sequential/Random)
- [ ] Toggle: Auto-Refill On/Off
- [ ] Number Inputs: Threshold, Count

### 4.3 Test Results UI <!-- id: 4.3 -->
- [ ] แสดง Preview Prompt/Title/Tags
- [ ] แสดงว่าใช้ Episode ไหน
- [ ] ปุ่ม Copy Prompt ไปใช้งาน

---

## Phase 5: Cleanup & Maintenance <!-- priority: LOW -->

### 5.1 TTL Cleanup Function <!-- id: 5.1 -->
- [ ] Scheduled Function: ทุกวันเที่ยงคืน
- [ ] ลบ `testLogs/` ที่เก่ากว่า 7 วัน
- [ ] ลบ `episodeHistory/` ที่เก่ากว่า 30 วัน (optional)

### 5.2 Documentation <!-- id: 5.2 -->
- [ ] เขียน User Guide ภาษาไทย
- [ ] อัปเดต README.md

---

## 📊 Progress Summary
| Phase | สถานะ | ความสำคัญ |
|:------|:------|:---------|
| Phase 1: Prompt Pipeline | ⏳ รอเริ่ม | 🔴 สูง |
| Phase 2: Episode Queue | ⏳ รอเริ่ม | 🔴 สูง |
| Phase 3: Auto-Refill | ⏳ รอเริ่ม | 🟡 กลาง |
| Phase 4: Frontend UI | ⏳ รอเริ่ม | 🟡 กลาง |
| Phase 5: Cleanup | ⏳ รอเริ่ม | 🟢 ต่ำ |
