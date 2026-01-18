# Task.md — Content Auto Post

> เอกสารติดตามงานหลัก (อัปเดตตามระบบ PromptPay + Wallet)

---

## ✅ ระบบชำระเงิน PromptPay (Marketplace Wallet)
- [x] หน้า Payments (QR PromptPay + แจ้งชำระเงิน + แนบสลิป)
- [x] Firestore Collections: `payment_requests`, `payment_logs`, `users/{uid}/wallet`
- [x] Admin ตรวจสอบแบบ Real-time (Approve/Reject)
- [x] เติมเครดิตทันทีเมื่ออนุมัติ
- [x] Marketplace ใช้เครดิตในการซื้อ/ทดลอง
- [x] ซ่อนเมนู Admin สำหรับผู้ใช้ทั่วไป
- [x] ปรับ Firestore/Storage Rules สำหรับ wallet + slips
- [x] ตัดเมนู Admin ที่ไม่ใช้ (System Logs / Managers)

## ✅ UI Fixes (Recent)
- [x] Projects page crash (ReferenceError: Key not defined) → เพิ่ม Key icon import ใน `Projects.jsx`
- [x] Timezone dropdown: กระจกขุ่นสีเข้ม + เปิดได้แน่นอน + แสดงเหนือทุกบล็อก (portal + z-index)
- [x] Global dropdown menus: แก้เฉพาะ panel แสดงผลให้เป็นกระจกขุ่นเข้ม (GlassDropdown) ครอบคลุม Projects/ModeCreator/Marketplace/Payments/Dashboard/Admin/Characters/ProjectHistory/AutomationBuilder
- [x] ลดความสูงรายการใน dropdown menu (padding/line-height) ให้ชิดกันมากขึ้น
- [x] ย้ายปุ่ม + เพิ่มหมวดจากด้านข้าง dropdown ไปอยู่ในเมนู dropdown (Characters page)
- [x] เพิ่มพื้นที่หน้าสร้างตัวละครให้สูงขึ้น (mb-48) เพื่อให้ dropdown ล่างแสดงครบ
- [x] แก้ปุ่ม + ใน GlassDropdown ให้แสดงเต็ม (fixed width/height)
- [x] Tags: เพิ่มช่องกรอก + ปุ่ม + เพิ่ม tag ใหม่ได้ และลบได้ทุกรายการ
- [x] ปรับธีมปุ่มยกเลิก/สร้างตัวละครให้เข้าธีมแดง-ส้มของโปรเจค

## ⚠️ งานที่ควรทำต่อ (แนะนำ)
- [ ] สร้าง Firestore Index สำหรับ `payment_requests` (where userId + orderBy createdAt)
- [ ] ตั้งค่า role=admin ใน user document ที่ต้องใช้แผง Admin
- [ ] เพิ่ม safety guard ป้องกันอนุมัติซ้ำ (ถ้าต้องรองรับหลายแอดมิน)

---

*Last Updated: 2026-01-19*
