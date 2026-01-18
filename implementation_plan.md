# Implementation Plan — PromptPay Wallet & Admin Review

## Scope
- PromptPay QR payment request flow
- User wallet credits
- Admin realtime review (approve/reject)
- Marketplace purchase/trial uses wallet

## Firestore Collections
- `payment_requests`
- `payment_logs`
- `users/{uid}/wallet/main`

## Storage Paths
- `users/{uid}/payment_slips/{file}` (admin read)

## UI Changes
1. **Payments Page (User)**
   - QR PromptPay (masked phone)
   - Amount input + slip upload
   - Realtime status list
2. **Admin Panel (Admin Only)**
   - Pending list realtime
   - Approve → credit wallet
   - Reject → log reason
   - Logs panel
3. **Marketplace**
   - Display wallet balance
   - Validate balance before purchase/trial
   - Deduct wallet balance via transaction

## Recent UI Fixes
- Projects page crash (ReferenceError: Key not defined) → เพิ่ม Key icon import ใน `frontend/src/pages/Projects.jsx`

## Backend & Safety Buffers
- **Idempotency**: approve only once per request
- **Race Conditions**: guard with transaction when multiple admins
- **Validation**: amount must be > 0, slip required
- **Audit**: log every decision with admin identity

## Deployment Checklist
- Update Firestore rules (wallet + payment_requests + payment_logs)
- Update Storage rules (admin read slips)
- Create Firestore composite index:
  - `payment_requests` where `userId` + orderBy `createdAt`

*Last Updated: 2026-01-17*
