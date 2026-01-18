from playwright.sync_api import sync_playwright
import time
import os
import shutil

# Create a temporary unique profile path to avoid locks
TEST_PROFILE = os.path.join(os.getcwd(), "test_profile_temp")
if os.path.exists(TEST_PROFILE):
    try:
        shutil.rmtree(TEST_PROFILE)
    except:
        print("⚠️ Could not clean old test profile. Using it anyway.")

print(f"--- STARTING TEST (Profile: {TEST_PROFILE}) ---")
try:
    with sync_playwright() as p:
        print("1. Playwright initialized")
        print("2. Launching Browser (Headless=FALSE)...")
        # Try launching without persistent context first (Simpler)
        # browser = p.chromium.launch(headless=False)
        
        # BUT we need to test Persistent Context as that's what main.py uses
        context = p.chromium.launch_persistent_context(
            user_data_dir=TEST_PROFILE,
            headless=False, # MUST BE FALSE TO SEE IT
            args=["--start-maximized"] # Ensure it's big
        )
        print("3. Browser Launched!")
        
        page = context.pages[0] if context.pages else context.new_page()
        print("4. Page Created. Going to Google...")
        page.goto("https://www.google.com")
        print("5. SUCCESS! You should see Google.")
        
        print("Waiting 10 seconds asking you to close...")
        time.sleep(10)
        context.close()
        print("6. Browser Closed properly.")
except Exception as e:
    print(f"❌ ERROR: {e}")
print("--- END TEST ---")
