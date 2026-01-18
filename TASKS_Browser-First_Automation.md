# Tasks: Browser-First Automation (Chrome Extension)

---

## 🔴 Legacy Cleanup (Deprecation)

- [x] **Stop and Archive Python Desktop Agent**
  - [x] Stop `main.py` process
  - [x] Rename `desktop-agent` to `legacy_desktop_agent`

---

## 🚀 Phase 1: Foundation (The Host)

- [x] **Extension Scaffolding (Manifest V3)**
  - [x] Setup React + Vite + CRXJS (or standard build)
  - [x] Configure `manifest.json` (Permissions: activeTab, storage, alarms, downloads, scripting, CSP)
  - [x] Implement `background.js` (Service Worker) structure
  - [x] Implement `popup.tsx` (Project Binding UI)
  - [ ] Debug why scheduled jobs are not appearing in UI
  - [x] Fix `FAILED_PRECONDITION` error (Firestore Index)
  - [x] Fix invalid date parsing (`NaN` error)
  - [ ] Debug data mismatch (Slot time vs Calculator time)
    - [x] Setup Firestore in Extension (Web SDK + Anonymous Auth)

---

## ❇️ Phase 2: Modular Recorder (Core)

- [x] **Recorder UI (Side Panel)** `chrome.sidePanel`
  - [x] Port UI to Side Panel (`manifest.json`, `App.css`)
  - [x] Live Log Console (Visual feedback for user actions)

- [x] **Spy Script (DOM Listener)** `content/recorder.js`
  - [x] Event Listeners (Click, Type)
  - [x] **Smart Selector Generation** (ID -> Aria -> Class -> Path)
  - [x] Message Relay (Sending data to Background/SidePanel)

- [ ] **Recipe Management**
  - [x] Save Recipe to Firestore (`recipes` collection in Project)
  - [x] **Recipe List UI** (Display saved flows)
  - [ ] Test "Producer" Recording (e.g., Flow.ai)
  - [ ] Test "Distributor" Recording (e.g., TikTok)

---

## 📦 Phase 3: Playback Engine (The Runner)

- [x] **Player Content Script** `content/player.js`
  - [x] Registry in `manifest.json`
  - [x] Implement `EXECUTE_RECIPE` listener
  - [x] Implement `Selector Engine` (Find element by selector)
  - [x] Implement `Action Engine` (Click, Type, Delay)

- [x] **Run Trigger**
  - [x] Connect App.jsx 'RUN' Button
  - [x] Background Relay Logic

---

## 📦 Phase 4: Asset Pipeline (The Messenger)

- [x] **Download Interceptor**
  - [x] Listen to `chrome.downloads.onCreated`
  - [x] Cache file Blob/Path in `chrome.storage.local`

- [x] **Upload Injector**
  - [x] Background `FETCH_ASSET` handler
  - [x] Player `uploadFile` logic

- [ ] **Garbage Collector (Auto-Cleanup)**
  - [ ] Auto-delete assets older than 48 hours to save space
  - [ ] Create logic to fetch Blob from storage
  - [ ] Inject Blob into `<input type="file">` on target page

---

## 🧠 Phase 5: Auto-Scheduler (The Boss)

- [x] **Scheduler Engine** (`background.js`)
  - [x] Implement `chrome.alarms` loop (1 min)
  - [x] Query Firestore for PENDING jobs (via REST API)

- [x] **Execution Logic Setup**
  - [x] Hybrid Architecture (Auth SDK + REST Data)
  - [x] Fix Build System & Dependencies
  - [x] **Smart Tab Manager**
    - [x] Capture `startUrl` during Recording
    - [x] Auto-Open/Switch Tab during Execution

- [ ] **Multi-Scene Engine (The Chain)**
  - [x] **Variable Injection:** `player.js` parses `{{prompt}}`
  - [x] **Job Loop:** `background.js` iterates `prompts` array
  - [ ] **Zero-Skip Observer:** DOM Counting & Retry Logic
  - [ ] Step Player (Click/Type/Wait)

- [ ] **End-to-End Test**
  - [ ] Run Producer -> Save File -> Run Distributor -> Upload File

---

## 🔐 Phase 5.5: Extension Dual Mode (Admin/User)

- [x] **Key Generation System**
  - [x] ~~Cloud Function: `generateProjectKey`~~ → `generateUserKey`
  - [x] Dashboard: "Extension Key" button in header (user-level, not project-level)
  - [x] Firestore: Store key hash in `users/{userId}/extensionKey`
  - [x] Key format: `userId:ADMIN|USER:timestamp:random`

- [x] **Extension Mode Switching**
  - [x] Add mode state (`admin` | `user` | `null`)
  - [x] Login screen with key input only (removed Admin button)
  - [x] Conditional UI based on isAdmin flag in key

- [x] **UserPanel Component**
  - [x] Project selector dropdown (fetch user's projects)
  - [x] "Record" button for admins to enter full mode
  - [x] Job queue display for selected project

- [x] **Background Script Update**
  - [x] Decode key to get `userId`, `isAdmin`
  - [x] Query jobs using selected `projectId` from UserPanel (via `activeProjectId` storage)

---

## 🩺 Phase 6: Self-Healing AI (The Doctor)

- [ ] **Error Detection**
  - [ ] Detect failed selector (Timeout)
  - [ ] Capture HTML Snapshot through `chrome.scripting`

- [ ] **AI Integration**
  - [ ] Send Snapshot to Gemini/OpenAI
  - [ ] Receive new selector
  - [ ] Retry action & Update Recipe

---

## 🤖 Phase 7: Future Self-Healing (Advanced)

- [ ] **Automated Repair:** AI analyzes screenshot to find new selectors automatically.
