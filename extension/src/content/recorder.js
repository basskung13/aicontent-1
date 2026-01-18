console.log("🕵️ Content Agent Injected");

// 🛡️ IDEMPOTENCY CHECK: Prevent duplicate listeners if injected multiple times
if (window.recorderInjected) {
    console.log("♻️ Content Agent already active. Skipping re-initialization.");
} else {
    window.recorderInjected = true;
    console.log("🚀 Content Agent Initialized for the first time.");

    let isArmed = false;

    // --- LISTENER: Commands from Background/Popup ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "ARM_RECORDER") {
            console.log("🔴 RECORDER ARMED");
            isArmed = true;
            showOverlay("🔴 Recording...");
            sendResponse({ status: "ARMED" }); // Return success to background
        }
        if (request.action === "DISARM_RECORDER") {
            console.log("⚪ RECORDER DISARMED");
            isArmed = false;
            showOverlay("⚪ Recording Stopped", 2000);
            sendResponse({ status: "DISARMED" });
        }
    });

    // --- CHECK INTITAL STATE ---
    chrome.storage.local.get(['isRecording'], (result) => {
        if (result.isRecording) {
            isArmed = true;
            console.log("🔴 Resuming Recording session...");
            showOverlay("🔴 Recording...");
        }
    });

    // --- CAPTURE: Clicks ---
    document.addEventListener('mousedown', (e) => {
        if (!isArmed) return;

        const target = e.target;
        // Ignore interactions with our own overlay
        if (target.id === 'agent-overlay') return;

        let selector = generateSelector(target);

        const payload = {
            action: 'click',
            selector: selector,
            description: `Clicked ${selector}`,
            timestamp: Date.now(),
            url: window.location.href
        };

        console.log("⚡ CAPTURED:", payload);
        chrome.runtime.sendMessage({ action: "RECORD_STEP", payload: payload });

    }, true); // Use Capture Phase

    // --- CAPTURE: Typing ---
    // Use 'input' event for real-time capture, debounced to avoid spam
    let typingTimeout = null;
    let lastTypedElement = null;
    
    document.addEventListener('input', (e) => {
        if (!isArmed) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Debounce: Wait 500ms after user stops typing
            if (typingTimeout) clearTimeout(typingTimeout);
            lastTypedElement = e.target;
            
            typingTimeout = setTimeout(() => {
                if (!lastTypedElement) return;
                let selector = generateSelector(lastTypedElement);
                const payload = {
                    action: 'type',
                    selector: selector,
                    value: lastTypedElement.value,
                    description: `Typed '${lastTypedElement.value}'`,
                    timestamp: Date.now()
                };
                chrome.runtime.sendMessage({ action: "RECORD_STEP", payload: payload });
                lastTypedElement = null;
            }, 500);
        }
    }, true);
    
    // Also capture 'change' for dropdowns and other non-text inputs
    document.addEventListener('change', (e) => {
        if (!isArmed) return;
        if (e.target.tagName === 'SELECT') {
            let selector = generateSelector(e.target);
            const payload = {
                action: 'select',
                selector: selector,
                value: e.target.value,
                description: `Selected '${e.target.options[e.target.selectedIndex]?.text || e.target.value}'`,
                timestamp: Date.now()
            };
            chrome.runtime.sendMessage({ action: "RECORD_STEP", payload: payload });
        }
    }, true);

    // --- HELPER: Selector Generator ---
    function generateSelector(el) {
        // 1. ID
        if (el.id) return `#${el.id}`;

        // 2. Aria Label
        if (el.getAttribute('aria-label')) {
            return `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`;
        }

        // 3. Text Content (Button/Link)
        if ((el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN') &&
            el.innerText.trim().length > 0 && el.innerText.trim().length < 30) {
            return `${el.tagName.toLowerCase()}::text="${el.innerText.trim()}"`;
        }

        // 4. Class
        if (el.className && typeof el.className === 'string' && el.className.trim() !== '') {
            const classes = el.className.split(' ').filter(c => !c.includes(':') && !c.includes('/'));
            if (classes.length > 0) return `.${classes[0]}`;
        }

        // 5. Hierarchy
        let path = [];
        let current = el;
        while (current.parentElement) {
            let tag = current.tagName.toLowerCase();
            let siblings = Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
                let index = siblings.indexOf(current) + 1;
                tag += `:nth-of-type(${index})`;
            }
            path.unshift(tag);
            current = current.parentElement;
            if (path.length > 3) break;
        }
        return path.join(' > ');
    }

    // --- HELPER: Overlay ---
    function showOverlay(text, timeout = 0) {
        let overlay = document.getElementById('agent-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'agent-overlay';
            overlay.style.position = 'fixed';
            overlay.style.bottom = '20px';
            overlay.style.right = '20px';
            overlay.style.background = 'rgba(0,0,0,0.8)';
            overlay.style.color = 'white';
            overlay.style.padding = '10px 20px';
            overlay.style.borderRadius = '30px';
            overlay.style.zIndex = '999999';
            overlay.style.fontFamily = 'sans-serif';
            overlay.style.pointerEvents = 'none'; // Click through
            overlay.style.border = '1px solid #ef4444';
            overlay.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.5)';
            document.body.appendChild(overlay);
        }
        overlay.innerText = text;
        overlay.style.display = 'block';

        if (timeout > 0) {
            setTimeout(() => {
                overlay.style.display = 'none';
            }, timeout);
        }
    }
}
