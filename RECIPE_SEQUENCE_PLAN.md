# 📋 แผนการทำงาน: Recipe Sequence System

> **วันที่สร้าง:** 20 มกราคม 2569  
> **สถานะ:** รอดำเนินการ  
> **เวอร์ชัน:** 1.0

---

## 🎯 เป้าหมาย

สร้างระบบที่ Extension สามารถรัน Recipe หลายตัวตามลำดับ โดยเริ่มจากการสร้างวิดีโอใน Google Vids แล้วตามด้วยการอัปโหลดไปแพลตฟอร์มที่ User เลือกไว้ใน Posting Schedule

---

## 📊 สถานะปัจจุบัน (ก่อนแก้ไข)

### ✅ สิ่งที่มีอยู่แล้ว

| ส่วน | สถานะ | หมายเหตุ |
|------|-------|----------|
| `player.js` | ✅ พร้อม | รองรับ click, type, wait_for_element, wait_for_disappear, variable injection |
| `recorder.js` | ✅ พร้อม | บันทึก click, type และสร้าง selector อัตโนมัติ |
| `checkJobs` | ✅ พร้อม | รัน Recipe ทีละ Scene พร้อม Retry 3 ครั้ง |
| `scheduleJobs` | ✅ พร้อม | สร้าง Job เมื่อถึงเวลาใน Posting Schedule |
| `PostingSchedule` | ✅ พร้อม | บันทึก `platforms` array ลง Firestore |

### ❌ สิ่งที่ยังขาด

| ส่วน | สถานะ | ต้องทำอะไร |
|------|-------|-----------|
| Recipe สำหรับ Google Vids | ❌ ไม่มี | ต้อง Record ใหม่ |
| Recipe สำหรับ YouTube | ❌ ไม่มี | ต้อง Record ใหม่ |
| Recipe สำหรับ Facebook | ❌ ไม่มี | ต้อง Record ใหม่ |
| Recipe สำหรับ TikTok | ❌ ไม่มี | ต้อง Record ใหม่ |
| Recipe สำหรับ Instagram | ❌ ไม่มี | ต้อง Record ใหม่ |
| `recipeSequence` ใน Job | ❌ ไม่มี | ต้องเพิ่มใน `scheduleJobs` |
| Logic รัน Sequence | ❌ ไม่มี | ต้องเพิ่มใน `checkJobs` |

---

## 🗂️ โครงสร้างข้อมูลใหม่

### 1. Recipe Document (Firestore)

**Path:** `/projects/{projectId}/recipes/{recipeId}`

```javascript
{
  "id": "RECIPE_GENERATE_VIDEO",
  "name": "Google Vids - Scene Builder",
  "type": "PRODUCER",           // PRODUCER = สร้างวิดีโอ, DISTRIBUTOR = อัปโหลด
  "startUrl": "https://vids.google.com/...",
  "steps": [
    { "action": "click", "selector": "...", "description": "คลิกปุ่ม Add Scene" },
    { "action": "type", "selector": "...", "value": "{{prompt}}", "description": "ใส่ Prompt" },
    { "action": "wait_for_disappear", "selector": "...", "description": "รอ Loading เสร็จ" }
  ],
  "createdAt": "...",
  "createdBy": "admin"
}
```

### 2. Slot Document (Firestore) - มีอยู่แล้ว

**Path:** `/users/{userId}/projects/{projectId}/slots/{slotId}`

```javascript
{
  "day": "mon",
  "start": "09:00",
  "end": "09:26",
  "scenes": 1,
  "platforms": [
    { "platformId": "facebook", "accountId": "...", "name": "Facebook Account" },
    { "platformId": "youtube", "accountId": "...", "name": "Youtube Account" }
  ],
  "duration": 26
}
```

### 3. Job Document (Firestore) - ต้องเพิ่ม Field ใหม่

**Path:** `/agent_jobs/{jobId}`

