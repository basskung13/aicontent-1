# 🎬 Parallel Video Generation + FFmpeg Stitch (Revised)

> **เป้าหมาย:** สร้าง Scene แยก + Download พร้อม Track ลำดับ + FFmpeg รวมวีดีโอ

---

## Phase 1: Extension - Scene State Tracking

- [x] เพิ่ม `currentJobContext` object ใน `background/index.js`
- [x] เพิ่ม `initSceneTracking()` function
- [x] เพิ่ม `setCurrentScene()` function

---

## Phase 2: Extension - Download Interceptor Enhancement

- [x] แก้ไข Download Listener เก็บ `sceneIndex` ลง Array
- [x] รักษา `latest_asset` สำหรับ Backward Compatibility

---

## Phase 3: Extension - Agent Communication

- [x] เพิ่ม `createAgentJob()` helper
- [x] เพิ่ม `waitForAgentJob()` polling helper
- [x] เพิ่ม `getOrderedSceneFiles()` helper

---

## Phase 4: LOOP Block Integration

- [x] แก้ไข LOOP block ใน `checkJobs()` เรียก `initSceneTracking()`
- [x] เรียก `setCurrentScene()` ก่อนแต่ละ Scene

---

## Phase 5: STITCH_VIDEO Block Handling

- [x] เพิ่ม Logic ตรวจ `requiresAgent` flag
- [x] สร้าง Agent Job + รอ Completion
- [x] อัพเดท `latest_asset` หลัง Stitch เสร็จ

---

## Phase 6: Desktop Agent - FFmpeg

- [x] เพิ่ม `CMD_STITCH_VIDEO` handler ใน `main.py`
- [x] เพิ่ม `stitch_videos()` method
- [x] Handle file validation + error cases

---

## Phase 7: Firestore Block + Testing

- [x] สร้าง `STITCH_VIDEO` document ใน `global_recipe_blocks` ✅ (via seedDatabase)
- [x] ติดตั้ง FFmpeg: ✅ v8.0.1 Installed
- [ ] ทดสอบ Full Flow: GENERATE → STITCH → UPLOAD

---

## 📝 Last Updated: 2026-01-22
