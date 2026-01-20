# 🧱 Recipe Block System - แผนการพัฒนาระบบ

> **สร้างเมื่อ:** 20 มกราคม 2026  
> **อัปเดตล่าสุด:** 20 มกราคม 2026  
> **สถานะ:** กำลังดำเนินการ

---

## 📋 สารบัญ

1. [ภาพรวมโครงการ](#1-ภาพรวมโครงการ)
2. [สิ่งที่ทำไปแล้ว](#2-สิ่งที่ทำไปแล้ว)
3. [สิ่งที่ต้องทำต่อ](#3-สิ่งที่ต้องทำต่อ)
4. [รายละเอียดแต่ละเฟส](#4-รายละเอียดแต่ละเฟส)
5. [โครงสร้าง Firestore](#5-โครงสร้าง-firestore)
6. [Variable Markers](#6-variable-markers)
7. [Extension UI Design](#7-extension-ui-design)

---

## 1. ภาพรวมโครงการ

### 🎯 เป้าหมาย

สร้างระบบ **Recipe Block System** ที่ยืดหยุ่นเหมือนการต่อ LEGO โดย:
- แยก Recipe ออกเป็น **Block** ย่อยๆ ที่ทำหน้าที่เฉพาะ
- สามารถนำ Block มา **ต่อกัน** เป็น Flow การทำงาน
- รองรับการ **ขยายในอนาคต** (เช่น เพิ่ม Block สำหรับ Import รูปภาพ)

### 🏗️ สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTENT AUTO POST                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   Frontend  │    │  Firebase   │    │  Extension  │             │
│  │  (Admin UI) │◀──▶│  Functions  │◀──▶│  (Chrome)   │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  Posting    │    │  Firestore  │    │  Recipe     │             │
│  │  Schedule   │    │  Database   │    │  Executor   │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 🧱 ประเภท Block

| ประเภท | สัญลักษณ์ | คำอธิบาย |
|--------|----------|----------|
| **LOOP** | 🔁 | ทำซ้ำตามจำนวน Scenes/Prompts |
| **ONCE** | ⏺ | ทำครั้งเดียว |

### 📦 รายการ Block ที่วางแผนไว้

| Block ID | ชื่อ | ประเภท | หมวด |
|----------|------|--------|------|
| `ADD_SCENE_TEXT` | เพิ่ม Scene (Text Prompt) | LOOP | scene |
| `ADD_SCENE_IMAGE` | เพิ่ม Scene (Import รูป) | LOOP | scene |
| `EXPORT_VIDEO` | Export วิดีโอ | ONCE | export |
| `DOWNLOAD_FILE` | Download ไฟล์ | ONCE | export |
| `UPLOAD_YOUTUBE` | อัปโหลด YouTube | ONCE | upload |
| `UPLOAD_FACEBOOK` | อัปโหลด Facebook | ONCE | upload |
| `UPLOAD_TIKTOK` | อัปโหลด TikTok | ONCE | upload |
| `UPLOAD_INSTAGRAM` | อัปโหลด Instagram | ONCE | upload |

---

## 2. สิ่งที่ทำไปแล้ว

### ✅ เฟส 1: แก้ไข Backend (scheduleJobs)

**ไฟล์:** `functions/index.js`  
**สถานะ:** ✅ เสร็จสมบูรณ์

**การเปลี่ยนแปลง:**
- เพิ่มการสร้าง `recipeSequence` อัตโนมัติจาก `slot.platforms`
- เพิ่ม `currentRecipeIndex` สำหรับติดตามความคืบหน้า
- เพิ่ม `platforms`, `titles`, `tags` ลงใน Job Document

**โค้ดที่แก้ไข:** บรรทัด 1481-1524
```javascript
// === BUILD RECIPE SEQUENCE ===
const PLATFORM_TO_RECIPE = {
  'facebook': 'RECIPE_UPLOAD_FACEBOOK',
  'youtube': 'RECIPE_UPLOAD_YOUTUBE',
  'tiktok': 'RECIPE_UPLOAD_TIKTOK',
  'instagram': 'RECIPE_UPLOAD_INSTAGRAM'
};

const recipeSequence = ['RECIPE_GENERATE_VIDEO'];
slotPlatforms.forEach(p => {
  const uploadRecipe = PLATFORM_TO_RECIPE[p.platformId];
  if (uploadRecipe) recipeSequence.push(uploadRecipe);
});
```

---

### ✅ เฟส 2: เพิ่ม Helper Functions (Extension)

**ไฟล์:** `extension/src/background/index.js`  
**สถานะ:** ✅ เสร็จสมบูรณ์

**การเปลี่ยนแปลง:**
- เพิ่ม `fromFirestoreValue()` - แปลงค่า Firestore เป็น JS Object
- เพิ่ม `fetchGlobalRecipe()` - ดึง Recipe จาก `global_recipes` collection

**โค้ดที่แก้ไข:** บรรทัด 12-53

---

### ✅ เฟส 3: แก้ไข checkJobs (รองรับ Recipe Sequence)

**ไฟล์:** `extension/src/background/index.js`  
**สถานะ:** ✅ เสร็จสมบูรณ์

**การเปลี่ยนแปลง:**
- Parse `recipeSequence`, `currentRecipeIndex`, `platforms`, `prompts`, `titles`, `tags`
- วน Loop ผ่าน Recipe Sequence
- รองรับ LOOP Block (ทำซ้ำตาม prompts.length)
- รองรับ ONCE Block (ทำครั้งเดียว)
- Retry 3 ครั้งเมื่อเกิด Error
- บันทึก Log และอัปเดตสถานะ

**โค้ดที่แก้ไข:** บรรทัด 215-458

---

### ✅ เฟส 4: แก้ไข player.js (Variable Injection)

**ไฟล์:** `extension/src/content/player.js`  
**สถานะ:** ✅ เสร็จสมบูรณ์

**การเปลี่ยนแปลง:**
- รองรับ Variable Injection สำหรับ Arrays (join ด้วย comma)
- รองรับ Variable Injection สำหรับ Objects (stringify)
- Handle null/undefined values

**โค้ดที่แก้ไข:** บรรทัด 226-247

---

## 3. สิ่งที่ต้องทำต่อ

### ⏳ เฟส 5: เปลี่ยนจาก Recipe เดียว เป็น Block System

| ลำดับ | งาน | สถานะ | ไฟล์ที่เกี่ยวข้อง |
|-------|-----|--------|------------------|
| 5.1 | สร้าง Firestore Structure สำหรับ `global_recipe_blocks` | ⏳ รอ | Firestore Console |
| 5.2 | สร้าง Firestore Structure สำหรับ `recipe_templates` | ⏳ รอ | Firestore Console |
| 5.3 | แก้ไข `fetchGlobalRecipe` เป็น `fetchBlock` | ⏳ รอ | `extension/src/background/index.js` |
| 5.4 | แก้ไข `checkJobs` ให้ใช้ `blockSequence` แทน `recipeSequence` | ⏳ รอ | `extension/src/background/index.js` |

---

### ⏳ เฟส 6: สร้าง Extension UI - Block Builder

| ลำดับ | งาน | สถานะ | ไฟล์ที่เกี่ยวข้อง |
|-------|-----|--------|------------------|
| 6.1 | เพิ่มหน้า Block Library | ⏳ รอ | `extension/src/App.jsx` |
| 6.2 | เพิ่มหน้า Sequence Builder (Drag & Drop) | ⏳ รอ | `extension/src/App.jsx` |
| 6.3 | เพิ่มปุ่ม Variable Markers ตอน Recording | ⏳ รอ | `extension/src/App.jsx` |
| 6.4 | เพิ่ม Logic ส่ง Variable Marker ไปยัง Content Script | ⏳ รอ | `extension/src/content/recorder.js` |

---

### ⏳ เฟส 7: Admin Record Blocks

| ลำดับ | Block | สถานะ |
|-------|-------|--------|
| 7.1 | `ADD_SCENE_TEXT` (Google Vids - Text Prompt) | ⏳ รอ |
| 7.2 | `EXPORT_VIDEO` (Google Vids - Export) | ⏳ รอ |
| 7.3 | `DOWNLOAD_FILE` (Google Vids - Download) | ⏳ รอ |
| 7.4 | `UPLOAD_YOUTUBE` | ⏳ รอ |
| 7.5 | `UPLOAD_FACEBOOK` | ⏳ รอ |
| 7.6 | `UPLOAD_TIKTOK` | ⏳ รอ |
| 7.7 | `UPLOAD_INSTAGRAM` | ⏳ รอ |

---

### ⏳ เฟส 8: ทดสอบและ Deploy

| ลำดับ | งาน | สถานะ |
|-------|-----|--------|
| 8.1 | Deploy Firebase Functions | ⏳ รอ |
| 8.2 | Reload Extension | ⏳ รอ |
| 8.3 | ทดสอบ Flow: Text → Video → YouTube | ⏳ รอ |
| 8.4 | ทดสอบ Retry Logic | ⏳ รอ |
| 8.5 | ทดสอบ Multi-Platform Upload | ⏳ รอ |

---

## 4. รายละเอียดแต่ละเฟส

### เฟส 5: Block System Structure

#### 5.1 Firestore Collection: `global_recipe_blocks`

```javascript
{
  "ADD_SCENE_TEXT": {
    name: "เพิ่ม Scene (Text Prompt)",
    type: "LOOP",
    category: "scene",
    icon: "📝",
    description: "เพิ่ม Scene ใหม่โดยใช้ Text Prompt",
    variables: ["prompt", "sceneIndex"],
    startUrl: "https://vids.google.com",
    steps: [
      { action: "click", selector: "button.add-scene" },
      { action: "click", selector: "textarea.prompt" },
      { action: "type", value: "{{prompt}}" },
      { action: "click", selector: "button.generate" },
      { action: "wait_for_disappear", selector: ".loading", timeout: 300000 }
    ],
    createdAt: "2026-01-20T12:00:00Z",
    updatedAt: "2026-01-20T12:00:00Z"
  }
}
```

#### 5.2 Firestore Collection: `recipe_templates`

```javascript
{
  "FLOW_TEXT_VIDEO_YOUTUBE": {
    name: "Text → Video → YouTube",
    description: "สร้างวิดีโอจาก Text Prompt แล้วอัปโหลด YouTube",
    blocks: [
      "ADD_SCENE_TEXT",
      "EXPORT_VIDEO", 
      "DOWNLOAD_FILE",
      "UPLOAD_YOUTUBE"
    ],
    isDefault: true,
    createdBy: "admin",
    createdAt: "2026-01-20T12:00:00Z"
  }
}
```

---

### เฟส 6: Extension UI Design

#### Block Builder Interface

```
┌───────────────────────────────────────────────────────────────────┐
│  🧱 Recipe Block Builder                              [Admin Only] │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📚 Block Library              │  🔗 Current Sequence             │
│  ───────────────────────       │  ─────────────────────────────   │
│  ┌───────────────────────┐     │                                  │
│  │ 📝 ADD_SCENE_TEXT     │ [+] │  ┌─────────────────────────────┐ │
│  │ 🖼️ ADD_SCENE_IMAGE    │ [+] │  │ 1. 📝 ADD_SCENE_TEXT  🔁    │ │
│  │ 📦 EXPORT_VIDEO       │ [+] │  │ 2. 📦 EXPORT_VIDEO    ⏺     │ │
│  │ 💾 DOWNLOAD_FILE      │ [+] │  │ 3. 💾 DOWNLOAD_FILE   ⏺     │ │
│  │ 📺 UPLOAD_YOUTUBE     │ [+] │  │ 4. 📺 UPLOAD_YOUTUBE  ⏺     │ │
│  │ 📘 UPLOAD_FACEBOOK    │ [+] │  └─────────────────────────────┘ │
│  │ 🎵 UPLOAD_TIKTOK      │ [+] │                                  │
│  │ 📷 UPLOAD_INSTAGRAM   │ [+] │  [🗑️ ลบ] [⬆️ ขึ้น] [⬇️ ลง]       │
│  └───────────────────────┘     │                                  │
│                                │  ─────────────────────────────   │
│  ── Record New Block ──        │  Template Name:                  │
│  Block Name: [_____________]   │  [FLOW_TEXT_VIDEO_YOUTUBE    ]   │
│  Type: [🔁 LOOP ▼]             │                                  │
│  [🔴 Start Recording]          │  [💾 Save Template]              │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

#### Variable Markers (ตอน Recording)

```
┌───────────────────────────────────────────────────────────────────┐
│  🔴 RECORDING: ADD_SCENE_TEXT                                     │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ── Variable Markers (คลิกเพื่อใส่อัตโนมัติ) ──                    │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐         │
│  │{{prompt}}│ │{{title}} │ │{{tags}}    │ │{{sceneIndex}}│        │
│  └──────────┘ └──────────┘ └────────────┘ └────────────┘         │
│                                                                   │
│  ── Platform-Specific ──                                          │
│  ┌────────────────┐ ┌────────────────┐                           │
│  │{{title_youtube}}│ │{{tags_youtube}}│                           │
│  └────────────────┘ └────────────────┘                           │
│  ┌─────────────────┐ ┌─────────────────┐                         │
│  │{{title_facebook}}│ │{{tags_facebook}}│                         │
│  └─────────────────┘ └─────────────────┘                         │
│                                                                   │
│  ── Recorded Steps: 3 ──                                          │
│  1. click → button.add-scene                                      │
│  2. click → textarea.prompt                                       │
│  3. type → "{{prompt}}"                                           │
│                                                                   │
│  [⏹ Stop Recording]                                               │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. โครงสร้าง Firestore

### Collections ที่ใช้

| Collection | คำอธิบาย | สถานะ |
|------------|----------|--------|
| `global_recipe_blocks` | เก็บ Block แต่ละตัว | ⏳ รอสร้าง |
| `recipe_templates` | เก็บ Flow ที่ต่อ Block แล้ว | ⏳ รอสร้าง |
| `agent_jobs` | Job ที่สร้างจาก Schedule | ✅ มีอยู่แล้ว |
| `users/{uid}/projects/{pid}/slots` | Posting Schedule | ✅ มีอยู่แล้ว |

### agent_jobs Document Structure (อัปเดต)

```javascript
{
  id: "job_xxx",
  projectId: "project_xxx",
  userId: "user_xxx",
  
  // === Block Sequence (ใหม่) ===
  blockSequence: ["ADD_SCENE_TEXT", "EXPORT_VIDEO", "DOWNLOAD_FILE", "UPLOAD_YOUTUBE"],
  currentBlockIndex: 0,
  
  // === Data ===
  prompts: ["Scene 1...", "Scene 2...", "Scene 3..."],
  scenes: [{...}, {...}, {...}],
  titles: { youtube: "...", facebook: "...", tiktok: "...", instagram: "..." },
  tags: { youtube: [...], facebook: [...], tiktok: [...], instagram: [...] },
  platforms: [{ platformId: "youtube", accountId: "..." }],
  
  // === Status ===
  status: "PENDING", // PENDING, RUNNING, COMPLETED, FAILED
  errorMessage: null,
  
  // === Timestamps ===
  createdAt: "...",
  scheduledTime: "09:00"
}
```

---

## 6. Variable Markers

### รายการ Variable ทั้งหมด

| Variable | คำอธิบาย | ใช้ใน Block |
|----------|----------|-------------|
| `{{prompt}}` | Prompt ของ Scene ปัจจุบัน | ADD_SCENE_TEXT |
| `{{sceneIndex}}` | หมายเลข Scene (0-based) | ADD_SCENE_TEXT |
| `{{title}}` | Title สำหรับ Platform ปัจจุบัน | UPLOAD_* |
| `{{tags}}` | Tags สำหรับ Platform ปัจจุบัน | UPLOAD_* |
| `{{title_youtube}}` | Title เฉพาะ YouTube | UPLOAD_YOUTUBE |
| `{{title_facebook}}` | Title เฉพาะ Facebook | UPLOAD_FACEBOOK |
| `{{title_tiktok}}` | Title เฉพาะ TikTok | UPLOAD_TIKTOK |
| `{{title_instagram}}` | Title เฉพาะ Instagram | UPLOAD_INSTAGRAM |
| `{{tags_youtube}}` | Tags เฉพาะ YouTube | UPLOAD_YOUTUBE |
| `{{tags_facebook}}` | Tags เฉพาะ Facebook | UPLOAD_FACEBOOK |
| `{{tags_tiktok}}` | Tags เฉพาะ TikTok | UPLOAD_TIKTOK |
| `{{tags_instagram}}` | Tags เฉพาะ Instagram | UPLOAD_INSTAGRAM |
| `{{videoFilePath}}` | Path ไฟล์วิดีโอที่ Download | UPLOAD_* |
| `{{platformId}}` | ID ของ Platform | UPLOAD_* |

---

## 7. Extension UI Design

### หน้าจอหลัก (Tab-based)

```
┌───────────────────────────────────────────────────────────────────┐
│  🤖 Content Auto Post Extension                                   │
├───────────────────────────────────────────────────────────────────┤
│  [📋 Jobs] [🧱 Blocks] [🔗 Templates] [⚙️ Settings]               │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  (เนื้อหาตาม Tab ที่เลือก)                                         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Tab: Jobs (ดู Job ที่กำลังทำงาน)

```
┌───────────────────────────────────────────────────────────────────┐
│  📋 Current Jobs                                                  │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Project: My Video Project                                        │
│  Status: 🟡 RUNNING                                               │
│                                                                   │
│  Progress:                                                        │
│  ├── ✅ ADD_SCENE_TEXT (3/3 scenes)                               │
│  ├── ✅ EXPORT_VIDEO                                              │
│  ├── 🔄 DOWNLOAD_FILE (in progress...)                            │
│  └── ⏳ UPLOAD_YOUTUBE                                            │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Tab: Blocks (จัดการ Block)

```
┌───────────────────────────────────────────────────────────────────┐
│  🧱 Recipe Blocks                                  [+ New Block]  │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📝 ADD_SCENE_TEXT     🔁 LOOP    [Edit] [Delete]                │
│  🖼️ ADD_SCENE_IMAGE    🔁 LOOP    [Edit] [Delete]                │
│  📦 EXPORT_VIDEO       ⏺ ONCE    [Edit] [Delete]                 │
│  💾 DOWNLOAD_FILE      ⏺ ONCE    [Edit] [Delete]                 │
│  📺 UPLOAD_YOUTUBE     ⏺ ONCE    [Edit] [Delete]                 │
│  📘 UPLOAD_FACEBOOK    ⏺ ONCE    [Edit] [Delete]                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Tab: Templates (จัดการ Flow)

```
┌───────────────────────────────────────────────────────────────────┐
│  🔗 Recipe Templates                            [+ New Template]  │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  FLOW_TEXT_VIDEO_YOUTUBE                                          │
│  ├── 📝 ADD_SCENE_TEXT                                            │
│  ├── 📦 EXPORT_VIDEO                                              │
│  ├── 💾 DOWNLOAD_FILE                                             │
│  └── 📺 UPLOAD_YOUTUBE                                            │
│  [Edit] [Duplicate] [Delete]                                      │
│                                                                   │
│  ─────────────────────────────────────────────────────            │
│                                                                   │
│  FLOW_TEXT_VIDEO_MULTI                                            │
│  ├── 📝 ADD_SCENE_TEXT                                            │
│  ├── 📦 EXPORT_VIDEO                                              │
│  ├── 💾 DOWNLOAD_FILE                                             │
│  ├── 📺 UPLOAD_YOUTUBE                                            │
│  ├── 📘 UPLOAD_FACEBOOK                                           │
│  └── 🎵 UPLOAD_TIKTOK                                             │
│  [Edit] [Duplicate] [Delete]                                      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 📊 สรุปความคืบหน้า

| เฟส | คำอธิบาย | สถานะ |
|-----|----------|--------|
| 1 | แก้ไข Backend (scheduleJobs) | ✅ เสร็จ |
| 2 | เพิ่ม Helper Functions | ✅ เสร็จ |
| 3 | แก้ไข checkJobs (Recipe Sequence) | ✅ เสร็จ |
| 4 | แก้ไข player.js (Variable Injection) | ✅ เสร็จ |
| 5 | เปลี่ยนเป็น Block System | ✅ เสร็จ |
| 6 | สร้าง Extension UI | ✅ เสร็จ |
| 7 | Admin Record Blocks | ✅ เสร็จ |
| 8 | ทดสอบและ Deploy | ✅ เสร็จ |

---

## 🚀 ขั้นตอนถัดไป

1. **อนุมัติแผนนี้** - ตรวจสอบและยืนยันความถูกต้อง
2. **เริ่มเฟส 5** - สร้าง Firestore Structure
3. **เริ่มเฟส 6** - สร้าง Extension UI

---

> **หมายเหตุ:** เอกสารนี้จะอัปเดตทุกครั้งที่มีความคืบหน้า
