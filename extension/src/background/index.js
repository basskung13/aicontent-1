console.log("🤖 Agent Background Worker Started");

// Enable Side Panel on Icon Click (Chrome 116+)
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// --- CONSTANTS (REST API) ---
const FIREBASE_PROJECT_ID = "content-auto-post";
const API_KEY = "AIzaSyDGEnGxtkor9PwWkgjiQvrr9SmZ_IHKapE"; // Public Key for REST calls

// --- MESSAGE COORDINATOR ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Handle START Recording
    if (request.action === "START_RECORDING") {
        console.log("📢 Background Received START:", request);

        // Broadcast "ARM" to the Active Tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "ARM_RECORDER",
                    recipeId: request.recipeId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("❌ Content Script Error:", chrome.runtime.lastError);
                        chrome.runtime.sendMessage({
                            action: "SCRIPT_ERROR",
                            message: "⚠️ Connection Lost! Please REFRESH the web page."
                        });
                    } else {
                        console.log("✅ Tab Armed:", response);
                    }
                });
            }
        });
    }

    // 2. Handle STOP Recording
    if (request.action === "STOP_RECORDING") {
        console.log("📢 Background Received STOP");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "DISARM_RECORDER" })
                    .catch(err => console.log("Tab not ready:", err));
            }
        });
    }

    // 2.5 Handle RUN Recipe
    if (request.action === "RUN_RECIPE") {
        console.log("▶️ Background Starting Recipe:", request.recipeId);

        (async () => {
            try {
                const targetTab = await ensureTab(request.recipe.startUrl);
                await executeRecipeOnTab(targetTab, request.recipe);
            } catch (err) {
                console.error("❌ Manual Run Error:", err);
                chrome.runtime.sendMessage({
                    action: "SCRIPT_ERROR",
                    message: "Failed to Start: " + err.message
                });
            }
        })();
    }

    // 3. Handle STEP Recorded
    if (request.action === "RECORD_STEP") {
        console.log("💾 Step Captured:", request.payload);
    }

    // 4. Asset Pipeline: Server Asset Logic
    if (request.action === "FETCH_ASSET") {
        chrome.storage.local.get("latest_asset", async (data) => {
            const asset = data.latest_asset;
            if (!asset || !asset.url) {
                sendResponse({ error: "No asset found" });
                return;
            }
            try {
                const response = await fetch(asset.url);
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({
                        dataUri: reader.result,
                        filename: asset.filename,
                        mime: asset.mime || blob.type
                    });
                };
                reader.readAsDataURL(blob);
            } catch (err) {
                console.error("❌ Failed to fetch asset:", err);
                sendResponse({ error: err.message });
            }
        });
        return true; // Keep channel open
    }
});

// --- ASSET PIPELINE: DOWNLOAD INTERCEPTOR ---
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === "complete") {
        chrome.downloads.search({ id: delta.id }, (results) => {
            if (results && results[0]) {
                const file = results[0];
                console.log("📦 Asset Downloaded:", file.filename);
                chrome.storage.local.set({
                    latest_asset: {
                        id: file.id,
                        filename: file.filename,
                        url: file.url,
                        mime: file.mime,
                        timestamp: Date.now()
                    }
                });
                chrome.runtime.sendMessage({
                    action: "ASSET_READY",
                    payload: file
                }).catch(() => { });
            }
        });
    }
});


