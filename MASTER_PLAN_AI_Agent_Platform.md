# 🚀 Content Auto Post — Master Plan (AI Agent Platform Edition)

**โปรเจกต์:** Content Auto Post (Pivoted to AI Agent Platform)

**วิสัยทัศน์ใหม่:** "YouTube Automation as a Service" + "Creator Economy"

**เป้าหมาย:** สร้าง Platform ที่ให้ Users (Architects) สร้าง "Logic/Recipe" ในการทำคอนเทนต์ขายได้ และ Users ทั่วไป (Consumers) ซื้อไปใช้รันบนเครื่องตัวเอง

---

## 📋 สรุประบบใหม่ (The Core Pillars)

### 1. The Engine (Web App):
- **Mode Creator (Logic Builder):** เครื่องมือสร้าง "Recipe" แบบ No-Code / Low-Code
- **Hybrid Logic:** ผสมผสาน AI Prompts + Variable Inputs + Fixed Steps
- **Dashboard:** จัดการ Projects, Scheduler, และ Wallet

### 2. The Economy (Marketplace):
- **Storefront:** ตลาดซื้อขาย Modes
- **Currency:** Credits System (PromptPay เติมเงิน -> แลก Credits)
- **Licensing:** Trial 3 วัน (Black box) / Paid Owned (เห็น Source logic บางส่วน หรือ Full access ตามสิทธิ์)

### 3. The Worker (Desktop Agent):
- **Execution Unit:** รัน Logic ที่สร้างจาก Web App บนเครื่อง User
- **Local Resources:** ใช้ File, Chrome Profile, GPU ของ User เอง

---

## 🎯 Roadmap (Revised Phases)

### Phase 0-2: Foundation (Done/In-Progress) ✅
- [x] Firebase Setup & Auth
- [x] Web App Structure (React + Vite)
- [x] Managing Accounts (Platforms) Page
- [x] Project Management (Layout Restructure)
- [x] Time Slot Scheduler (Edit Mode Complete)

---

### Phase 3: The Engine — Mode Creator (Next Priority) 🔥

**เป้าหมาย:** สร้าง UI ให้ User สามารถ "โปรแกรม" Logic การทำงานได้

- **Data Structure:** ออกแบบ JSON Schema สำหรับ Mode (Blocks, Variables, Assets)
- **UI: Mode Builder:**
  - Interface แบบ Stack of Cards หรือ Node-based
  - Cards: "AI Generation", "Image Search", "Video Edit", "Post to YouTube"
- **Variable Injection:**
  - กำหนดตัวแปร input เช่น `{Product_Name}`, `{Mood}`, `{Target_Audience}`
  - User ปลายทางต้องกรอกค่าเหล่านี้ตอนรัน Project
- **Library Management:** Save/Load/Edit Private Modes

---

### Phase 4: The Economy — Marketplace 💰

**เป้าหมาย:** สร้างระบบซื้อขายแลกเปลี่ยน Logic

- **Storefront UI:** แสดง Modes พร้อม Filter/Search
- **Wallet System:**
  - Integration กับ PromptPay (QR + แนบสลิป)
  - ระบบ Credits (Wallet Balance)
  - Admin Review (Approve/Reject + Log)
- **Licensing Logic:**
  - Free Trial: รันได้ แต่แก้ไม่ได้ (Black box)
  - Ownership: ซื้อแล้วได้สิทธิ์ใช้ถาวร + ได้รับ Updates
- **Versioning:** ระบบ Update Mode สำหรับ Creator (v1.0 -> v1.1)

---

### Phase 5: The Worker — Desktop Agent & Execution 🤖

**เป้าหมาย:** เชื่อมต่อ Web App กับ Local Machine

- **Electron App:** รับ Job จาก Firebase
- **Interpreter:** อ่าน JSON Logic จาก Mode แล้วรันตาม Step
- **Browser Automation:** Playwright integration สำหรับการโพสต์
- **Local File Handler:** จัดการไฟล์ video/assets ในเครื่อง

---

### Phase 6: Advanced AI & Expansion 🧠

- **AI Planning:** ช่วย Gen prompts อัตโนมัติใน Mode Creator
- **Multi-language Support:** TH/EN/ZH เต็มรูปแบบ
- **Admin Panel:** Monitoring & Dispute logs

---

## 💳 PromptPay Payment Flow (New)

**User Flow**
1. สแกน QR PromptPay (ซ่อนเบอร์) และโอนเงิน
2. แจ้งชำระเงิน: กรอกจำนวน + แนบสลิป
3. ระบบบันทึก `payment_requests` สถานะ `pending`

**Admin Flow (Realtime)**
1. Admin ตรวจสอบในหน้า Payment Review
2. กด **Approve** → เติมเครดิตทันที
3. กด **Reject** → บันทึกเหตุผล
4. ทุกการตัดสินใจบันทึกลง `payment_logs`

### Backend Implications (Critical)
- **Idempotency:** ห้ามอนุมัติซ้ำ → ต้องตรวจสถานะก่อนอัปเดตเครดิต
- **Race Conditions:** เมื่อมีหลายแอดมิน ต้องใช้ transaction/guard
- **Validation:** ตรวจยอดเงิน/สลิปให้ตรงกับ request
- **Auditability:** ทุก action เก็บ log พร้อมผู้อนุมัติ

---

## ✅ Recent UI Fixes
- Projects page crash (ReferenceError: Key not defined) → เพิ่ม Key icon import ใน `frontend/src/pages/Projects.jsx`

---

### Phase 7: Self-Healing AI (The Doctor) 🩺

- **Status:** Future Plan
- **Concept:** ระบบซ่อมตัวเองอัตโนมัติเมื่อเว็บเปลี่ยน UI
- **Workflow:**
  1. Detect Error (Element not found)
  2. Capture HTML/Screenshot
  3. Analyze with Gemini (find new selector)
  4. Auto-update Recipe & Retry logic

---

## 🛠️ Technical Details for Phase 3 (Mode Creator)

### 1. Mode Structure (JSON Schema Draft)

```json
{
  "modeId": "uuid",
  "name": "Product Review Style A",
  "authorId": "user_123",
  "version": "1.0.0",
  "price": 500,
  "inputs": [
    { "key": "productName", "type": "text", "label": "ชื่อสินค้า" },
    { "key": "usp", "type": "list", "label": "จุดเด่นสินค้า" }
  ],
  "steps": [
    {
      "id": "step_1",
      "type": "ai_script",
      "prompt": "Write a script for {productName} focusing on {usp}...",
      "outputVar": "script_content"
    },
    {
      "id": "step_2",
      "type": "video_gen",
      "source": "stock",
      "keywords": "{usp}",
      "duration": 15
    }
  ]
}
```

### 2. Mode Builder UI Concept

- **Left Panel:** Toolbox (Available Blocks: AI Text, Image Gen, Video Stock, Browser Action)
- **Center Canvas:** Stack of Step Cards (Drag & Drop sorting)
- **Right Panel:** Properties (Config สำหรับ Block ที่เลือก)

---

*Updated: 2026-01-08*