```javascript
{
  "projectId": "...",
  "userId": "...",
  "status": "PENDING",
  
  // === ใหม่ ===
  "recipeSequence": [
    "RECIPE_GENERATE_VIDEO",
    "RECIPE_UPLOAD_FACEBOOK",
    "RECIPE_UPLOAD_YOUTUBE"
  ],
  "currentRecipeIndex": 0,       // Recipe ตัวที่กำลังทำอยู่
  "platforms": [                 // Copy จาก Slot
    { "platformId": "facebook", ... },
    { "platformId": "youtube", ... }
  ],
  
  // === เดิม ===
  "prompts": [...],
  "scenes": [...],
  "scheduledTime": "09:00"
}
```

---

## 📝 แผนการทำงาน (Step-by-Step)

### Phase 1: เตรียม Recipe ส่วนกลาง

| ลำดับ | งาน | รายละเอียด | ไฟล์ที่เกี่ยวข้อง |
|-------|-----|-----------|------------------|
| 1.1 | สร้าง Collection ใหม่ | สร้าง `/global_recipes/` สำหรับเก็บ Recipe ส่วนกลางที่ Admin สร้าง | Firestore |
| 1.2 | Record Recipe: Google Vids | Admin ใช้ Extension Record การสร้างวิดีโอใน Google Vids | Extension |
| 1.3 | Record Recipe: YouTube | Admin ใช้ Extension Record การอัปโหลดวิดีโอไป YouTube | Extension |
| 1.4 | Record Recipe: Facebook | Admin ใช้ Extension Record การอัปโหลดวิดีโอไป Facebook | Extension |
| 1.5 | Record Recipe: TikTok | Admin ใช้ Extension Record การอัปโหลดวิดีโอไป TikTok | Extension |
| 1.6 | Record Recipe: Instagram | Admin ใช้ Extension Record การอัปโหลดวิดีโอไป Instagram | Extension |

### Phase 2: แก้ไข Backend (Cloud Functions)

| ลำดับ | งาน | รายละเอียด | ไฟล์ที่เกี่ยวข้อง |
|-------|-----|-----------|------------------|
| 2.1 | เพิ่ม `recipeSequence` | แก้ไข `scheduleJobs` ให้สร้าง `recipeSequence` จาก `slot.platforms` | `functions/index.js` |
| 2.2 | เพิ่ม `platforms` | Copy `slot.platforms` ลงใน Job Document | `functions/index.js` |
| 2.3 | Map Platform → Recipe | สร้าง mapping: `facebook` → `RECIPE_UPLOAD_FACEBOOK` | `functions/index.js` |

### Phase 3: แก้ไข Extension

| ลำดับ | งาน | รายละเอียด | ไฟล์ที่เกี่ยวข้อง |
|-------|-----|-----------|------------------|
| 3.1 | อ่าน `recipeSequence` | แก้ไข `checkJobs` ให้อ่าน `recipeSequence` แทน `recipeId` | `extension/src/background/index.js` |
| 3.2 | Loop รัน Sequence | รัน Recipe ทีละตัวตามลำดับใน `recipeSequence` | `extension/src/background/index.js` |
| 3.3 | ส่งต่อ Variables | ส่ง `videoFilePath` จาก Producer ไปยัง Distributor | `extension/src/background/index.js` |
| 3.4 | Update Status | อัปเดต `currentRecipeIndex` หลังทำแต่ละ Recipe เสร็จ | `extension/src/background/index.js` |

### Phase 4: ทดสอบและ Deploy

| ลำดับ | งาน | รายละเอียด |
|-------|-----|-----------|
| 4.1 | ทดสอบ Google Vids Recipe | Record และรันทดสอบแบบ Manual |
| 4.2 | ทดสอบ YouTube Recipe | Record และรันทดสอบแบบ Manual |
| 4.3 | ทดสอบ Full Sequence | ทดสอบการรัน Sequence ครบวงจร |
| 4.4 | Deploy Functions | `firebase deploy --only functions` |
| 4.5 | Reload Extension | โหลด Extension ใหม่ใน Chrome |

---

## 🔧 รายละเอียดการแก้ไขโค้ด

### 2.1 แก้ไข `scheduleJobs` (functions/index.js)

**ตำแหน่ง:** หลัง Line 1481 (ก่อน `await jobRef.set(...)`)

