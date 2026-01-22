console.log("🤖 Agent Background Worker Started");

// Enable Side Panel on Icon Click (Chrome 116+)
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// --- CONSTANTS (REST API) ---
const FIREBASE_PROJECT_ID = "content-auto-post";
const API_KEY = "AIzaSyDGEnGxtkor9PwWkgjiQvrr9SmZ_IHKapE"; // Public Key for REST calls

// --- SCENE TRACKING STATE ---
let currentJobContext = {
    jobId: null,
    totalScenes: 0,
    currentSceneIndex: -1,
    sceneAssets: []   // [{ sceneIndex, filename, timestamp }]
};

// Initialize scene tracking before LOOP block
const initSceneTracking = (jobId, totalScenes) => {
    currentJobContext = {
        jobId,
        totalScenes,
        currentSceneIndex: -1,
        sceneAssets: []
    };
    console.log(`🎬 Scene Tracking Init: ${totalScenes} scenes for Job ${jobId}`);
};

// Set current scene index before each scene processing
const setCurrentScene = (index) => {
    currentJobContext.currentSceneIndex = index;
    console.log(`🎬 Current Scene: ${index + 1}/${currentJobContext.totalScenes}`);
};

// Get ordered scene files for stitching
const getOrderedSceneFiles = () => {
    return currentJobContext.sceneAssets
        .sort((a, b) => a.sceneIndex - b.sceneIndex)
        .map(asset => asset.filename);
};


// --- HELPER: Firestore Value -> JS ---
const fromFirestoreValue = (val) => {
    if (!val) return null;
    if (val.mapValue) {
        const out = {};
        const fields = val.mapValue.fields || {};
        for (const k in fields) out[k] = fromFirestoreValue(fields[k]);
        return out;
    }
    if (val.arrayValue) return (val.arrayValue.values || []).map(fromFirestoreValue);
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.integerValue !== undefined) return Number(val.integerValue);
    if (val.doubleValue !== undefined) return Number(val.doubleValue);
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.timestampValue !== undefined) return val.timestampValue;
    if (val.nullValue !== undefined) return null;
    return val;
};

