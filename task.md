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
- [x] สร้าง `expandScenesWithTopic()` ใน `functions/index.js`
- [x] รับ Input: modeData, expanderBlocks, episodeTopic
- [x] ใช้ Per-Scene Loop (วนขยายทีละฉาก)
- [x] Return: Array ของ Expanded Prompts

### 1.2 อัปเดต `testPromptPipeline` <!-- id: 1.2 -->
- [x] เรียกใช้ `expandScenesWithTopic()` แทน Bulk Generation
- [x] ดึง Episode จาก Content Queue (status: "pending")
- [x] บันทึกผลลัพธ์ไปที่ `testLogs/` (แยกจาก Production)
- [x] เพิ่ม TTL: `expiresAt` field (7 วัน)

### 1.3 อัปเดต `scheduleJobs` <!-- id: 1.3 -->
- [x] เรียกใช้ `expandScenesWithTopic()` เหมือน Test
- [x] บันทึก Production Data ไปที่ `readyPrompts/`
- [x] Mark Episode เป็น "used" และย้ายไป `episodeHistory/`

---

## Phase 2: ระบบ Episode Queue Management <!-- priority: HIGH -->

### 2.1 Episode Status System <!-- id: 2.1 -->
- [x] เพิ่ม Field ใน Firestore: `status`, `usedAt`, `jobId`
- [x] สถานะ: `pending` → `processing` → `used`
- [x] แสดงสถานะใน UI (Status Badge สีต่างกัน)

### 2.2 Episode Selection Mode <!-- id: 2.2 -->
- [x] เพิ่ม Setting ใน Project: `episodeSelection`
- [x] รองรับ 2 โหมด:
  - `sequential`: เรียงตาม `order` (1, 2, 3...)
  - `random`: สุ่มจาก Episode ที่ยังเป็น pending
- [x] แสดง UI ให้เลือกโหมด (Dropdown ใน Projects.jsx)

### 2.3 Episode History System <!-- id: 2.3 -->
- [x] สร้าง Collection: `episodeHistory/`
- [x] ย้าย Episode ที่ใช้แล้วไป History
- [x] เก็บข้อมูล: usedAt, jobId, generatedPrompts, titles, tags
- [x] แสดง History ใน UI (Tab แยกใน ContentQueue.jsx)

---

## Phase 3: Auto-Refill System <!-- priority: MEDIUM -->

### 3.1 Project Settings <!-- id: 3.1 -->
- [x] เพิ่ม Settings ใน UI (Projects.jsx Content Queue Tab):
  - `autoRefillEnabled`: Toggle เปิด/ปิด
  - `autoRefillThreshold`: Number Input (default: 5)
  - `autoRefillCount`: Number Input (default: 10)
  - `autoRefillPrompt`: ใช้ใน autoGenerateEpisodesInternal

### 3.2 Auto-Generate Function <!-- id: 3.2 -->
- [x] สร้าง `autoGenerateEpisodes` Cloud Function (Callable)
- [x] สร้าง `autoGenerateEpisodesInternal()` helper
- [x] Trigger อัตโนมัติใน scheduleJobs เมื่อเหลือน้อยกว่า Threshold
- [x] ดึง History มาเป็น Context ให้ AI เรียนรู้
- [x] สร้าง Episode ใหม่ แล้วเพิ่มเข้า Queue

### 3.3 Notification System <!-- id: 3.3 -->
- [x] Log การ Auto-Generate ไว้ใน Project logs
- [ ] แจ้งเตือน User เมื่อ Episode ใกล้หมด (Future)
- [ ] Push Notification เมื่อ AI สร้าง Episode ใหม่ (Future)

---

## Phase 4: Frontend UI Updates <!-- priority: MEDIUM -->

### 4.1 Content Queue UI <!-- id: 4.1 -->
- [x] แสดง Status Badge (Pending/Processing/Used) - `getStatusBadge()`
- [x] Tab Switcher: Queue / History
- [x] แสดง Episode History พร้อมวันที่ใช้
- [ ] Drag & Drop เรียงลำดับ Episode (Future)
- [ ] ปุ่ม "Move to Queue" (Future)