**เพิ่มโค้ด:**
```javascript
// === BUILD RECIPE SEQUENCE ===
const PLATFORM_TO_RECIPE = {
  'facebook': 'RECIPE_UPLOAD_FACEBOOK',
  'youtube': 'RECIPE_UPLOAD_YOUTUBE',
  'tiktok': 'RECIPE_UPLOAD_TIKTOK',
  'instagram': 'RECIPE_UPLOAD_INSTAGRAM'
};

// เริ่มจาก Recipe สร้างวิดีโอเสมอ
const recipeSequence = ['RECIPE_GENERATE_VIDEO'];

// เพิ่ม Recipe อัปโหลดตามที่ User เลือกไว้
if (slot.platforms && Array.isArray(slot.platforms)) {
  slot.platforms.forEach(p => {
    const uploadRecipe = PLATFORM_TO_RECIPE[p.platformId];
    if (uploadRecipe) {
      recipeSequence.push(uploadRecipe);
    }
  });
}

console.log(`      📋 Recipe Sequence: ${recipeSequence.join(' → ')}`);
```

**แก้ไข `jobRef.set(...)`:**
```javascript
await jobRef.set({
  // ... (fields เดิม) ...
  
  // === ใหม่ ===
  recipeSequence: recipeSequence,
  currentRecipeIndex: 0,
  platforms: slot.platforms || [],
  
  // === ลบ ===
  // recipeId: modeId || 'CMD_OPEN_BROWSER',  // ลบบรรทัดนี้
});
```

### 3.1-3.4 แก้ไข `checkJobs` (extension/src/background/index.js)

**แทนที่ Logic เดิม (Line 266-427) ด้วย:**
```javascript
// === NEW: RECIPE SEQUENCE EXECUTION ===
const recipeSequence = fields.recipeSequence?.arrayValue?.values?.map(v => v.stringValue) || [];
const platforms = fields.platforms?.arrayValue?.values?.map(fromValue) || [];
let currentRecipeIndex = fields.currentRecipeIndex?.integerValue || 0;

if (recipeSequence.length === 0) {
  writeLog("❌ No recipes in sequence", "ERROR");
  await updateJobStatus('FAILED', 'No recipes in sequence');
  return;
}

writeLog(`📋 Starting Sequence: ${recipeSequence.join(' → ')}`, "INFO");

let videoFilePath = null; // เก็บ Path ของไฟล์วิดีโอที่สร้างเสร็จ

for (let i = currentRecipeIndex; i < recipeSequence.length; i++) {
  const currentRecipeId = recipeSequence[i];
  writeLog(`▶️ [${i + 1}/${recipeSequence.length}] Running: ${currentRecipeId}`, "INFO");
  
  // Update current index
  await updateJobField('currentRecipeIndex', i);
  
  // Fetch Recipe from global_recipes
  const recipe = await fetchGlobalRecipe(currentRecipeId);
  if (!recipe) {
    writeLog(`❌ Recipe not found: ${currentRecipeId}`, "ERROR");
    await updateJobStatus('FAILED', `Recipe not found: ${currentRecipeId}`);
    return;
  }
  
  // Prepare Variables
  const variables = {
    prompt: prompts[0] || '',
    videoFilePath: videoFilePath,
    platform: platforms[i - 1] || null  // -1 เพราะ index 0 คือ GENERATE
  };
  
  // Execute Recipe
  const result = await executeRecipeWithRetry(recipe, variables, writeLog);
  
  if (!result.success) {
    writeLog(`❌ Recipe Failed: ${currentRecipeId}`, "ERROR");
    await updateJobStatus('FAILED', result.error);
    return;
  }
  
  // If this was GENERATE, save the video path for upload recipes
  if (currentRecipeId === 'RECIPE_GENERATE_VIDEO') {
    videoFilePath = result.videoFilePath || '/Downloads/latest_video.mp4';
  }
  
  writeLog(`✅ Completed: ${currentRecipeId}`, "SUCCESS");
  
  // Delay between recipes
  await new Promise(r => setTimeout(r, 5000));
}

writeLog("🏆 All Recipes Completed!", "SUCCESS");
await updateJobStatus('COMPLETED');
```

---

## 📁 ไฟล์ที่ต้องสร้าง/แก้ไข

