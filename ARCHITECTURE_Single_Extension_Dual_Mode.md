# Single Extension - Dual Mode Architecture

---

## 📌 User Requirements (Confirmed)

- **Key:** Never expires, can regenerate (replaces old key)
- **1 Project = 1 Key = 1 Chrome** (no duplicates)
- **Lock:** Never expires (use clear button)
- **Single Extension** with Admin/User modes

---

## 🔄 How Single Extension Works (Dual Mode)

```
┌─────────────────────────────────────────────────────┐
│                   EXTENSION POPUP                   │
├─────────────────────────────────────────────────────┤
│  ┌───────────────┐    ┌───────────────────────────┐ │
│  │ 🔑 Enter Key  │ OR │ 🔐 Admin Login (Google)  │ │
│  └───────┬───────┘    └─────────────┬─────────────┘ │
│          │                          │               │
│          ▼                          ▼               │
│  ┌───────────────┐          ┌───────────────────┐   │
│  │  USER MODE    │          │   ADMIN MODE      │   │
│  │  • View Jobs  │          │   • Record Steps  │   │
│  │  • Status     │          │   • Edit Recipes  │   │
│  │  • NO Record  │          │   • All Projects  │   │
│  └───────────────┘          └───────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Implementation Steps

### Step 1: Add Mode State to Extension

```javascript
// In App.jsx - Check storage on load
const [mode, setMode] = useState(null); // 'admin' | 'user' | null

useEffect(() => {
  chrome.storage.local.get(['authMode', 'projectKey'], (data) => {
    if (data.projectKey) setMode('user');
    else if (/* google auth check */) setMode('admin');
    else setMode(null); // Show login options
  });
}, []);
```

### Step 2: Login Screen with Two Options

```jsx
{mode === null && (
  <div className="login-options">
    <button onClick={handleGoogleLogin}>🔐 Admin Login</button>
    <div>— OR —</div>
    <input placeholder="Paste Project Key" />
    <button onClick={handleKeyLogin}>🔑 Connect</button>
  </div>
)}
```

### Step 3: Conditional UI Based on Mode

```jsx
{mode === 'admin' && <AdminPanel />}  // Full features
{mode === 'user' && <UserPanel />}    // Job status only
```

### Step 4: Hide Recording in User Mode

- **User Mode:** Shows project status, job queue, logs
- **Admin Mode:** Full UI with recording, recipe editor

---

## 📋 Files to Modify

| File | Changes |
|------|---------|
| `extension/src/App.jsx` | Add mode switching, login options |
| `extension/src/components/UserPanel.jsx` | **[NEW]** User-only UI |
| `extension/src/background/index.js` | Decode key, skip recording handlers in user mode |
| `frontend/src/pages/Projects.jsx` | Add "Generate Key" button |
| `functions/index.js` | Add `generateProjectKey` function |

---

## 🔑 Key Generation Flow

```
Dashboard (Projects.jsx)
    │
    ├── [Generate Key] Button
    │        │
    │        ▼
    │   Cloud Function: generateProjectKey
    │        │
    │        ├── Create unique key: base64(projectId:userId:timestamp:random)
    │        ├── Hash and store in projects/{projectId}/extensionKey
    │        └── Return plain key to user (one-time display)
    │
    ▼
User copies key → Pastes in Extension → Extension stores locally
```

---

## 🚀 Next: Start Implementation?

Ready to implement in this order:

1. ☐ Add Key Generation to Dashboard
2. ☐ Add Mode Switching to Extension
3. ☐ Create UserPanel component
4. ☐ Update Background script for User mode
