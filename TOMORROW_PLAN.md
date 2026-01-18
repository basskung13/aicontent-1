# 📅 แผนงานพรุ่งนี้ (Tomorrow's Plan)

**วันที่:** 17 มกราคม 2026

---

## 📊 สถานะปัจจุบัน (Current Status)

### ✅ เสร็จแล้ว (Completed)
| Component | Status | หมายเหตุ |
|-----------|--------|----------|
| **Landing Page** | ✅ 100% | Hero, Features, Pricing, Testimonials, FAQ, Footer |
| **Login Modal** | ✅ 100% | Google OAuth + Email/Password + Forgot Password |
| **Mode Creator** | ✅ 90% | UI สมบูรณ์, AI ปรับปรุงแล้ว |
| **AI (ModeConsultant)** | ✅ 100% | คุยกับ User ครบถ้วน, ไม่จำกัดจำนวนซีน |
| **Expander Creator** | ✅ 100% | สร้าง/แก้ไข/ทดสอบ Expander + Sell Modal |
| **Content Queue** | ✅ 80% | Generate Episodes, Expand Prompts |
| **Characters** | ✅ 100% | จัดการตัวละคร |
| **Projects** | ✅ 100% | Dashboard, Time Slots, History |
| **Chrome Extension** | ✅ 70% | Recorder, Player, Scheduler ทำงานได้ |
| **Marketplace UI** | ✅ 80% | Grid, Search, Category Filter, Purchase/Trial Logic |

### 🚧 ยังไม่เสร็จ (Incomplete)
| Component | Status | Priority |
|-----------|--------|----------|
| **Marketplace Bug Fix** | ⏳ 0% | 🔥 URGENT - Free Expander error |
| **Wallet/Payment** | ⏳ 0% | 🔥 HIGH |
| **Desktop Agent** | ⏳ 0% | 🟡 MEDIUM |
| **Multi-Scene Engine** | ⏳ 50% | 🟡 MEDIUM |
| **Self-Healing AI** | ⏳ 0% | 🟢 LOW |

---

## 🎯 แผนงานพรุ่งนี้ (Tomorrow's Tasks)

### Priority 0: Bug Fixes 🐛 (URGENT)

**เป้าหมาย:** แก้ไข bugs ที่พบ

#### Task 0.1: Marketplace Free Expander Bug ✅ FIXED
- [x] แก้ไข `handlePurchase()` - ไม่ใส่ `fromSellerId` ถ้าเป็น undefined
- [x] แก้ไข Transaction - ไม่บันทึกถ้าเป็น FREE (price = 0)
- [x] เพิ่ม default values สำหรับ sellerId/sellerName

---

### Priority 1: Marketplace System 🛒

**เป้าหมาย:** ปรับปรุงระบบ Marketplace ให้สมบูรณ์

#### Task 1.1: Database Schema ✅ DONE
- [x] Collections พร้อมใช้:
  - `marketplace_expanders` - รายการขาย ✅
  - `users/{uid}/purchasedExpanders` - ของที่ซื้อ ✅
  - `users/{uid}/trialHistory` - ประวัติทดลอง ✅
  - `transactions` - ประวัติการซื้อขาย ✅

#### Task 1.2: Sell Modal ✅ DONE
- [x] UI สำหรับตั้งราคาขาย (ExpanderCreator)
- [x] `publishToMarketplace()` function
- [x] บันทึกข้อมูลลง `marketplace_expanders`

#### Task 1.3: Marketplace UI ✅ DONE
- [x] Grid layout แสดง Expander cards
- [x] Category filter + Search bar
- [x] แสดงปุ่มตามสถานะ (Available/Trialing/Owned)
- [x] ดึงข้อมูล purchasedExpanders + trialHistory

#### Task 1.4: Purchase Logic ✅ DONE
- [x] `handlePurchase()` - บันทึก purchasedExpanders
- [x] `handleStartTrial()` - บันทึก trialHistory
- [x] Update download count
- [x] Status detection

