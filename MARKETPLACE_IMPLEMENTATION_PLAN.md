# 🛒 Marketplace Implementation Plan

## Business Model Summary

| Feature | Description |
|---------|-------------|
| **Multi-buyer** | Expander ขายได้หลายคน (ซ่อน UI คนที่ซื้อแล้ว) |
| **Resell** | User นำมาขายต่อได้ กำหนดราคา/เงื่อนไขใหม่ |
| **Platform Fee** | หัก **10%** ของทุกการขาย |
| **Trial System** | ผู้ขายกำหนดวันทดลอง + ค่าทดลองได้ |
| **Trial Limit** | User ทดลอง Expander นั้นได้ 1 ครั้งตลอดชีพ |
| **Wallet Top-up** | PromptPay QR + แจ้งชำระเงิน + Admin ตรวจสอบ |

---

## 📦 Firebase Collections Schema

### 1. marketplace/{expanderId}
```javascript
{
  // Ownership
  originalCreatorId: string,     // เจ้าของต้นฉบับ (ไม่เปลี่ยน)
  sellerId: string,              // คนขายปัจจุบัน
  sellerName: string,            // ชื่อผู้ขาย
  
  // Pricing
  price: number,                 // ราคาขาย (Token)
  trialDays: number,             // 0 = ไม่มี Trial, 1-30 = วันทดลอง
  trialFee: number,              // 0 = ทดลองฟรี, 1+ = เก็บค่าทดลอง
  
  // Metadata
  category: string,              // "Cinematic/Movie", "Social/Short"
  downloadCount: number,         // จำนวนคนซื้อ
  rating: number,                // คะแนนเฉลี่ย
  createdAt: timestamp,
  updatedAt: timestamp,
  
  // Expander Data
  name: string,
  description: string,
  thumbnail: string,
  blocks: array,
  template: string,
  // ...other expander fields
}
```

### 2. users/{uid}/purchasedExpanders/{expanderId}
```javascript
{
  purchasedAt: timestamp,
  price: number,                 // ราคาที่ซื้อ
  fromSellerId: string,          // ซื้อจากใคร
  originalCreatorId: string,     // เจ้าของต้นฉบับ
  
  // Expander Data (copy)
  name: string,
  description: string,
  thumbnail: string,
  blocks: array,
  template: string,
  category: string,
  // ...
}
```

### 3. users/{uid}/trialHistory/{expanderId}
```javascript
{
  startedAt: timestamp,
  expiresAt: timestamp,          // startedAt + trialDays
  feePaid: number,               // ค่าทดลองที่จ่าย
  status: "active" | "expired",
  sellerId: string,              // ทดลองจากผู้ขายคนไหน
  
  // Expander Data (copy for trial period)
  name: string,
  blocks: array,
  template: string,
  // ...
}
```

### 4. transactions/{transactionId}
```javascript
{
  type: "purchase" | "trial" | "resell",
  buyerId: string,
  buyerName: string,
  sellerId: string,
  sellerName: string,
  expanderId: string,
  expanderName: string,
  
  // Financials
  amount: number,                // ราคาเต็ม
  platformFee: number,           // amount * 0.10
  sellerReceived: number,        // amount * 0.90
  
  createdAt: timestamp,
}
```

### 5. users/{uid} (เพิ่ม fields)
```javascript
{
  // existing fields...
  tokenBalance: number,          // จำนวน Token ที่มี (legacy)
  totalEarnings: number,         // รายได้รวมจากการขาย
  totalSpent: number,            // ใช้จ่ายรวม
}
```

### 6. users/{uid}/wallet/main
```javascript
{
  balance: number,               // เครดิตคงเหลือ
  updatedAt: timestamp
}
```

### 7. payment_requests/{requestId}
```javascript
{
  userId: string,
  userEmail: string,
  amount: number,
  slipUrl: string,
  status: "pending" | "approved" | "rejected",
  createdAt: timestamp,
  reviewedAt: timestamp
}
```

### 8. payment_logs/{logId}
```javascript
{
  requestId: string,
  userId: string,
  userEmail: string,
  amount: number,
  status: "approved" | "rejected",
  reviewedById: string,
  reviewedByEmail: string,
  createdAt: timestamp
}
```