| ไฟล์ | การดำเนินการ | Priority |
|------|-------------|----------|
| `functions/index.js` | แก้ไข `scheduleJobs` | 🔴 สูง |
| `extension/src/background/index.js` | แก้ไข `checkJobs` | 🔴 สูง |
| Firestore: `/global_recipes/` | สร้าง Collection ใหม่ | 🔴 สูง |
| Extension UI (optional) | เพิ่มหน้าจัดการ Global Recipes | 🟡 กลาง |

---

## ⚠️ ข้อควรระวัง

1. **ต้อง Record Recipe ให้ครบก่อน** - ถ้าไม่มี Recipe ระบบจะ Error
2. **Downloads Folder** - ต้องแน่ใจว่าวิดีโอถูก Download ลง Folder ที่ถูกต้อง
3. **Login Status** - User ต้อง Login ทุกแพลตฟอร์มไว้ก่อน
4. **Timeout** - แต่ละ Recipe มี Timeout 5 นาที อาจต้องปรับตามความเหมาะสม

---

## 🚀 ลำดับการดำเนินงาน

```
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1: RECORD RECIPES (Admin ทำ)                          │
│  ├── 1.1 Record: RECIPE_GENERATE_VIDEO                       │
│  ├── 1.2 Record: RECIPE_UPLOAD_YOUTUBE                       │
│  ├── 1.3 Record: RECIPE_UPLOAD_FACEBOOK                      │
│  ├── 1.4 Record: RECIPE_UPLOAD_TIKTOK                        │
│  └── 1.5 Record: RECIPE_UPLOAD_INSTAGRAM                     │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 2: MODIFY BACKEND                                      │
│  ├── 2.1 แก้ไข scheduleJobs เพิ่ม recipeSequence             │
│  └── 2.2 Deploy: firebase deploy --only functions            │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 3: MODIFY EXTENSION                                    │
│  ├── 3.1 แก้ไข checkJobs รองรับ Sequence                     │
│  └── 3.2 Reload Extension ใน Chrome                          │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 4: TESTING                                             │
│  ├── 4.1 Test: Manual Run แต่ละ Recipe                       │
│  ├── 4.2 Test: Full Sequence                                  │
│  └── 4.3 Test: Schedule-based Run                            │
└──────────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist ก่อนเริ่มงาน

- [ ] Admin พร้อมที่จะ Record Recipe บน Google Vids
- [ ] Admin มี Account สำหรับทุกแพลตฟอร์ม (YouTube, Facebook, TikTok, Instagram)
- [ ] Extension ติดตั้งและทำงานได้ปกติ
- [ ] Firebase Functions Deploy ได้ปกติ

---

---

## 🎯 Variable Markers สำหรับการ Record (สำคัญมาก!)

เมื่อ Admin บันทึก Recipe ให้ใช้ **Variable Markers** แทนการพิมพ์ข้อความจริง ระบบจะแทนที่ค่าอัตโนมัติตอนรัน

### 📝 รายการ Variable Markers ที่ใช้ได้

| Variable | คำอธิบาย | ตัวอย่างค่า |
|----------|---------|------------|
| `{{prompt}}` | Prompt สำหรับ Scene ปัจจุบัน | "A cat walking in the garden..." |
| `{{sceneIndex}}` | หมายเลข Scene (0-based) | 0, 1, 2, ... |
| `{{title}}` | Title สำหรับแพลตฟอร์มปัจจุบัน | "Amazing Cat Video" |
| `{{tags}}` | Tags สำหรับแพลตฟอร์มปัจจุบัน (comma separated) | "cat, cute, pets" |
| `{{title_youtube}}` | Title เฉพาะ YouTube | "Amazing Cat Video - Full HD" |
| `{{title_facebook}}` | Title เฉพาะ Facebook | "ดูวิดีโอแมวน่ารัก" |
| `{{title_tiktok}}` | Title เฉพาะ TikTok | "🐱 Cute Cat #viral" |
| `{{title_instagram}}` | Title เฉพาะ Instagram | "Best cat moments 🐈" |
| `{{tags_youtube}}` | Tags เฉพาะ YouTube | "cat, kitten, pets, cute" |
| `{{tags_facebook}}` | Tags เฉพาะ Facebook | "แมว, น่ารัก, สัตว์เลี้ยง" |
| `{{tags_tiktok}}` | Tags เฉพาะ TikTok | "#cat #cute #fyp #viral" |
| `{{tags_instagram}}` | Tags เฉพาะ Instagram | "#cat #catsofinstagram" |
| `{{videoFilePath}}` | Path ไฟล์วิดีโอที่สร้างเสร็จ | "/Downloads/video.mp4" |
| `{{platformId}}` | ID แพลตฟอร์มปัจจุบัน | "youtube", "facebook", etc. |

### 🎬 ตัวอย่างการ Record

#### Recipe: RECIPE_GENERATE_VIDEO (Google Vids)
```
ขั้นตอนที่ต้อง Record:
1. คลิก "Add Scene"
2. คลิกที่กล่อง Prompt → พิมพ์: {{prompt}}
3. คลิก "Generate"
4. รอจน Loading หายไป (wait_for_disappear)
```

#### Recipe: RECIPE_UPLOAD_YOUTUBE
```
ขั้นตอนที่ต้อง Record:
1. คลิก "Upload Video"
2. คลิก Input File → (ระบบจะ Upload อัตโนมัติจาก videoFilePath)
3. คลิกที่กล่อง Title → พิมพ์: {{title_youtube}}
4. คลิกที่กล่อง Description → พิมพ์: {{prompt}}
5. คลิกที่กล่อง Tags → พิมพ์: {{tags_youtube}}
6. คลิก "Publish"
```

#### Recipe: RECIPE_UPLOAD_FACEBOOK
```
ขั้นตอนที่ต้อง Record:
1. คลิก "Create Post"
2. คลิก Input File → (ระบบจะ Upload อัตโนมัติ)
3. คลิกที่กล่อง Caption → พิมพ์: {{title_facebook}}
4. คลิก "Post"
```

### 💡 เทคนิคการ Record

1. **เมื่อถึงกล่อง Prompt:** คลิกที่กล่อง แล้วพิมพ์ `{{prompt}}` ตรงๆ
2. **เมื่อถึงกล่อง Title:** คลิกที่กล่อง แล้วพิมพ์ `{{title_youtube}}` (หรือ platform อื่น)
3. **เมื่อถึงกล่อง Tags:** คลิกที่กล่อง แล้วพิมพ์ `{{tags_youtube}}`
4. **File Input:** ไม่ต้องเลือกไฟล์จริง ระบบจะ Inject อัตโนมัติ

### ⚠️ ข้อควรจำ

- **ใช้ปีกกาคู่ {{ }}** เท่านั้น ห้ามใช้ปีกกาเดี่ยว
- **Case-sensitive:** ต้องพิมพ์ตัวเล็กตัวใหญ่ให้ตรง
- **แพลตฟอร์ม-specific:** ใช้ `{{title_youtube}}` ไม่ใช่ `{{title}}` ถ้าต้องการเฉพาะ YouTube

---

## ✅ สถานะการพัฒนา

| ส่วน | สถานะ | หมายเหตุ |
|------|-------|----------|
| Backend: `scheduleJobs` | ✅ เสร็จ | เพิ่ม recipeSequence, platforms, titles, tags |
| Extension: `fetchGlobalRecipe` | ✅ เสร็จ | ดึง Recipe จาก global_recipes |
| Extension: `checkJobs` | ✅ เสร็จ | รัน Sequence + Variable injection |
| Extension: `player.js` | ✅ เสร็จ | รองรับ arrays, objects ใน variables |
| Firestore: `global_recipes` | ⏳ รอสร้าง | Admin ต้อง Record และบันทึก |

---

## 🚀 ขั้นตอนถัดไป

1. **Deploy Firebase Functions:**
   ```bash
   cd functions && firebase deploy --only functions
   ```

2. **Reload Extension:**
   - ไปที่ `chrome://extensions/`
   - คลิก Reload บน Extension

3. **Admin Record Recipes:**
   - เข้า Google Vids
   - เปิด Extension → กด Record
   - ทำตามขั้นตอน ใช้ `{{prompt}}` แทนข้อความจริง
   - บันทึกเป็น `RECIPE_GENERATE_VIDEO`
   
4. **ทำซ้ำสำหรับ Upload Recipes**
