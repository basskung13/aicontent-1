# ✅ Parallel Video Generation + FFmpeg Stitch - Walkthrough

## Summary

Implemented **Scene Tracking + FFmpeg Integration** to generate scenes separately and stitch locally.

---

## Changes Made

### Extension: `index.js`

| Function | Description |
|----------|-------------|
| `currentJobContext` | State object tracking scenes |
| `initSceneTracking()` | Initialize before LOOP |
| `setCurrentScene()` | Set index for download tracking |
| `getOrderedSceneFiles()` | Get sorted scene files |
| `createAgentJob()` | Create agent_job in Firestore |
| `waitForAgentJob()` | Poll for completion |
| Download Interceptor | Track sceneIndex in array |
| requiresAgent handling | Delegate to Desktop Agent |

---

### Desktop Agent: `main.py`

| Function | Description |
|----------|-------------|
| `CMD_STITCH_VIDEO` | Command handler |
| `stitch_videos()` | FFmpeg concat |

---

## Manual Steps (Phase 7)

### ✅ FFmpeg Installed

- Version: 8.0.1

---

### 📋 Create STITCH_VIDEO Block in Firestore

**Step-by-Step:**

1. ไปที่ [Firebase Console](https://console.firebase.google.com)
2. เลือก Project: **content-auto-post**
3. เมนูซ้าย → **Firestore Database**
4. คลิก Collection: **global_recipe_blocks**
5. คลิก **Add Document** (ปุ่ม + หรือ Add document)
6. **Document ID:** Auto หรือพิมพ์ `STITCH_VIDEO`
7. เพิ่ม Fields ดังนี้:

| Field | Type | Value |
|-------|------|-------|
| `name` | string | `STITCH_VIDEO` |
| `type` | string | `ONCE` |
| `category` | string | `processing` |
| `description` | string | `รวมไฟล์ Scene เป็นวีดีโอเดียวด้วย FFmpeg` |
| `icon` | string | `🎬` |
| `requiresAgent` | boolean | `true` |
| `agentCommand` | string | `CMD_STITCH_VIDEO` |
| `steps` | array | (empty) |
| `createdAt` | string | `2026-01-22` |

8. คลิก **Save**

---

## Test Full Flow

```
blockSequence: ["GENERATE_SCENE", "STITCH_VIDEO", "UPLOAD_YOUTUBE"]
```

```
GENERATE_SCENE (LOOP)  →  STITCH_VIDEO  →  UPLOAD_YOUTUBE
    Extension              Agent            Extension
        ↓                    ↓                  ↓
  scene_01.mp4          FFmpeg concat      Upload final.mp4
  scene_02.mp4           → final.mp4
  scene_03.mp4
```

---

## 📝 Last Updated: 2026-01-22