### 4.2 Project Settings UI <!-- id: 4.2 -->
- [x] เพิ่ม Section "Episode Settings" ใน Content Queue Tab
- [x] Dropdown: Selection Mode (Sequential/Random)
- [x] Toggle: Auto-Refill On/Off
- [x] Number Inputs: Threshold, Count

### 4.3 Test Results UI <!-- id: 4.3 -->
- [x] บันทึก Episode ID/Title ใน testLogs
- [ ] แสดง Preview Prompt/Title/Tags (Future)
- [ ] ปุ่ม Copy Prompt ไปใช้งาน (Future)

---

## Phase 5: Cleanup & Maintenance <!-- priority: LOW -->

### 5.1 TTL Cleanup Function <!-- id: 5.1 -->
- [x] `cleanupExpiredTestLogs`: ทุกวัน 2:00 AM UTC
- [x] ลบ `testLogs/` ที่ `expiresAt < now`
- [x] `cleanupOldEpisodeHistory`: ทุกวันอาทิตย์ 3:00 AM UTC
- [x] ลบ `episodeHistory/` ที่เก่ากว่า 30 วัน

### 5.2 Documentation <!-- id: 5.2 -->
- [ ] เขียน User Guide ภาษาไทย
- [ ] อัปเดต README.md

---

## Phase 6: Frontend Deployment & Auto Deploy <!-- priority: HIGH -->

### 6.1 GitHub Repository <!-- id: 6.1 -->
- [x] Push codebase to GitHub: `13Basskung/aicontent`
- [x] Set up Git remote origin
- [x] Configure branch: `main`

### 6.2 Cloudflare Pages Deployment <!-- id: 6.2 -->
- [x] Create Cloudflare Pages project: `aicontent`
- [x] Connect to GitHub repository
- [x] Configure build settings:
  - Framework: None (Vite)
  - Build command: `npm run build`
  - Build output: `dist`
  - Root directory: `frontend`
- [x] Enable automatic deployments on push to `main`

### 6.3 Custom Domain Setup <!-- id: 6.3 -->
- [x] Configure custom domain: `aicontents.vip`
- [x] Configure www subdomain: `www.aicontents.vip`
- [x] SSL/HTTPS enabled
- [x] DNS records configured via Cloudflare

---

## 📊 Progress Summary
| Phase | สถานะ | ความสำคัญ |
|:------|:------|:---------|
| Phase 1: Prompt Pipeline | ✅ เสร็จ | 🔴 สูง |
| Phase 2: Episode Queue | ✅ เสร็จ | 🔴 สูง |
| Phase 3: Auto-Refill | ✅ เสร็จ | 🟡 กลาง |
| Phase 4: Frontend UI | ✅ เสร็จ (Core) | 🟡 กลาง |
| Phase 5: Cleanup | ✅ เสร็จ | 🟢 ต่ำ |
| Phase 6: Deployment | ✅ เสร็จ | 🔴 สูง |

---

## 📝 Last Updated: 2026-01-21

### Implementation Notes:
- **Shared Logic**: `expandScenesWithTopic()`, `generateTitlesAndTags()`, `getNextEpisode()`, `getRemainingEpisodeCount()`
- **New Collections**: `testLogs/`, `readyPrompts/`, `episodeHistory/`
- **New Settings**: `episodeSelection`, `autoRefillEnabled`, `autoRefillThreshold`, `autoRefillCount`
- **New Functions**: `autoGenerateEpisodes`, `cleanupExpiredTestLogs`, `cleanupOldEpisodeHistory`

### Deployment Notes:
- **Live URL**: https://aicontents.vip
- **GitHub Repo**: https://github.com/13Basskung/aicontent
- **Hosting**: Cloudflare Pages (Project: `aicontent`)
- **Auto Deploy**: ทุกครั้งที่ push ไป branch `main` → เว็บอัปเดตอัตโนมัติ