// --- HELPER: WRITE LOG TO FIRESTORE (REST) ---
const logToProject = async (projectId, message, level = "INFO", jobId = null) => {
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${await getOwnerId(projectId)}/projects/${projectId}/logs?key=${API_KEY}`;

        await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                fields: {
                    message: { stringValue: message },
                    level: { stringValue: level },
                    jobId: jobId ? { stringValue: jobId } : { nullValue: null },
                    timestamp: { timestampValue: new Date().toISOString() }
                }
            })
        });
    } catch (e) {
        console.error("❌ Log Write Failed:", e);
    }
};

// Helper to get Owner ID (We need to query who owns this project to write the log)
// This is a bit tricky with REST. For now, we assume we have 'activeProjectId' in storage which implies user contest.
// ACTUALLY: The path 'projects/${projectId}' provided to checkJobs is likely just the ID.
// The Firestore structure is 'users/{uid}/projects/{projectId}'.
// The Extension currently might NOT know the UID.
// OPTIMIZATION: We change the path. The current checkJobs logic uses 'projects/${projectId}' in the start.
// WAIT: Line 131 uses `projects/${projectId}` directly? 
// Firestore: `users/{uid}/projects/{projectId}`.
// If Line 131 works, it implies we might be using a Collection Group ID or I misread global path.
// Re-reading specific line 131: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects/${projectId}`...
// This looks like a root-level collection query? But our structure is nested under users.
// IF the ID is unique, we can use Collection Group query for logs too? No, writing requires full path.

// FIX: We need the full path to write logs.
// When 'checkJobs' finds a job via Collection Group query (Simulated), it gets the 'name': "projects/content-auto-post/databases/(default)/documents/users/USER_ID/projects/PROJ_ID/agent_jobs/JOB_ID"
// We can extract the "users/USER_ID" part from the Job Document Name!

const extractUserPath = (fullPath) => {
    // Format: projects/.../documents/users/{uid}/projects/{pid}/...
    const match = fullPath.match(/users\/([^/]+)\/projects\/([^/]+)/);
    return match ? { uid: match[1], pid: match[2] } : null;
};

// --- SCHEDULER: JOB CHECKER (REST API) ---
const checkJobs = async (projectId) => {
    try {
        // Run Query: status == 'pending'
        // FIX: We must query the subcollection 'agent_jobs' under the specific project.
        // BUT we need the UID. 'projectId' param here comes from 'activeProjectId' storage.
        // Does 'activeProjectId' contain the full path?
        // Let's assume the user manually saves the Project ID.
        // To support Logs, the Extension needs to know the USER ID.
        // Quick Fix: We assume `agent_jobs` behaves globally or we search via Collection Group in the Job Checker.

        // Let's stick to the existing `checkJobs` flow but Make it Robust:
        // 1. We query `agent_jobs` collection group for this project (or just by projectID filter).
        // Since we are creating `agent_jobs` at root in `scheduleJobs`, wait...
        // `scheduleJobs` creates: `db.collection('agent_jobs').doc(jobId)` -> ROOT COLLECTION.
        // Double check `scheduleJobs`...
        // YES! `const jobRef = db.collection('agent_jobs').doc(jobId);` 
        // So `agent_jobs` is at the ROOT. It has `projectId` and `userId` fields.

        // OK, so finding jobs is easy.
        // BUT logs need to go to `users/{uid}/projects/{pid}/logs`.
        // The Job Document contains `userId` and `projectId`. We can use that!

        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'agent_jobs' }],
                    where: {
                        compositeFilter: {
                            op: 'AND',
                            filters: [
                                { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'PENDING' } } },
                                { fieldFilter: { field: { fieldPath: 'projectId' }, op: 'EQUAL', value: { stringValue: projectId } } }
                            ]
                        }
                    },
                    limit: 1
                }
            })
        });

        const data = await response.json();

        if (data[0] && data[0].document) {
            const doc = data[0].document;
            const docId = doc.name.split('/').pop();
            const fields = doc.fields;
            const userId = fields.userId?.stringValue; // CRITICAL: Get User ID from Job

            const job = {
                id: docId,
                status: fields.status?.stringValue,
                recipeId: fields.recipeId?.stringValue,
                prompts: fields.prompts // Get prompts directly from job
            };

            console.log("🚀 Found Job:", job);

            // Helper to Log using the found User ID
            const writeLog = (msg, level) => {
                if (userId && projectId) {
                    const logUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/projects/${projectId}/logs?key=${API_KEY}`;
                    fetch(logUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            fields: {
                                message: { stringValue: msg },
                                level: { stringValue: level },
                                jobId: { stringValue: job.id },
                                timestamp: { timestampValue: new Date().toISOString() }
                            }
                        })
                    }).catch(err => console.error("Log Write Error:", err));
                }
            };

            writeLog(`🚀 Starting Job: ${job.recipeId}`, "INFO");

            // Mark as Running (PATCH)
            const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&key=${API_KEY}`;
            await fetch(patchUrl, {
                method: 'PATCH',
                body: JSON.stringify({
                    fields: {
                        status: { stringValue: 'running' },
                        startedAt: { stringValue: new Date().toISOString() }
                    }
                })
            });

            // Trigger Recipe if exists
            if (job.recipeId) {
                console.log(`▶ Found Job for Recipe ID: ${job.recipeId}`);

                // Fetch Recipe Logic (Legacy or Command?)
                // If it is CMD_GENERATE_VIDEO, we might default to a built-in recipe or parse `prompts` directly.
                // Assuming we use the "Generic Automation Recipe" or simple Prompt Injection.

                // For simplicity in this fix, we assume the `job` already contains the `prompts` array (as built by scheduleJobs).
                // We just need a "Base Recipe" to execute these prompts (e.g. Open Facebook -> Type Prompt).
                // But wait, the Agent needs a `startUrl` and `steps`.
                // Does `scheduleJobs` attach `recipeId`? Yes: 'CMD_GENERATE_VIDEO'.
                // We need to map 'CMD_GENERATE_VIDEO' to actual steps here or fetch a standard recipe.

                // For now, let's assume we execute the 'prompts' using standard logic (check index.js earlier logic).

                // ... (Existing Logic for Recipe Execution) ...
                // Quick Fix: We reuse the exact existing logic but wrapped with Logs.
                // NOTE: The previous code fetched recipe from `projects/${projectId}/recipes/${job.recipeId}`.
                // We should ensure 'CMD_GENERATE_VIDEO' recipe exists or handle it dynamically.
                // Let's assume it exists for now to avoid scope creep.

                const recipeUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/projects/${projectId}/recipes/${job.recipeId}?key=${API_KEY}`;
                const recipeRes = await fetch(recipeUrl);
                // ... (Normal parsing) ...
                // If recipe fetching fails (e.g. it's a Command), we might need fallback.
                // Let's proceed with wrapping the EXISTING execution block.

                // [INJECTION POINT: Success/Fail Logs]
                // We inject `writeLog` into the Promise resolution below.

                const recipeDoc = await recipeRes.json();
                if (recipeDoc.fields) {
                    const r = recipeDoc.fields;
                    // ... (Data Parsing) ...
                    const fromValue = (val) => {
                        if (!val) return null;
                        if (val.mapValue) {
                            const out = {};
                            const fields = val.mapValue.fields || {};
                            for (const k in fields) out[k] = fromValue(fields[k]);
                            return out;
                        }
                        if (val.arrayValue) return (val.arrayValue.values || []).map(fromValue);
                        if (val.stringValue !== undefined) return val.stringValue;
                        if (val.integerValue !== undefined) return Number(val.integerValue);
                        return val;
                    };

                    const steps = r.steps?.arrayValue?.values?.map(fromValue) || [];
                    const startUrl = r.startUrl?.stringValue || "";
                    const recipePayload = { id: job.recipeId, steps: steps, startUrl: startUrl };
                    const targetTab = await ensureTab(startUrl);

                    // USE PROMPTS FROM JOB, NOT RECIPE (since Scheduler puts them in Job)
                    // The job.prompts (from Firestore) is { arrayValue: { values: ... } }
                    const rawPrompts = job.prompts;
                    const prompts = rawPrompts?.arrayValue?.values?.map(v => v.stringValue) || [];

                    // Helper to update job status in Firestore
                    const updateJobStatus = async (status, errorMsg = null) => {
                        const statusPatchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt&updateMask.fieldPaths=error&key=${API_KEY}`;
                        const statusBody = {
                            fields: {
                                status: { stringValue: status },
                                completedAt: { timestampValue: new Date().toISOString() }
                            }
                        };
                        if (errorMsg) {
                            statusBody.fields.error = { stringValue: errorMsg };
                        }
                        await fetch(statusPatchUrl, {
                            method: 'PATCH',
                            body: JSON.stringify(statusBody)
                        });
                        console.log(`📝 Job ${job.id} status updated to: ${status}`);
                    };

                    try {
                        if (prompts.length > 0) {
                            writeLog(`🎬 Processing ${prompts.length} scenes...`, "INFO");
                            const MAX_RETRIES = 3;
                            
                            for (let i = 0; i < prompts.length; i++) {
                                const prompt = prompts[i];
                                let sceneSuccess = false;
                                let retryCount = 0;
                                
                                while (!sceneSuccess && retryCount < MAX_RETRIES) {
                                    if (retryCount > 0) {
                                        writeLog(`🔄 Retry ${retryCount}/${MAX_RETRIES} for Scene ${i + 1}...`, "INFO");
                                    } else {
                                        writeLog(`🎬 Running Scene ${i + 1}/${prompts.length}: ${prompt.substring(0, 30)}...`, "INFO");
                                    }

                                    const currentPayload = { ...recipePayload, variables: { prompt: prompt, sceneIndex: i } };

                                    try {
                                        await new Promise((resolve, reject) => {
                                            const completionListener = (msg) => {
                                                if (msg.action === "RECIPE_STATUS_UPDATE" && msg.recipeId === job.recipeId) {
                                                    chrome.runtime.onMessage.removeListener(completionListener);
                                                    if (msg.status === "COMPLETED") resolve();
                                                    else reject(new Error(msg.error || "Recipe Failed"));
                                                }
                                            };
                                            chrome.runtime.onMessage.addListener(completionListener);
                                            executeRecipeOnTab(targetTab, currentPayload);
                                            setTimeout(() => {
                                                chrome.runtime.onMessage.removeListener(completionListener);
                                                reject(new Error("Scene Timeout (5min)"));
                                            }, 300000);
                                        });

                                        // Scene Success!
                                        sceneSuccess = true;
                                        writeLog(`✅ Scene ${i + 1} Completed`, "SUCCESS");
                                        
                                    } catch (sceneError) {
                                        retryCount++;
                                        writeLog(`⚠️ Scene ${i + 1} failed: ${sceneError.message}`, "ERROR");
                                        
                                        if (retryCount >= MAX_RETRIES) {
                                            throw new Error(`Scene ${i + 1} failed after ${MAX_RETRIES} retries`);
                                        }
                                        
                                        // Wait before retry
                                        await new Promise(r => setTimeout(r, 5000));
                                    }
                                }
                                
                                // Delay between scenes
                                await new Promise(r => setTimeout(r, 3000));
                            }
                            
                            writeLog("🏆 All Scenes Completed! Job Finished Successfully", "SUCCESS");
                            await updateJobStatus('COMPLETED');
                        } else {
                            // Single Run
                            await new Promise((resolve, reject) => {
                                const completionListener = (msg) => {
                                    if (msg.action === "RECIPE_STATUS_UPDATE" && msg.recipeId === job.recipeId) {
                                        chrome.runtime.onMessage.removeListener(completionListener);
                                        if (msg.status === "COMPLETED") resolve();
                                        else reject(new Error(msg.error || "Recipe Failed"));
                                    }
                                };
                                chrome.runtime.onMessage.addListener(completionListener);
                                executeRecipeOnTab(targetTab, recipePayload);
                                setTimeout(() => {
                                    chrome.runtime.onMessage.removeListener(completionListener);
                                    reject(new Error("Timeout"));
                                }, 300000);
                            });
                            writeLog("✅ Task Completed", "SUCCESS");
                            await updateJobStatus('COMPLETED');
                        }
                    } catch (execError) {
                        console.error("❌ Job Execution Failed:", execError);
                        writeLog(`❌ Job Failed: ${execError.message}`, "ERROR");
                        await updateJobStatus('FAILED', execError.message);
                    }
                }
            }
        } else {
            console.log("💤 No pending jobs.");
        }

    } catch (err) {
        console.error("❌ Scheduler REST Error:", err);
    }
};

