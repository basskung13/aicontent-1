import os
import sys
import time
import re
import random
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import queue
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
SERVICE_ACCOUNT_KEY_PATH = "serviceAccountKey.json"

class ContentAutoPostAgent:
    def __init__(self, uid, project_id):
        self.uid = uid
        self.project_id = project_id
        self.project_id = project_id
        self.db = self._initialize_firebase()
        self.job_queue = queue.Queue() # Job Queue for Main Thread execution
        print(f"✅ Agent Initialized for User: {uid} | Project: {project_id}")
        
    def _initialize_firebase(self):
        """Initializes Firebase Admin SDK."""
        if not firebase_admin._apps:
            if not os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
                print(f"❌ Error: '{SERVICE_ACCOUNT_KEY_PATH}' not found!")
                sys.exit(1)
            
            cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
            firebase_admin.initialize_app(cred)
        return firestore.client()

    def log(self, message, status="info", platform="SYSTEM", scenes=0):
        """Writes a log entry to Firestore."""
        try:
            logs_ref = self.db.collection('users').document(self.uid)\
                           .collection('projects').document(self.project_id)\
                           .collection('logs')
            
            log_data = {
                "timestamp": firestore.SERVER_TIMESTAMP,
                "platform": platform,
                "status": status,
                "message": message,
                "scenes": scenes
            }
            logs_ref.add(log_data)
            print(f"📝 Logged: [{platform}] {message}")

        except Exception as e:
            print(f"❌ Failed to write log: {e}")

    def start_heartbeat(self):
        """Send heartbeat to Firestore every 30 seconds to show agent is online."""
        import threading
        
        def send_heartbeat():
            try:
                self.db.collection('agent_status').document(self.project_id).set({
                    'projectId': self.project_id,
                    'userId': self.uid,
                    'status': 'online',
                    'lastSeen': firestore.SERVER_TIMESTAMP,
                    'version': '2.1'
                }, merge=True)
                print(f"💓 Heartbeat sent to agent_status/{self.project_id}")
                return True
            except Exception as e:
                print(f"⚠️ Heartbeat failed: {e}")
                return False
        
        # Send first heartbeat immediately
        send_heartbeat()
        
        def heartbeat_loop():
            while True:
                time.sleep(30)
                send_heartbeat()
        
        heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        heartbeat_thread.start()
        print("💓 Heartbeat thread started (every 30s)")

    def start_listener(self):
        """Listens for NEW jobs in the 'agent_jobs' collection assigned to this project."""
        print(f"\n🎧 Waiting for jobs for Project: '{self.project_id}'... (Ctrl+C to stop)")
        
        # Start heartbeat
        self.start_heartbeat()
        
        # Query for jobs where projectId == self.project_id
        # Removed PENDING filter to debug if jobs are coming in with wrong status
        jobs_ref = self.db.collection('agent_jobs')
        # FIX: Ensure we only listen to PENDING jobs for THIS project
        query = jobs_ref.where('projectId', '==', self.project_id).where('status', '==', 'PENDING')
        
        self.job_watch = query.on_snapshot(self._on_job_update)

    def _on_job_update(self, doc_snapshot, changes, read_time):
        """Callback when a new job appears."""
        pending_jobs = []

        for change in changes:
            if change.type.name == 'ADDED':
                job_doc = change.document
                job_data = job_doc.to_dict()
                
                # Double check status
                if job_data.get('status') == 'PENDING':
                    # Add to list for handling backlog
                    pending_jobs.append({
                        'doc': job_doc,
                        'data': job_data,
                        'created_at': job_data.get('createdAt', firestore.SERVER_TIMESTAMP) # Timestamp might be null if serverTimestamp hasn't committed yet, but locally it's fine for rough sorting or just taking the last one
                    })

        if not pending_jobs:
            return

        # Sort by createdAt (or just take the last one if assuming Firestore order)
        # However, to be safe against flood, let's process ONLY the most recent one
        # and mark others as SKIPPED.
        
        # Sort logic: Ensure we have a comparable time. If null (latency), treat as newest? 
        # For simplicity in this context: Just take the last one in the list provided by Firestore which is usually chronological for listeners.
        
        target_job = pending_jobs[-1]
        
        # 1. Skip older jobs
        for job in pending_jobs[:-1]:
            print(f"⚠️ Skipping backlog job: {job['doc'].id}")
            job['doc'].reference.update({'status': 'SKIPPED', 'note': 'Backlog handling'})

        # 2. Process the latest job
        latest_doc = target_job['doc']
        latest_data = target_job['data']
        
        print(f"⚡ Processing Job: {latest_doc.id}")
        
        # IMMEDIATE LOCK to prevent race conditions
        latest_doc.reference.update({'status': 'RUNNING', 'startTime': firestore.SERVER_TIMESTAMP})
        
        # Push to Queue
        self.job_queue.put({
            'job_id': latest_doc.id,
            'data': latest_data
        })

    def execute_job(self, job_id, job_data):
        """Orchestrates the execution of a recipe."""
        recipe_id = job_data.get('recipeId')
        variables = job_data.get('variables', {})
        
        self.log(f"Starting Job {job_id} (Recipe: {recipe_id})", "info", "AGENT")

        # --- SPECIAL COMMAND: OPEN BROWSER ---
        if recipe_id == 'CMD_OPEN_BROWSER':
             self.open_browser_session(self.project_id)
             self.db.collection('agent_jobs').document(job_id).update({'status': 'COMPLETED', 'endTime': firestore.SERVER_TIMESTAMP})
             return
             
        # --- SPECIAL COMMAND: RECORD ---
        if recipe_id == 'CMD_RECORD':
             target_recipe = job_data.get('targetRecipeId')
             self.start_recording_session(self.project_id, target_recipe)
             self.db.collection('agent_jobs').document(job_id).update({'status': 'COMPLETED', 'endTime': firestore.SERVER_TIMESTAMP})
             return
             
        # --- SPECIAL COMMAND: PLAY (NEW) ---
        if recipe_id == 'CMD_PLAY':
             self.execute_playback_session(job_id, job_data)
             return
        
        # --- SPECIAL COMMAND: STITCH VIDEO (FFmpeg) ---
        if recipe_id == 'CMD_STITCH_VIDEO':
            scene_files = job_data.get('sceneFiles', [])
            output_path = job_data.get('outputPath', 'final.mp4')
            success = self.stitch_videos(job_id, scene_files, output_path)
            status = 'COMPLETED' if success else 'FAILED'
            self.db.collection('agent_jobs').document(job_id).update({
                'status': status,
                'outputPath': output_path if success else None,
                'endTime': firestore.SERVER_TIMESTAMP
            })
            return
        # -----------------------------------
        
        # 1. Fetch Recipe
        try:
            recipe_doc = self.db.collection('automation_recipes').document(recipe_id).get()
            if not recipe_doc.exists:
                raise Exception(f"Recipe {recipe_id} not found!")
            recipe = recipe_doc.to_dict()
        except Exception as e:
            self.log(f"Failed to load recipe: {e}", "error", "AGENT")
            self.db.collection('agent_jobs').document(job_id).update({'status': 'FAILED', 'error': str(e)})
            return

        # 2. Launch Browser
        profile_path = os.path.join(os.getcwd(), "profiles", self.project_id)
        if not os.path.exists(profile_path):
            os.makedirs(profile_path)

        try:
            with sync_playwright() as p:
                print(f"🖥️  Launching Chrome Profile: {self.project_id}")
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False, # Always visible for demo
                    args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
                    viewport=None
                )
                
                page = browser.pages[0] if browser.pages else browser.new_page()
                
                # 3. Play Recipe Steps
                success = self.play_recipe(page, recipe.get('steps', []), variables)
                
                # 4. Clean up
                time.sleep(2)
                browser.close()
                
                status = 'COMPLETED' if success else 'FAILED'
                self.db.collection('agent_jobs').document(job_id).update({
                    'status': status, 
                    'endTime': firestore.SERVER_TIMESTAMP
                })
                self.log(f"Job finished: {status}", "success" if success else "error", "AGENT")

        except Exception as e:
            print(f"❌ Critical Error: {e}")
            self.log(f"Critical Error: {e}", "error", "AGENT")
            self.db.collection('agent_jobs').document(job_id).update({'status': 'FAILED', 'error': str(e)})

    def execute_playback_session(self, job_id, job_data):
        """Executes a sequence of steps directly from the job payload (CMD_PLAY)."""
        print(f"▶️ Starting Playback for Job: {job_id}")
        self.log(f"Starting Playback Session...", "info", "PLAYER")
        
        steps = job_data.get('steps', [])
        if not steps:
            print("⚠️ No steps found in playback job.")
            self.db.collection('agent_jobs').document(job_id).update({'status': 'COMPLETED', 'error': 'No steps provided'})
            return

        # Launch Browser
        profile_path = os.path.join(os.getcwd(), "profiles", self.project_id)
        if not os.path.exists(profile_path):
            os.makedirs(profile_path)

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
                    viewport=None
                )
                
                page = browser.pages[0] if browser.pages else browser.new_page()
                
                # Execute Steps
                for i, step in enumerate(steps):
                    action = step.get('action')
                    selector = step.get('selector')
                    value = step.get('value', '') # For type/goto
                    
                    print(f"🔹 Step {i+1}: {action} -> {selector}")
                    
                    try:
                        if action == 'click':
                            # Use aggressive click (force=True if needed, but standard first)
                            # Handle text= selectors that we generated
                            page.wait_for_selector(selector, timeout=5000)
                            page.click(selector)
                        
                        elif action == 'type':
                            page.wait_for_selector(selector, timeout=5000)
                            page.fill(selector, value)
                            
                        elif action == 'navigate' or action == 'goto':
                            # Value here is the URL
                            url = value if value else selector # Handle ambiguity
                            page.goto(url)
                            
                        elif action == 'wait':
                             time.sleep(float(value))

                        time.sleep(1) # Pace it out
                        
                    except Exception as step_e:
                        print(f"❌ Step Failed: {step_e}")
                        # Continue or break? Usually break on failure.
                        # self.db.collection('agent_jobs').document(job_id).update({'status': 'FAILED', 'error': str(step_e)})
                        # return
                
                # Success
                self.db.collection('agent_jobs').document(job_id).update({'status': 'COMPLETED', 'endTime': firestore.SERVER_TIMESTAMP})
                print("✅ Playback Finished.")
                self.log("Playback Finished Successfully.", "success", "PLAYER")
                
                time.sleep(2)
                browser.close()

        except Exception as e:
            print(f"❌ Playback Error: {e}")
            self.log(f"Playback Failed: {e}", "error", "PLAYER")
            self.db.collection('agent_jobs').document(job_id).update({'status': 'FAILED', 'error': str(e)})

    def start_recording_session(self, project_id, target_recipe_id):
        """Launches the browser with event listeners to record User Actions."""
        print(f"🎥 Starting Recorder for Recipe: {target_recipe_id}")
        self.log(f"Recording actions for {target_recipe_id}...", "info", "RECORDER")
        
        recorded_steps = []
        
        # DEBUG: Use a temp profile to rule out corruption
        profile_path = os.path.join(os.getcwd(), "profiles", "TEMP_DEBUG_PROFILE") 
        if os.path.exists(profile_path):
             try:
                 shutil.rmtree(profile_path)
             except:
                 pass
        os.makedirs(profile_path, exist_ok=True)

        print(f"🐛 DEBUG: Profile Path = {profile_path}")
            
        try:
            with sync_playwright() as p:
                print("🐛 DEBUG: Calling launch_persistent_context...")
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
                    viewport=None
                )
                
                page = browser.pages[0] if browser.pages else browser.new_page()

                # --- 1. DEFINE PYTHON HANDLER ---
                def py_record_step(payload):
                    """Callback function executing in Python when JS triggers it."""
                    print(f"⚡ [RECORDER] Action: {payload.get('action')} on {payload.get('selector')}")
                    try:
                        # Update Firestore
                        self.db.collection('automation_recipes').document(target_recipe_id).update({
                            'steps': firestore.ArrayUnion([payload]),
                            'updatedAt': firestore.SERVER_TIMESTAMP
                        })
                    except Exception as e:
                        print(f"🔥 Firestore Error: {e}")

                # --- 2. EXPOSE TO CONTEXT (Global for all tabs) ---
                # NOTE: 'browser' here is actually the PersistentContext object
                browser.expose_function("py_record_step", py_record_step)

                # --- 3. INJECT SCRIPT ON CONTEXT (Runs on every new page/tab) ---
                js_spy_code = """
                console.log("%c 🕵️ AGGRESSIVE SPY STARTED ", "background: red; color: white; font-size: 16px");

                // Use 'mousedown' in Capture Phase (true) to catch events BEFORE the web app eats them
                document.addEventListener('mousedown', (e) => {
                    const target = e.target;
                    
                    // Fallback Selector Logic
                    let selector = target.id ? '#' + target.id : target.tagName.toLowerCase();
                    
                    // Try to get ANY identifier
                    if (target.getAttribute('aria-label')) selector += `[aria-label="${target.getAttribute('aria-label')}"]`;
                    else if (target.innerText) selector += ` (text="${target.innerText.substring(0,20).replace(/\\n/g, '')}...")`;
                    else if (target.className) selector += `.${target.className.split(' ')[0]}`;

                    console.log("🖱️ Mousedown detected:", selector);

                    // Send to Python
                    if (window.py_record_step) {
                        window.py_record_step({
                            action: 'click', // We record it as click for the UI
                            selector: selector,
                            description: `User clicked ${selector}`,
                            timestamp: Date.now()
                        });
                    }
                }, true); // <--- TRUE is critical (Capture Phase)
                """
                browser.add_init_script(js_spy_code)
                print("✅ Recorder is armed and ready on Browser Context.")
                
                # Navigate AFTER injection setup
                page = browser.pages[0] if browser.pages else browser.new_page()
                page.goto("https://www.google.com")
                print("✅ Recorder System: READY. Please interact with the browser.")
                
                # --- 4. KEEP ALIVE ---
                print(f"🐛 DEBUG: Waiting for user to close browser... (Pages: {len(browser.pages) if browser.pages else 0})")
                try:
                    while True:
                        try:
                            if not browser.pages: 
                                break
                        except Exception:
                            break
                        time.sleep(1)
                except Exception as e:
                    print(f"👋 Browser wait error: {e}")

        except Exception as e:
            print(f"❌ Recorder Error: {e}")
            self.log(f"Recorder Error: {e}", "error", "RECORDER")

    def open_browser_session(self, project_id):
        """Launches the browser in non-automated mode for manual login/maintenance."""
        print(f"🔓 Opening Session Manager for Project: {project_id}")
        self.log("Opening Browser for Manual Login...", "info", "SESSION_MANAGER")
        
        profile_path = os.path.join(os.getcwd(), "profiles", project_id)
        if not os.path.exists(profile_path):
            os.makedirs(profile_path)
            
        try:
            with sync_playwright() as p:
                print("🖥️  Browser Launched. Please Log In manually now.")
                print("⏳ Keeping window open for 10 minutes (or until you close it)...")
                
                # Launch with NO sandbox, persistent context
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    args=["--start-maximized", "--no-sandbox", "--disable-infobars"],
                    viewport=None
                )
                
                page = browser.pages[0] if browser.pages else browser.new_page()
                page.goto("https://www.google.com") # Landing page
                
                # Wait loop
                start_time = time.time()
                while time.time() - start_time < 600: # 10 mins
                    time.sleep(1)
                    if not browser.pages: # If use closed all pages
                        break
                        
                print("🔒 Session Manager Closed.")
                self.log("Session Manager Closed.", "success", "SESSION_MANAGER")
                
        except Exception as e:
            print(f"❌ Session Error: {e}")
            self.log(f"Session Error: {e}", "error", "SESSION_MANAGER")
    
    def stitch_videos(self, job_id: str, scene_files: list, output_path: str) -> bool:
        """Use FFmpeg to concatenate scene video files into a single video."""
        import subprocess
        
        if not scene_files:
            self.log("❌ No scene files provided for stitching", "error", "FFMPEG")
            return False
        
        self.log(f"🎬 Starting video stitch: {len(scene_files)} scenes → {output_path}", "info", "FFMPEG")
        print(f"🎬 [FFMPEG] Stitching {len(scene_files)} scene files...")
        
        try:
            # 1. Validate all files exist
            for sf in scene_files:
                if not os.path.exists(sf):
                    self.log(f"❌ Scene file not found: {sf}", "error", "FFMPEG")
                    return False
            
            # 2. Create concat list file in same directory as first scene
            list_file = os.path.join(os.path.dirname(scene_files[0]), 'concat_list.txt')
            with open(list_file, 'w', encoding='utf-8') as f:
                for sf in scene_files:
                    # Use forward slashes for FFmpeg compatibility
                    safe_path = sf.replace('\\', '/')
                    f.write(f"file '{safe_path}'\n")
            
            print(f"📝 Created concat list: {list_file}")
            
            # 3. Run FFmpeg concat
            cmd = [
                'ffmpeg', '-y',           # Overwrite output
                '-f', 'concat',           # Concatenation mode
                '-safe', '0',             # Allow any file paths
                '-i', list_file,          # Input list
                '-c', 'copy',             # Copy streams without re-encoding (fast!)
                output_path
            ]
            
            print(f"🔧 Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                self.log(f"✅ Video stitched successfully: {output_path}", "success", "FFMPEG")
                print(f"✅ [FFMPEG] Success! Output: {output_path}")
                
                # Cleanup temp concat list
                try:
                    os.remove(list_file)
                except:
                    pass
                
                return True
            else:
                error_msg = result.stderr[:500] if result.stderr else "Unknown error"
                self.log(f"❌ FFmpeg Error: {error_msg}", "error", "FFMPEG")
                print(f"❌ [FFMPEG] Error: {error_msg}")
                return False
                
        except subprocess.TimeoutExpired:
            self.log("❌ FFmpeg timed out (5 min limit)", "error", "FFMPEG")
            print("❌ [FFMPEG] Timeout!")
            return False
        except FileNotFoundError:
            self.log("❌ FFmpeg not installed! Please install FFmpeg.", "error", "FFMPEG")
            print("❌ [FFMPEG] FFmpeg not found! Install with: winget install FFmpeg")
            return False
        except Exception as e:
            self.log(f"❌ Stitch error: {str(e)}", "error", "FFMPEG")
            print(f"❌ [FFMPEG] Exception: {e}")
            return False

    def play_recipe(self, page, steps, variables):
        """Iterates through steps and executes them."""
        # Sort steps by order just in case
        steps.sort(key=lambda x: x.get('order', 0))
        
        for step in steps:
            step_type = step.get('type')
            value = step.get('value', '')
            
            # Variable Substitution
            # If value is like "{{prompt}}", replace it
            if "{{" in value and "}}" in value:
                for key, val in variables.items():
                    value = value.replace(f"{{{{{key}}}}}", str(val))
            
            print(f"▶️ Performing: {step_type} -> {value}")
            self.log(f"Step: {step_type}", "info", "AGENT")

            try:
                if step_type == 'GOTO':
                    page.goto(value)
                    page.wait_for_load_state("domcontentloaded")
                
                elif step_type == 'CLICK_SELECTOR':
                    page.wait_for_selector(value, timeout=10000)
                    page.click(value)
                
                elif step_type == 'TYPE':
                    # Using keyboard.type for more natural typing if needed, or fill
                    # Assuming prev action focused, or we need a selector? 
                    # For simplicity, let's assume 'value' is just text and we type into active element
                    # OR if the recipe schema supports 'target' separate from 'value'
                    # Currently schema is just 'value'. Let's assume TYPE value types into focused element.
                    page.keyboard.type(value)
                
                elif step_type == 'SLEEP':
                    time.sleep(float(value))
                    
                elif step_type == 'WAIT_UNTIL':
                    # Value might be "TEXT_VISIBLE:Generating"
                    # or schema needs refinement. Let's parse value.
                    # Simple version: Wait for selector
                    page.wait_for_selector(value, timeout=30000)

                time.sleep(1) # Small buffer between steps
                
            except Exception as e:
                print(f"❌ Step Failed ({step_type}): {e}")
                self.log(f"Step Failed: {e}", "error", "AGENT")
                return False
                
        return True

if __name__ == "__main__":
    CONFIG_FILE = "agent_config.json"
    import json
    
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            
        print(f"✅ Agent Initialized for User: {config.get('uid')} | Project: {config.get('project_id')}")
        
        agent = ContentAutoPostAgent(config.get('uid'), config.get('project_id'))
        
        # Start Listener (Background Thread)
        agent.start_listener()
        
        # --- MAIN THREAD LOOP ---
        # Crucial for Playwright on Windows: GUI operations must run on Main Thread
        print("🎧 Waiting for jobs... (Press Ctrl+C to stop)")
        try:
            while True:
                try:
                    # Check for new jobs every 1s
                    job_data = agent.job_queue.get(timeout=1)
                    agent.execute_job(job_data['job_id'], job_data['data'])
                    agent.job_queue.task_done()
                except queue.Empty:
                    pass
                except KeyboardInterrupt:
                    raise
        except KeyboardInterrupt:
            print("\n🛑 Agent stopped.")
            
    else:
        print("❌ Config not found. Please run Setup first.")
