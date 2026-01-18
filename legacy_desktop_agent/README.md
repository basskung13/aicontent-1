# Desktop Agent for Content Auto Post

This is the Python-based worker that runs on your local machine, executing tasks and reporting logs back to the Dashboard.

## Setup

1.  **Install Python 3.x**
2.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Get Firebase Credentials:**
    *   Go to [Firebase Console](https://console.firebase.google.com/)
    *   Project Settings > Service accounts
    *   Click "Generate new private key"
    *   Rename the downloaded file to `serviceAccountKey.json` and place it in this folder.
4.  **Configure Target:**
    *   Open `main.py`
    *   Edit `TARGET_UID` (Your User ID from Authentication)
    *   Edit `TARGET_PROJECT_ID` (The ID of the project you want to write logs to)

## Running

```bash
python main.py
```

It post logs to Firestore, which should immediately appear on your Web Dashboard.