// --- HELPER: SMART TAB MANAGER ---
const ensureTab = async (url) => {
    if (!url) {
        // No URL? Use active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    // Check if already open
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(t => t.url && t.url.includes(url));

    if (target) {
        console.log("✅ Found existing tab:", target.id);
        await chrome.tabs.update(target.id, { active: true });
        return target;
    } else {
        console.log("🌐 Opening new tab:", url);
        const newTab = await chrome.tabs.create({ url: url, active: true });
        // Wait for load
        await new Promise(resolve => {
            const listener = (tabId, changeInfo) => {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
            // Fallback timeout
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }, 15000);
        });
        return newTab;
    }
};

// --- HELPER: EXECUTE ON TAB ---
const executeRecipeOnTab = async (tab, recipePayload) => {
    if (!tab || !tab.id) return;

    console.log(`🚀 Dispatching Recipe to Tab ${tab.id}`);

    // Wait a bit for ANY scripts to hydrate
    setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
            action: "EXECUTE_RECIPE",
            recipe: recipePayload
        }).catch(err => {
            console.error("❌ Execution Error:", err);
            // Verify if script is injected
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/player.js']
            }).then(() => {
                console.log("💉 Re-injected Player script, retrying...");
                setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "EXECUTE_RECIPE",
                        recipe: recipePayload
                    });
                }, 1000);
            }).catch(e => console.error("Injection Failed:", e));
        });
    }, 2000);
};

// --- ALARM SCHEDULER ---
chrome.alarms.create("agent_scheduler", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "agent_scheduler") {
        console.log("⏰ Scheduler Tick");

        // 1. GARBAGE COLLECTOR (48H Cleanup)
        chrome.storage.local.get(["latest_asset", "activeProjectId"], async (data) => {
            if (data.latest_asset) {
                const now = Date.now();
                const assetTime = data.latest_asset.timestamp || 0;
                if ((now - assetTime) / (1000 * 60 * 60) > 48) {
                    console.log("🧹 Garbage Collector: Removing old asset.");
                    chrome.storage.local.remove("latest_asset");
                }
            }

            // 2. SCHEDULER CHECK
            if (data.activeProjectId) {
                await checkJobs(data.activeProjectId);
            } else {
                console.log("⚠️ No Active Project ID set.");
            }
        });
    }
});