// --- HELPER: JS -> Firestore Value ---
const toFirestoreValue = (val) => {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'number') {
        return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (typeof val === 'boolean') return { booleanValue: val };
    if (Array.isArray(val)) {
        return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
    if (typeof val === 'object') {
        const fields = {};
        for (const k in val) fields[k] = toFirestoreValue(val[k]);
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
};

// --- HELPER: Create Agent Job ---
const createAgentJob = async (userId, projectId, recipeId, jobData = {}) => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agent_jobs?key=${API_KEY}`;

    const fields = {
        recipeId: { stringValue: recipeId },
        projectId: { stringValue: projectId },
        userId: { stringValue: userId },
        status: { stringValue: 'PENDING' },
        createdAt: { timestampValue: new Date().toISOString() }
    };

    // Add custom job data
    for (const key in jobData) {
        fields[key] = toFirestoreValue(jobData[key]);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });

    const doc = await response.json();
    const agentJobId = doc.name.split('/').pop();
    console.log(`📝 Created Agent Job: ${agentJobId} (${recipeId})`);
    return agentJobId;
};

// --- HELPER: Wait for Agent Job Completion ---
const waitForAgentJob = async (agentJobId, timeout = 600000) => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agent_jobs/${agentJobId}?key=${API_KEY}`;
        const response = await fetch(url);
        const doc = await response.json();

        if (!doc.fields) {
            console.warn(`⚠️ Agent Job document empty: ${agentJobId}`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }

        const status = doc.fields?.status?.stringValue;

        if (status === 'COMPLETED') {
            console.log(`✅ Agent Job Completed: ${agentJobId}`);
            return { success: true, data: doc.fields };
        }

        if (status === 'FAILED') {
            const error = doc.fields?.error?.stringValue || 'Unknown error';
            console.error(`❌ Agent Job Failed: ${error}`);
            return { success: false, error };
        }

        // Still running, poll again
        await new Promise(r => setTimeout(r, 3000));
    }

    console.error(`⏱️ Agent Job Timeout: ${agentJobId}`);
    return { success: false, error: 'Timeout waiting for Agent' };
};

// --- HELPER: Fetch Block from global_recipe_blocks (by name field, not document ID) ---
const fetchBlock = async (blockName) => {
    try {
        // Query by name field since document IDs are auto-generated
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'global_recipe_blocks' }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'name' },
                            op: 'EQUAL',
                            value: { stringValue: blockName }
                        }
                    },
                    limit: 1
                }
            })
        });

        const data = await res.json();
        console.log('📦 Block query result for', blockName, ':', data);

        if (!data[0] || !data[0].document) {
            console.warn(`⚠️ Block not found: ${blockName}`);
            return null;
        }

        const doc = data[0].document;
        const f = doc.fields;
        const docId = doc.name.split('/').pop();

        return {
            id: docId,
            name: f.name?.stringValue || blockName,
            type: f.type?.stringValue || 'ONCE',
            category: f.category?.stringValue || 'general',
            startUrl: f.startUrl?.stringValue || '',
            variables: f.variables?.arrayValue?.values?.map(v => v.stringValue) || [],
            steps: f.steps?.arrayValue?.values?.map(fromFirestoreValue) || []
        };
    } catch (err) {
        console.error(`❌ Failed to fetch block ${blockName}:`, err);
        return null;
    }
};

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

    // 3.5 Handle STOP_TEST - Stop current test
    if (request.action === "STOP_TEST") {
        console.log("⏹ Stop test requested");
        chrome.storage.local.set({ stopTest: true });
    }

    // 4. Handle TEST_BLOCK - Run single block for testing (Auto-open startUrl)
    if (request.action === "TEST_BLOCK") {
        console.log("🧪 Testing Block:", request.blockName);
        (async () => {
            try {
                const block = await fetchBlock(request.blockName);
                if (!block) {
                    console.error("❌ Block not found:", request.blockName);
                    return;
                }
                console.log("📦 Block loaded:", block);

                // Smart Tab: Check existing tabs first, then use startUrl if needed
                let tabId = request.tabId;
                const targetUrl = block.startUrl?.trim();

                console.log("🔍 Block startUrl check:", { startUrl: targetUrl, hasUrl: !!targetUrl });

                if (targetUrl && targetUrl !== 'null') {
                    // Check if any existing tab matches the startUrl
                    const allTabs = await chrome.tabs.query({});
                    const targetOrigin = new URL(targetUrl).origin;
                    const existingTab = allTabs.find(tab => {
                        try {
                            return tab.url && new URL(tab.url).origin === targetOrigin;
                        } catch { return false; }
                    });

                    if (existingTab) {
                        console.log("✅ Found existing tab with same origin:", existingTab.url);
                        tabId = existingTab.id;
                        // Activate the existing tab and navigate to exact startUrl
                        await chrome.tabs.update(tabId, { active: true, url: targetUrl });
                        await chrome.windows.update(existingTab.windowId, { focused: true });

                        // Wait for navigation to complete
                        await new Promise(resolve => {
                            const listener = (updatedTabId, info) => {
                                if (updatedTabId === tabId && info.status === 'complete') {
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                            setTimeout(resolve, 10000);
                        });
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        console.log("🌐 No existing tab found, opening new tab:", targetUrl);
                        const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
                        tabId = newTab.id;

                        // Wait for tab to fully load
                        await new Promise(resolve => {
                            const listener = (updatedTabId, info) => {
                                if (updatedTabId === tabId && info.status === 'complete') {
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                            setTimeout(resolve, 10000);
                        });

                        // Additional wait for page scripts
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    console.log("✅ Tab ready:", tabId);
                }

                if (!tabId) {
                    console.error("❌ No tabId available");
                    return;
                }

                // Execute block steps with highlight
                for (let i = 0; i < block.steps.length; i++) {
                    // Check if test was stopped
                    const stopFlag = await chrome.storage.local.get('stopTest');
                    if (stopFlag.stopTest) {
                        console.log("⏹ Test stopped by user");
                        await chrome.storage.local.remove('stopTest');
                        return;
                    }

                    const step = block.steps[i];
                    const stepDelay = step.delay || 1000;
                    console.log(`▶️ Step ${i + 1}/${block.steps.length} (delay: ${stepDelay}ms):`, step);

                    // Send STEP_STARTED to UI
                    chrome.runtime.sendMessage({
                        action: "RECIPE_STATUS_UPDATE",
                        recipeId: request.blockName,
                        status: "STEP_STARTED",
                        stepIndex: i,
                        totalSteps: block.steps.length,
                        stepAction: step.action,
                        stepSelector: step.selector || ''
                    });

                    // Wait before step using recorded delay (minimum 500ms)
                    if (i > 0) {
                        const waitTime = Math.max(stepDelay, 500);
                        console.log(`⏱️ Waiting ${waitTime}ms...`);
                        await new Promise(r => setTimeout(r, waitTime));
                    }

                    // Send step to content script with highlight
                    await chrome.tabs.sendMessage(tabId, {
                        action: "EXECUTE_STEP_WITH_HIGHLIGHT",
                        step: step,
                        stepIndex: i,
                        totalSteps: block.steps.length
                    });

                    // Send STEP_COMPLETED
                    chrome.runtime.sendMessage({
                        action: "RECIPE_STATUS_UPDATE",
                        recipeId: request.blockName,
                        status: "STEP_COMPLETED",
                        stepIndex: i,
                        totalSteps: block.steps.length
                    });
                }

                // Send COMPLETED
                chrome.runtime.sendMessage({
                    action: "RECIPE_STATUS_UPDATE",
                    recipeId: request.blockName,
                    status: "COMPLETED"
                });
                console.log("✅ Block test completed:", request.blockName);
            } catch (err) {
                console.error("❌ Test Block Error:", err);
            }
        })();
    }

    // 5. Handle TEST_TEMPLATE - Run all blocks in sequence for testing (Auto-open startUrl)
    if (request.action === "TEST_TEMPLATE") {
        console.log("🧪 Testing Template:", request.blocks);
        (async () => {
            try {
                let tabId = request.tabId;

                // Get first block to check for startUrl
                const firstBlock = await fetchBlock(request.blocks[0]);
                const targetUrl = firstBlock?.startUrl?.trim();
                console.log("🔍 First block startUrl check:", { startUrl: targetUrl, hasUrl: !!targetUrl });

                if (targetUrl && targetUrl !== 'null') {
                    // Check if any existing tab matches the startUrl
                    const allTabs = await chrome.tabs.query({});
                    const targetOrigin = new URL(targetUrl).origin;
                    const existingTab = allTabs.find(tab => {
                        try {
                            return tab.url && new URL(tab.url).origin === targetOrigin;
                        } catch { return false; }
                    });

                    if (existingTab) {
                        console.log("✅ Found existing tab with same origin:", existingTab.url);
                        tabId = existingTab.id;
                        // Activate the existing tab and navigate to exact startUrl
                        await chrome.tabs.update(tabId, { active: true, url: targetUrl });
                        await chrome.windows.update(existingTab.windowId, { focused: true });

                        // Wait for navigation to complete
                        await new Promise(resolve => {
                            const listener = (updatedTabId, info) => {
                                if (updatedTabId === tabId && info.status === 'complete') {
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                            setTimeout(resolve, 10000);
                        });
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        console.log("🌐 No existing tab found, opening new tab:", targetUrl);
                        const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
                        tabId = newTab.id;

                        // Wait for tab to fully load
                        await new Promise(resolve => {
                            const listener = (updatedTabId, info) => {
                                if (updatedTabId === tabId && info.status === 'complete') {
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                            setTimeout(resolve, 10000);
                        });
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    console.log("✅ Tab ready:", tabId);
                }

                if (!tabId) {
                    console.error("❌ No tabId available");
                    return;
                }

                for (let blockIndex = 0; blockIndex < request.blocks.length; blockIndex++) {
                    const blockName = request.blocks[blockIndex];
                    console.log(`📦 Block ${blockIndex + 1}/${request.blocks.length}: ${blockName}`);

                    const block = await fetchBlock(blockName);
                    if (!block) {
                        console.warn(`⚠️ Block not found: ${blockName}, skipping...`);
                        continue;
                    }

                    // Execute block steps with highlight
                    for (let i = 0; i < block.steps.length; i++) {
                        const step = block.steps[i];
                        const stepDelay = step.delay || 1000;
                        console.log(`▶️ Step ${i + 1}/${block.steps.length} (delay: ${stepDelay}ms):`, step);

                        // Wait before step using recorded delay (minimum 500ms)
                        if (i > 0) {
                            const waitTime = Math.max(stepDelay, 500);
                            console.log(`⏱️ Waiting ${waitTime}ms...`);
                            await new Promise(r => setTimeout(r, waitTime));
                        }

                        await chrome.tabs.sendMessage(tabId, {
                            action: "EXECUTE_STEP_WITH_HIGHLIGHT",
                            step: step,
                            stepIndex: i,
                            totalSteps: block.steps.length,
                            blockName: blockName,
                            blockIndex: blockIndex,
                            totalBlocks: request.blocks.length
                        });
                    }
                }
                console.log("✅ Template test completed");
            } catch (err) {
                console.error("❌ Test Template Error:", err);
            }
        })();
    }

    // 6. Asset Pipeline: Server Asset Logic
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

// --- ASSET PIPELINE: DOWNLOAD INTERCEPTOR (ENHANCED) ---
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === "complete") {
        chrome.downloads.search({ id: delta.id }, (results) => {
            if (results && results[0]) {
                const file = results[0];
                console.log("📦 Asset Downloaded:", file.filename);

                // Track Scene Asset with Index (for multi-scene workflows)
                if (currentJobContext.currentSceneIndex >= 0) {
                    currentJobContext.sceneAssets.push({
                        sceneIndex: currentJobContext.currentSceneIndex,
                        filename: file.filename,
                        downloadId: file.id,
                        timestamp: Date.now()
                    });
                    console.log(`📦 Scene ${currentJobContext.currentSceneIndex + 1}/${currentJobContext.totalScenes} tracked: ${file.filename}`);
                }

                // Keep latest_asset for backward compatibility
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
                    payload: file,
                    sceneIndex: currentJobContext.currentSceneIndex
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

// --- SCHEDULER: JOB CHECKER (REST API) with BLOCK SEQUENCE SUPPORT ---
const checkJobs = async (projectId) => {
    try {
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
            const userId = fields.userId?.stringValue;

            // Parse Job Data
            const job = {
                id: docId,
                status: fields.status?.stringValue,
                blockSequence: fields.blockSequence?.arrayValue?.values?.map(v => v.stringValue) || [],
                currentBlockIndex: Number(fields.currentBlockIndex?.integerValue || 0),
                platforms: fields.platforms?.arrayValue?.values?.map(fromFirestoreValue) || [],
                prompts: fields.prompts?.arrayValue?.values?.map(v => v.stringValue) || [],
                scenes: fields.scenes?.arrayValue?.values?.map(fromFirestoreValue) || [],
                titles: fromFirestoreValue(fields.titles) || {},
                tags: fromFirestoreValue(fields.tags) || {}
            };

            console.log("🧱 Found Job with Block Sequence:", job.blockSequence);

            // Helper: Write Log
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

            // Helper: Update Job Status
            const updateJobStatus = async (status, errorMsg = null) => {
                const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt&updateMask.fieldPaths=error&key=${API_KEY}`;
                const body = {
                    fields: {
                        status: { stringValue: status },
                        completedAt: { timestampValue: new Date().toISOString() }
                    }
                };
                if (errorMsg) body.fields.error = { stringValue: errorMsg };
                await fetch(patchUrl, { method: 'PATCH', body: JSON.stringify(body) });
                console.log(`📝 Job ${job.id} status: ${status}`);
            };

            // Helper: Update Current Block Index
            const updateBlockIndex = async (index) => {
                const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=currentBlockIndex&key=${API_KEY}`;
                await fetch(patchUrl, {
                    method: 'PATCH',
                    body: JSON.stringify({ fields: { currentBlockIndex: { integerValue: index } } })
                });
            };

            // Mark as Running
            await fetch(`https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&key=${API_KEY}`, {
                method: 'PATCH',
                body: JSON.stringify({ fields: { status: { stringValue: 'running' } } })
            });

            // === BLOCK SEQUENCE EXECUTION ===
            if (job.blockSequence.length === 0) {
                writeLog("❌ No blocks in sequence", "ERROR");
                await updateJobStatus('FAILED', 'No blocks in sequence');
                return;
            }

            writeLog(`🧱 Starting Block Sequence: ${job.blockSequence.join(' → ')}`, "INFO");

            let videoFilePath = null;
            const MAX_RETRIES = 3;

            for (let i = job.currentBlockIndex; i < job.blockSequence.length; i++) {
                const currentBlockId = job.blockSequence[i];
                await updateBlockIndex(i);

                writeLog(`▶️ [${i + 1}/${job.blockSequence.length}] Running Block: ${currentBlockId}`, "INFO");

                // Fetch Block from global_recipe_blocks
                const block = await fetchBlock(currentBlockId);
                if (!block) {
                    writeLog(`❌ Block not found: ${currentBlockId}`, "ERROR");
                    await updateJobStatus('FAILED', `Block not found: ${currentBlockId}`);
                    return;
                }

                // Determine platform for upload blocks
                const uploadBlockIndex = job.blockSequence.slice(0, i).filter(b => b.startsWith('UPLOAD_')).length;
                const currentPlatform = job.platforms[uploadBlockIndex] || null;
                const platformId = currentPlatform?.platformId || '';

                // Build Variables for this Recipe
                const variables = {
                    prompt: job.prompts[0] || '',
                    prompts: job.prompts,
                    scenes: job.scenes,
                    videoFilePath: videoFilePath,
                    platform: currentPlatform,
                    platformId: platformId,
                    title: job.titles?.[platformId] || job.titles?.youtube || '',
                    tags: job.tags?.[platformId] || job.tags?.youtube || [],
                    title_youtube: job.titles?.youtube || '',
                    title_facebook: job.titles?.facebook || '',
                    title_tiktok: job.titles?.tiktok || '',
                    title_instagram: job.titles?.instagram || '',
                    tags_youtube: (job.tags?.youtube || []).join(', '),
                    tags_facebook: (job.tags?.facebook || []).join(', '),
                    tags_tiktok: (job.tags?.tiktok || []).join(', '),
                    tags_instagram: (job.tags?.instagram || []).join(', ')
                };

                // Execute Block with Retry
                let blockSuccess = false;
                let retryCount = 0;

                while (!blockSuccess && retryCount < MAX_RETRIES) {
                    if (retryCount > 0) {
                        writeLog(`🔄 Retry ${retryCount}/${MAX_RETRIES} for ${currentBlockId}...`, "INFO");
                        await new Promise(r => setTimeout(r, 5000));
                    }

                    try {
                        const targetTab = await ensureTab(block.startUrl);
                        const blockPayload = {
                            id: currentBlockId,
                            steps: block.steps,
                            startUrl: block.startUrl,
                            variables: variables
                        };

                        // Check if block requires Desktop Agent (e.g., STITCH_VIDEO)
                        if (block.requiresAgent && block.agentCommand) {
                            writeLog(`🤖 Delegating to Desktop Agent: ${block.agentCommand}`, "INFO");

                            // Get ordered scene files from tracking
                            const sceneFiles = getOrderedSceneFiles();

                            if (sceneFiles.length === 0) {
                                throw new Error("No scene files tracked for stitching");
                            }

                            writeLog(`📦 Scene files to stitch: ${sceneFiles.length}`, "INFO");

                            // Create output path (Downloads folder)
                            const outputPath = sceneFiles[0].replace(/[^\\\/]+$/, `final_${job.id}.mp4`);

                            // Create agent job
                            const userId = job.userId || 'unknown';
                            const agentJobId = await createAgentJob(userId, job.projectId, block.agentCommand, {
                                sceneFiles: sceneFiles,
                                outputPath: outputPath,
                                parentJobId: job.id
                            });

                            // Wait for agent to complete
                            const result = await waitForAgentJob(agentJobId, 600000); // 10 min timeout

                            if (result.success) {
                                // Update latest_asset to point to stitched video
                                chrome.storage.local.set({
                                    latest_asset: {
                                        filename: outputPath,
                                        timestamp: Date.now(),
                                        isStitched: true
                                    }
                                });
                                videoFilePath = outputPath;
                                writeLog(`✅ Video stitched: ${outputPath}`, "SUCCESS");
                                blockSuccess = true;
                            } else {
                                throw new Error(`Agent failed: ${result.error}`);
                            }
                        }
                        // For LOOP blocks (like ADD_SCENE_TEXT), run per-scene
                        else if (block.type === 'LOOP' && job.prompts.length > 0) {
                            // Initialize scene tracking for this job
                            initSceneTracking(job.id, job.prompts.length);

                            writeLog(`🔁 LOOP Block: Processing ${job.prompts.length} scenes...`, "INFO");

                            for (let s = 0; s < job.prompts.length; s++) {
                                // Set current scene index for download tracking
                                setCurrentScene(s);

                                const scenePayload = {
                                    ...blockPayload,
                                    variables: { ...variables, prompt: job.prompts[s], sceneIndex: s }
                                };

                                writeLog(`🎬 Scene ${s + 1}/${job.prompts.length}`, "INFO");

                                await new Promise((resolve, reject) => {
                                    const listener = (msg) => {
                                        if (msg.action === "RECIPE_STATUS_UPDATE" && msg.recipeId === currentBlockId) {
                                            chrome.runtime.onMessage.removeListener(listener);
                                            if (msg.status === "COMPLETED") {
                                                if (msg.videoFilePath) videoFilePath = msg.videoFilePath;
                                                resolve();
                                            } else {
                                                reject(new Error(msg.error || "Scene Failed"));
                                            }
                                        }
                                    };
                                    chrome.runtime.onMessage.addListener(listener);
                                    executeRecipeOnTab(targetTab, scenePayload);
                                    setTimeout(() => {
                                        chrome.runtime.onMessage.removeListener(listener);
                                        reject(new Error("Scene Timeout (5min)"));
                                    }, 300000);
                                });

                                await new Promise(r => setTimeout(r, 3000)); // Delay between scenes
                            }

                            // Log tracked scene assets
                            writeLog(`📦 Tracked ${currentJobContext.sceneAssets.length} scene assets`, "INFO");
                        } else {
                            // ONCE blocks (Export, Download, Upload)
                            await new Promise((resolve, reject) => {
                                const listener = (msg) => {
                                    if (msg.action === "RECIPE_STATUS_UPDATE" && msg.recipeId === currentBlockId) {
                                        chrome.runtime.onMessage.removeListener(listener);
                                        if (msg.status === "COMPLETED") {
                                            if (msg.videoFilePath) videoFilePath = msg.videoFilePath;
                                            resolve();
                                        }
                                        else reject(new Error(msg.error || "Block Failed"));
                                    }
                                };
                                chrome.runtime.onMessage.addListener(listener);
                                executeRecipeOnTab(targetTab, blockPayload);
                                setTimeout(() => {
                                    chrome.runtime.onMessage.removeListener(listener);
                                    reject(new Error("Block Timeout (5min)"));
                                }, 300000);
                            });
                        }

                        blockSuccess = true;
                        writeLog(`✅ Completed Block: ${currentBlockId}`, "SUCCESS");

                    } catch (err) {
                        retryCount++;
                        writeLog(`⚠️ ${currentBlockId} failed: ${err.message}`, "ERROR");
                        if (retryCount >= MAX_RETRIES) {
                            await updateJobStatus('FAILED', `${currentBlockId} failed after ${MAX_RETRIES} retries`);
                            return;
                        }
                    }
                }

                // Delay between blocks
                await new Promise(r => setTimeout(r, 5000));
            }

            writeLog("🏆 All Blocks Completed!", "SUCCESS");
            await updateJobStatus('COMPLETED');
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
