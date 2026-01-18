# User-Based Extension Key System - Walkthrough

---

## ✅ What Was Implemented

### 1. Cloud Function: `generateUserKey` (NEW)

**File:** `functions/index.js`

**Change:** Replaced `generateProjectKey` with `generateUserKey`.

**Logic:**
- Generates a key bound to the **User Account** (`auth.uid`), not a specific project.
- Format: `userId:ADMIN|USER:timestamp:random`
- Stores key hash in `users/{userId}` Firestore document.
- Returns the key to the frontend.

---

### 2. Dashboard Global Key Button

**File:** `Projects.jsx`

**Change:** Moved "🔑 Extension Key" button to the main header (next to "New Project").

**Logic:**
- Calls `generateUserKey`.
- Displays the key in a global Modal.
- Accessible from anywhere in the Dashboard, not just inside a project.

---

### 3. Extension UserPanel (V2.0)

**File:** `UserPanel.jsx`

**Features:**
- **Project Selector:** Dropdown to switch between the user's available projects.
- **Job Queue:** Displays jobs for the currently selected project.
- **Version Indicator:** "v2.0" in footer.
- **Admin Switch:** "🎬 Record" mode button (Visible only for Admins).

---

### 4. Extension Backend Logic

**File:** `App.jsx`
- Decodes `userId:ADMIN...` format.
- Sets `chrome.storage.local` with `activeProjectId` based on user selection in `UserPanel`.

**File:** `background/index.js`
- Reads `activeProjectId` from storage to determine which jobs to poll.

---

## 🧪 How to Use & Test

### 1. Generate User Key

1. Go to **Projects Dashboard** header.
2. Click **🔑 Extension Key**.
3. Copy the key from the popup.

### 2. Connect Extension (User Mode)

1. Open Chrome Extension.
2. Paste the **User Key**.
3. Click **Connect**.
4. Use the **Project Dropdown** to select which project you want to monitor.
5. Verify that the **Job Queue** updates for that project.

### 3. Admin Capabilities

- If logged in with an Admin account (e.g. `fxfarm.dashboard@gmail.com`), you will see a **"🎬 Record"** button.
- Clicking it switches the UI to the **Recording / Automation Builder** mode.

---

## 📁 Files Modified

| File | Change |
|------|--------|
| `functions/index.js` | Created `generateUserKey`, removed `generateProjectKey` |
| `frontend/src/pages/Projects.jsx` | Added Global Key Button & Modal |
| `extension/src/UserPanel.jsx` | Added Project Selector & V2 UI |
| `extension/src/App.jsx` | Updated Key Decoding & Routing |
