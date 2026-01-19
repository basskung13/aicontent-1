# 📋 Implementation Plan: Content Queue & Prompt Pipeline

> **วันที่อัปเดต:** 2026-01-19  
> **สถานะ:** รอ User Approve

---

## 🎯 เป้าหมาย (Objectives)

1. **Generate Test = Production** — ใช้ Logic เดียวกัน ("What You See Is What You Get")
2. **Episode Integration** — ดึง Episode จาก Queue มาเป็น Topic หลักใน Prompt
3. **Status & History** — ติดตาม Episode ว่าใช้แล้วหรือยัง + เก็บ Log
4. **Auto-Refill** — AI สร้าง Episode ใหม่เมื่อใกล้หมด

---

## 📁 ไฟล์ที่ต้องแก้ไข

### Backend (Firebase Functions)

#### [MODIFY] [index.js](file:///c:/content-auto-post/functions/index.js)
1. **สร้าง `expandScenesWithTopic()`** — Shared Logic สำหรับขยาย Prompt
2. **อัปเดต `testPromptPipeline`** — ใช้ Shared Logic + บันทึก `testLogs/`
3. **อัปเดต `scheduleJobs`** — ใช้ Shared Logic + บันทึก `readyPrompts/` + เปลี่ยน Status Episode
4. **สร้าง `autoGenerateEpisodes`** — AI สร้าง Episode อัตโนมัติ

---

### Frontend (React)

#### [MODIFY] [Projects.jsx](file:///c:/content-auto-post/frontend/src/pages/Projects.jsx)
1. **เพิ่ม Episode Settings UI** — Selection Mode, Auto-Refill Toggle

#### [MODIFY] [ContentQueue.jsx](file:///c:/content-auto-post/frontend/src/components/Projects/ContentQueue.jsx) *(ถ้ามี)*
1. **แสดง Status Badge** — Pending/Processing/Used
2. **เพิ่ม Tab History** — แสดง Episode ที่ใช้แล้ว

---

## 🗂️ Database Schema Updates

| Collection Path | ประเภท | หมายเหตุ |
|:----------------|:------|:---------|
| `episodes/{id}` | MODIFY | เพิ่ม `status`, `usedAt`, `jobId` |
| `testLogs/{id}` | NEW | เก็บผลลัพธ์จาก Generate Test |
| `readyPrompts/{id}` | NEW | เก็บ Prompt พร้อมใช้สำหรับ Extension |
| `episodeHistory/{id}` | NEW | เก็บ Episode ที่ใช้แล้ว |
| `projects/{id}` | MODIFY | เพิ่ม Settings: `episodeSelection`, `autoRefillEnabled`, etc. |

---

## ⏱️ ลำดับการทำงาน (Priority Order)

| Phase | งาน | เวลาประมาณ |
|:------|:----|:----------|
| **1** | Backend: Shared Logic + testPromptPipeline | 2-3 ชม. |
| **2** | Backend: Episode Status + History | 1-2 ชม. |
| **3** | Backend: Auto-Refill | 1-2 ชม. |
| **4** | Frontend: Settings UI + Status Badge | 2-3 ชม. |
| **5** | Testing + Cleanup Function | 1 ชม. |

**รวมประมาณ:** 8-12 ชั่วโมง

---

## ✅ Verification Plan

1. **กด Generate Test** → ตรวจสอบ:
   - [ ] Prompt ละเอียด (Cinematic Style)
   - [ ] ใช้ Episode จาก Queue
   - [ ] บันทึก testLogs/
   - [ ] Episode ยังเป็น pending

2. **Trigger Schedule** → ตรวจสอบ:
   - [ ] บันทึก readyPrompts/
   - [ ] Episode เป็น used
   - [ ] ย้ายไป episodeHistory/

3. **Auto-Refill** → ตรวจสอบ:
   - [ ] Trigger เมื่อเหลือ < threshold
   - [ ] AI สร้าง Episodes ใหม่

---

## 📚 เอกสารประกอบ

- [Task Checklist](file:///C:/Users/faceb/.gemini/antigravity/brain/6453f044-86a9-43c1-933e-0ae7c76a2d0d/task.md)
- [Walkthrough Document](file:///C:/Users/faceb/.gemini/antigravity/brain/6453f044-86a9-43c1-933e-0ae7c76a2d0d/walkthrough.md)