#### Task 1.5: Remaining Tasks (20%)
- [ ] Copy Expander ไป My Expander หลังซื้อ/ทดลอง
- [ ] แสดง Trial Expanders ใน ExpanderCreator
- [ ] Resell Feature (ปุ่มขายต่อ)

---

### Priority 2: Wallet System 💰

**เป้าหมาย:** ให้ User เติม Token และจัดการ Wallet ได้

#### Task 2.1: Wallet UI
- [ ] สร้างหน้า Wallet:
  - แสดงยอด Token ปัจจุบัน
  - ปุ่มเติม Token
  - ประวัติการทำธุรกรรม (transactions)
  - รายได้จากการขาย (totalEarnings)

#### Task 2.2: Payment Integration (เลือก 1)
- [ ] Option A: Stripe
  - Setup Stripe account
  - สร้าง Cloud Function: `createPaymentIntent`
  - Webhook สำหรับ payment success
- [ ] Option B: PromptPay (ไทย)
  - Generate QR Code
  - Manual verification (Admin approve)

#### Task 2.3: Token Management
- [ ] สร้าง Cloud Function: `addTokens`
  - เพิ่ม Token หลัง payment success
  - บันทึก transaction
- [ ] สร้าง Cloud Function: `deductTokens`
  - หัก Token เมื่อซื้อ/ทดลอง
  - ตรวจสอบยอดคงเหลือ

---

### Priority 3: Testing & Bug Fixes 🐛

#### Task 3.1: Mode Creator Testing
- [ ] ทดสอบ AI ModeConsultant:
  - สร้าง Mode ใหม่ผ่าน AI
  - ตรวจสอบ systemInstruction ถูกบันทึก
  - ทดสอบจำนวนซีนมากกว่า 7
- [ ] ทดสอบ Test Run:
  - วิเคราะห์โครงสร้าง Mode
  - ตรวจสอบ TTS output

#### Task 3.2: Content Queue Testing
- [ ] ทดสอบ Generate Episodes
- [ ] ทดสอบ Expand Prompts
- [ ] ตรวจสอบ [TOPIC] replacement

#### Task 3.3: Chrome Extension Testing
- [ ] ทดสอบ Recorder บันทึก Recipe
- [ ] ทดสอบ Player รัน Recipe
- [ ] ทดสอบ Scheduler รัน Job อัตโนมัติ

---

## 📋 Backlog (งานรอง)

### Desktop Agent (Phase 5)
- [ ] Electron App setup
- [ ] Firebase connection
- [ ] Playwright integration
- [ ] Local file handler

### Multi-Scene Engine (Phase 4)
- [ ] Zero-Skip Observer
- [ ] Step Player improvements
- [ ] End-to-end Producer → Distributor test

### Self-Healing AI (Phase 6)
- [ ] Error detection
- [ ] HTML snapshot capture
- [ ] Gemini/OpenAI integration
- [ ] Auto-repair logic

---

## 🎯 Success Criteria (เป้าหมายสำเร็จ)

### พรุ่งนี้ต้องทำให้เสร็จ:
1. ✅ Marketplace UI แสดง Expander cards ได้
2. ✅ Sell Modal ใน ExpanderCreator ใช้งานได้
3. ✅ Purchase/Trial logic ทำงานได้ (Backend)
4. ✅ Wallet UI แสดงยอด Token ได้

### สัปดาห์หน้า:
1. Payment Integration เสร็จ (Stripe หรือ PromptPay)
2. Marketplace ใช้งานได้เต็มรูปแบบ
3. Desktop Agent เริ่มพัฒนา

---

## 📝 หมายเหตุ

### ข้อควรระวัง:
- **Platform Fee 10%** ต้องหักทุกการขาย
- **Trial Limit** User ทดลองได้ 1 ครั้งต่อ Expander
- **Resell Feature** ต้องเก็บ `originalCreatorId` ไว้

### Dependencies:
- Firebase Functions ต้อง deploy ก่อนทดสอบ
- Firestore Security Rules ต้อง update
- Frontend ต้อง build ก่อน deploy

---

**Updated:** 2026-01-17 02:27 AM
**Next Review:** 2026-01-17 Evening