---

## 🎨 UI Components

### Marketplace Card States

| State | ปุ่มทดลอง | ปุ่มซื้อ |
|-------|----------|---------|
| **Available** | `🎁 ทดลอง X วัน` (หรือ `ทดลอง X TOKEN`) | `🛒 ซื้อ · XX TOKEN` |
| **No Trial** | ไม่แสดง | `🛒 ซื้อ · XX TOKEN` |
| **Trialing** | `⏳ เหลือ X วัน` (disabled) | `🛒 ซื้อ · XX TOKEN` |
| **Trial Expired** | `❌ หมดสิทธิ์ทดลอง` (disabled) | `🛒 ซื้อ · XX TOKEN` |
| **Owned** | แสดง + badge "เคยซื้อแล้ว" | ยังซื้อซ้ำได้ |
| **Own Listing** | ซ่อน Card ทั้งหมด | ซ่อน Card ทั้งหมด |

### Sell Modal Fields (ExpanderCreator)
```
┌─────────────────────────────────────────┐
│  💰 ตั้งราคาขาย                          │
├─────────────────────────────────────────┤
│  ราคา (Token): [____10____]             │
│                                         │
│  ☑️ อนุญาตให้ทดลองใช้งาน                 │
│     จำนวนวัน: [____3____]               │
│     ค่าทดลอง: [____0____] Token         │
│                                         │
│  📝 หมายเหตุ: Platform หัก 10%          │
│     คุณจะได้รับ: 9 Token                │
│                                         │
│  [ยกเลิก]  [✓ เผยแพร่ขาย]               │
└─────────────────────────────────────────┘
```

---

## 📋 Implementation Phases

### Phase 1: Database & Sell Modal ✅
- [ ] เพิ่ม fields ใน Sell Modal (trialDays, trialFee)
- [ ] อัปเดต publishToMarketplace() function
- [ ] แสดง Platform Fee 10% preview

### Phase 2: Marketplace UI
- [ ] เพิ่ม Category Filter
- [ ] ดึง purchasedExpanders + trialHistory เพื่อกรอง
- [ ] แสดงปุ่มตามสถานะ (Trial/Buy/Owned)
- [ ] เพิ่ม Trial Modal (แสดงเงื่อนไข)

### Phase 3: Purchase Logic
- [ ] สร้าง purchaseExpander() function
- [ ] หัก Token จาก buyer
- [ ] เพิ่ม Token ให้ seller (หักค่า platform 10%)
- [ ] บันทึก transaction
- [ ] Copy Expander ไป purchasedExpanders
- [ ] ใช้ Wallet Balance จาก PromptPay

### Phase 4: Trial Logic
- [ ] สร้าง startTrial() function
- [ ] บันทึก trialHistory
- [ ] ตรวจสอบ expiry date
- [ ] แสดง Trial Expanders ใน My Expander

### Phase 5: Resell Feature
- [ ] เพิ่มปุ่ม "ขายต่อ" ใน My Expander (Purchased)
- [ ] Resell Modal (กำหนดราคา/เงื่อนไขใหม่)
- [ ] originalCreatorId คงเดิม, sellerId เปลี่ยน

---

## 🔐 Security Rules (Firestore)

```javascript
// marketplace - anyone can read, only seller can write
match /marketplace/{expanderId} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update, delete: if request.auth.uid == resource.data.sellerId;
}

// purchasedExpanders - only owner can read/write
match /users/{uid}/purchasedExpanders/{docId} {
  allow read, write: if request.auth.uid == uid;
}

// trialHistory - only owner can read/write
match /users/{uid}/trialHistory/{docId} {
  allow read, write: if request.auth.uid == uid;
}

// transactions - only involved parties can read
match /transactions/{docId} {
  allow read: if request.auth.uid == resource.data.buyerId 
              || request.auth.uid == resource.data.sellerId;
  allow create: if request.auth != null;
}
```

---

## Status: 🚧 In Progress

**Current Phase:** Phase 1 - Database & Sell Modal
**Last Updated:** 2026-01-16
