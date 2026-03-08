
        // 1. Setup Ace Editor
        const editor = ace.edit("editor");
        editor.setTheme("ace/theme/one_dark");
        editor.session.setMode("ace/mode/javascript");
        
        editor.setOptions({
            fontSize: "14pt",
            showPrintMargin: false,
            showGutter: true,
            highlightActiveLine: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            behavioursEnabled: true, 
            wrap: true, 
            scrollPastEnd: 0.5,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
        });

        // ==========================================
        // 2. MULTI-FILE SYSTEM & AUTO-SAVE
        // ==========================================
        let currentProject = localStorage.getItem('js-ide-active-project') || "main.js";
        let projects = JSON.parse(localStorage.getItem('js-ide-projects')) || {};

        // 🛡️ Migration Script: Save the user's old code so they don't lose it!
        if (Object.keys(projects).length === 0) {
            const oldCode = localStorage.getItem('js-ide-autosave');
            projects["main.js"] = oldCode || "// Welcome to JS Pro IDE\n";
            localStorage.setItem('js-ide-projects', JSON.stringify(projects));
        }

        // 🧠 SESSIONS MEMORY: Holds a separate "brain" for every opened file
        const editSessions = {}; 
        let saveTimeout;

        // Factory function to create or retrieve a file's brain
        function getOrCreateSession(fileName) {
            if (!editSessions[fileName]) {
                // Create a brand new brain with its own Undo history
                const session = ace.createEditSession(projects[fileName] || "", "ace/mode/javascript");
                session.setUseWrapMode(true); // Keep word-wrapping turned on
                
                // Attach Auto-Save directly to this specific brain
                session.on('change', function() {
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        projects[fileName] = session.getValue();
                        localStorage.setItem('js-ide-projects', JSON.stringify(projects));
                        
                        const statusInd = document.getElementById('status-indicator');
                        if(statusInd) {
                             statusInd.innerHTML = "● Saved";
                             statusInd.style.color = "#94a3b8"; 
                        }
                    }, 1000);
                });
                
                editSessions[fileName] = session; // Save the brain in memory
            }
            return editSessions[fileName];
        }

        function updateHeaderTitle() {
            const nameSpan = document.getElementById('project-name-display');
            if (nameSpan) {
                nameSpan.textContent = currentProject.replace(/[<>"'/\\|?*]/g, "");
            }
        }
        
        // Load the active project properly using its Session Brain
        editor.setSession(getOrCreateSession(currentProject));
        updateHeaderTitle();


                // --- 3. MOBILE MENU WATCHER (BULLETPROOF VERSION) ---
        
        function injectCloseButton(menuNode) {
            if (menuNode.querySelector('.custom-mobile-close')) return;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'custom-mobile-close';
            closeBtn.innerHTML = '×';
            // We don't put the logic here; we just give it the class so the Window can find it
            menuNode.appendChild(closeBtn);
        }

        // GLOBAL KILL SWITCH: Intercepts the tap at the browser level
        window.addEventListener('touchstart', function(e) {
            if (e.target.classList.contains('custom-mobile-close')) {
                e.preventDefault();
                e.stopPropagation();

                // Find the menu this button belongs to and kill it
                const menu = e.target.closest('.ace_mobile-menu');
                if (menu) {
                    menu.style.setProperty('display', 'none', 'important');
                }
                
                // Force Ace to reset
                editor.clearSelection();
                editor.blur(); 
            }
        }, true); // 'true' makes this the highest priority listener in the browser

        const menuWatcher = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!node.tagName) return; // Skip text nodes

                    // 1. Handle Mobile Menu Close Button Injection
                    if (node.classList && node.classList.contains('ace_mobile-menu')) {
                        injectCloseButton(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('.ace_mobile-menu').forEach(injectCloseButton);
                    }

                    // 2. 🛡️ TOUCH SHIELD: Prevent clicks from bleeding into the editor
                    const shieldUI = (el) => {
                        el.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: false});
                        el.addEventListener('mousedown', (e) => e.stopPropagation());
                    };

                    if (node.classList && (node.classList.contains('ace_search') || node.classList.contains('ace_prompt_container'))) {
                        shieldUI(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('.ace_search, .ace_prompt_container').forEach(shieldUI);
                    }
                });
            });
        });

        menuWatcher.observe(document.body, { childList: true, subtree: true });

      

        // --- KEYBOARD FIX (VISUAL VIEWPORT API) ---
        // This effectively listens to the keyboard opening/closing
        if (window.visualViewport) {
            const handleViewportChange = () => {
                // Force the body to exactly match the visible area above the keyboard
                document.body.style.height = `${window.visualViewport.height}px`;
                
                // Push the body down if the browser scrolled to keep the cursor in view
                document.body.style.top = `${window.visualViewport.offsetTop}px`;
                
                // Lock scroll to prevent UI tearing
                window.scrollTo(0, 0);
                
                // Redraw Editor
                editor.resize();
            };

            // Listen to both resize (keyboard opening) and scroll (browser pushing UI up)
            window.visualViewport.addEventListener('resize', handleViewportChange);
            window.visualViewport.addEventListener('scroll', handleViewportChange);
            
            // Fire once on load to establish the baseline
            handleViewportChange();
        }

        // --- ROBUST CONSOLE RESIZE LOGIC ---
        const consoleBox = document.getElementById('console-box');
        const consoleHandle = document.getElementById('console-handle');
        const handleIcon = document.getElementById('handle-icon');
        const outputDiv = document.getElementById('console-output');
        const layoutEl = document.getElementById('main-layout');

                        // NEW BRAIN 1: Is the console stacked vertically?
        function isConsoleStacked() {
            // Landscape is ALWAYS side-by-side (never stacked)
            if (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches) {
                return false; 
            }
            // Portrait/Desktop depends on the workspace orientation
            const workspaceStyle = window.getComputedStyle(document.getElementById('workspace-area'));
            return workspaceStyle.flexDirection === 'column';
        }

        // NEW BRAIN 2: Is the console on the physical left side?
        function isConsoleOnLeft() {
            // Landscape console is ALWAYS locked to the left by our CSS 'order: 1'
            if (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches) {
                return true; 
            }
            // Desktop/Portrait depends on if the left-bar class is active
            return layoutEl.classList.contains('left-bar');
        }


        let isDragging = false;
        let startX, startY, startDim; 
        let isCollapsed = false;
        let lastValidSize = null; 

        function updateConsoleIcon() {
            const isColumn = isConsoleStacked();
            const isLeft = isConsoleOnLeft();

            if (isCollapsed) {
                if (isColumn) handleIcon.textContent = "▲"; // Open Up
                else handleIcon.textContent = isLeft ? "▶" : "◀"; 
            } else {
                if (isColumn) handleIcon.textContent = "▼"; // Close Down
                else handleIcon.textContent = isLeft ? "◀" : "▶"; 
            }
            
            // Update Cursor Style
            if (isColumn) consoleHandle.style.cursor = "row-resize";
            else consoleHandle.style.cursor = "col-resize";
        }

        updateConsoleIcon();

        // Bind Events
        consoleHandle.addEventListener('mousedown', startDrag);
        consoleHandle.addEventListener('touchstart', startDrag, {passive: false});

        function startDrag(e) {
            isDragging = false; 
            
            if (e.type === 'touchstart') {
                if (e.cancelable) e.preventDefault(); /* 🚫 KILLS THE GHOST CLICK 🚫 */
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            } else {
                startX = e.clientX;
                startY = e.clientY;
            }
            
            const isColumn = isConsoleStacked();

            if (isColumn) {
                startDim = consoleBox.offsetHeight;
            } else {
                startDim = consoleBox.offsetWidth;
            }

            document.addEventListener('mousemove', doDrag);
            document.addEventListener('touchmove', doDrag, {passive: false});
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function doDrag(e) {
            let currentX, currentY;

            if(e.type === 'touchmove') {
                currentX = e.touches[0].clientX;
                currentY = e.touches[0].clientY;
            } else {
                currentX = e.clientX;
                currentY = e.clientY;
            }

            let diffX = startX - currentX;
            let diffY = startY - currentY; 
            
            if (!isDragging && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
                isDragging = true;
            }

            if (!isDragging) return; 
            
            if (e.cancelable) e.preventDefault(); 

            const isColumn = isConsoleStacked();
            const isLeft = isConsoleOnLeft();

            if (isColumn) {
                let newHeight = startDim + diffY;
                if (newHeight < 32) newHeight = 32;
                // Limit height based on Visual Viewport if available
                const maxH = (window.visualViewport ? window.visualViewport.height : window.innerHeight) * 0.8;
                if (newHeight > maxH) newHeight = maxH;
                
                consoleBox.style.height = newHeight + 'px';
                lastValidSize = newHeight + 'px';
            } else {
                let newWidth;
                if (isLeft) {
                    newWidth = startDim - diffX;
                } else {
                    newWidth = startDim + diffX;
                }

                if (newWidth < 40) newWidth = 40;
                if (newWidth > window.innerWidth * 0.7) newWidth = window.innerWidth * 0.7;

                consoleBox.style.width = newWidth + 'px';
                lastValidSize = newWidth + 'px'; 
            }
            
            editor.resize();
        }

        function stopDrag(e) {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('touchmove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);

            if (!isDragging) {
                toggleConsoleState();
            }
            editor.resize();
        }

        function toggleConsoleState() {
            isCollapsed = !isCollapsed;
            const isColumn = isConsoleStacked();

            if (isCollapsed) {
                consoleBox.classList.add('collapsed');
                consoleBox.style.height = '';
                consoleBox.style.width = '';
            } else {
                consoleBox.classList.remove('collapsed');
                if (lastValidSize) {
                    if (isColumn) consoleBox.style.height = lastValidSize;
                    else consoleBox.style.width = lastValidSize;
                }
            }
            updateConsoleIcon();
            setTimeout(() => editor.resize(), 50);
        }

        // --- CONSOLE OUTPUT ---
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        let isLogging = false; 

              function appendToConsole(message, type) {
            if (isLogging) return; 
            isLogging = true;

            try {
                const entry = document.createElement('div');
                entry.className = `log-entry log-${type}`;

                // Handle Objects with a Collapsible UI
                if (typeof message === 'object' && message !== null) {
                    const container = document.createElement('div');
                    container.className = 'obj-container';
                    
                    const summary = document.createElement('div');
                    summary.className = 'obj-summary';
                    summary.innerHTML = `<span class="obj-arrow">▶</span> <strong>Object</strong> ${Array.isArray(message) ? '[]' : '{}'}`;
                    
                    const details = document.createElement('pre');
                    details.className = 'obj-details';
                    details.style.display = 'none';
                    details.textContent = JSON.stringify(message, null, 2);
                    
                    summary.onclick = (e) => {
                        const isHidden = details.style.display === 'none';
                        details.style.display = isHidden ? 'block' : 'none';
                        summary.querySelector('.obj-arrow').style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
                    };
                    
                    container.appendChild(summary);
                    container.appendChild(details);
                    entry.appendChild(container);
                } else {
                    entry.textContent = String(message);
                }
                
                outputDiv.appendChild(entry);
                outputDiv.scrollTop = outputDiv.scrollHeight;
            } catch (err) {
                // Silently handle logging errors
            } finally {
                isLogging = false;
            }
        }


        console.log = function(...args) {
            args.forEach(arg => appendToConsole(arg, 'info'));
            originalLog.apply(console, args);
        };

        console.error = function(...args) {
            args.forEach(arg => appendToConsole(arg, 'error'));
            originalError.apply(console, args);
        };

        console.warn = function(...args) {
            args.forEach(arg => appendToConsole(arg, 'warn'));
            originalWarn.apply(console, args);
        };

        window.onerror = function(message, source, lineno, colno, error) {
            console.error(`Error: ${message} (Line ${lineno})`);
            return true;
        };

        // --- RUN CODE ---
    

                // 🛡️ Global reference to the active worker so we can kill it when re-running
        let currentWorker = null; 

        async function runCode() {
            const statusInd = document.getElementById('status-indicator');
            statusInd.innerHTML = "● Running...";
            statusInd.style.color = "#f59e0b";

            if (isCollapsed) toggleConsoleState();

            const code = editor.getValue();
            appendToConsole("--- Executing ---", "system");

            // 1. Kill the old worker before starting a new one!
            if (currentWorker) {
                currentWorker.terminate();
            }

            // Optimized Worker String with Async Error Catching!
            const workerCode = `
                console.log = (...args) => self.postMessage({ type: 'log', level: 'info', data: args });
                console.info = (...args) => self.postMessage({ type: 'log', level: 'info', data: args });
                console.warn = (...args) => self.postMessage({ type: 'log', level: 'warn', data: args });
                console.error = (...args) => self.postMessage({ type: 'log', level: 'error', data: args });
                
                // 🛡️ Catch unhandled async promise rejections
                self.addEventListener('unhandledrejection', (e) => {
                    self.postMessage({ type: 'error', message: "Unhandled Rejection: " + (e.reason || "Unknown Error") });
                });

                // 🛡️ Catch async timeouts and interval errors
                self.onerror = (message) => {
                    self.postMessage({ type: 'error', message: message });
                    return true;
                };

                self.onmessage = async (e) => {
                    try {
                        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                        const runFunc = new AsyncFunction(e.data);
                        await runFunc();
                        self.postMessage({ type: 'success' });
                    } catch (err) {
                        self.postMessage({ type: 'error', message: err.toString() });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            currentWorker = new Worker(URL.createObjectURL(blob));

            // Catch hardware-level worker failures
            currentWorker.onerror = (err) => {
                appendToConsole("Fatal Worker Error: " + err.message, "error");
                statusInd.innerHTML = "● Error";
                statusInd.style.color = "#ef4444";
            };

            const timeout = setTimeout(() => {
                currentWorker.terminate(); 
                currentWorker = null;
                console.error("Execution timed out: Possible infinite loop detected.");
                statusInd.innerHTML = "● Timeout";
                statusInd.style.color = "#ef4444";
            }, 3000);

            currentWorker.onmessage = (e) => {
                if (e.data.type === 'log') {
                    e.data.data.forEach(arg => appendToConsole(arg, e.data.level));
                    return; 
                }

                if (e.data.type === 'success') {
                    clearTimeout(timeout); 
                    statusInd.innerHTML = "● Success";
                    statusInd.style.color = "#10b981";
                    // 🛡️ WE DO NOT TERMINATE THE WORKER HERE ANYMORE!
                    // It stays alive to listen for setTimeouts and async functions.
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout); 
                    appendToConsole(e.data.message, "error");
                    statusInd.innerHTML = "● Error";
                    statusInd.style.color = "#ef4444";
                }
            };

            currentWorker.postMessage(code);
        }



        // --- UTILS ---
        function changeFontSize(amount) {
            let currentSize = parseInt(editor.getFontSize());
            let newSize = currentSize + amount;
            if (newSize < 10) newSize = 10;
            if (newSize > 30) newSize = 30;
            editor.setFontSize(newSize);
        }

        function clearConsole() {
            outputDiv.innerHTML = '<div class="log-system">Console cleared.</div>';
        }

        // --- PRO TOOL: SMART COLOR PICKER ---
        function triggerColorPicker() {
            const picker = document.getElementById('native-color-picker');
            
            // 1. Get cursor position
            const pos = editor.getCursorPosition();
            const line = editor.session.getLine(pos.row);
            
            // 2. Regex to find hex codes (like #ff0000 or #fff)
            const hexRegex = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g;
            let match;
            let targetRange = null;

            // 3. Check if cursor is resting on an existing hex code
            while ((match = hexRegex.exec(line)) !== null) {
                if (pos.column >= match.index && pos.column <= match.index + match[0].length) {
                    const Range = ace.require("ace/range").Range;
                    targetRange = new Range(pos.row, match.index, pos.row, match.index + match[0].length);
                    
                    // Pre-fill the color picker with the existing color
                    let existingColor = match[0];
                    if (existingColor.length === 4) { // Convert #fff to #ffffff
                        existingColor = '#' + existingColor[1]+existingColor[1] + existingColor[2]+existingColor[2] + existingColor[3]+existingColor[3];
                    }
                    picker.value = existingColor;
                    break;
                }
            }

            // 4. CRITICAL: Clear old event listeners before adding a new one
            picker.oninput = null; 

            // 5. Handle the color selection
            picker.oninput = (e) => {
                const color = e.target.value.toLowerCase();
                
                if (targetRange) {
                    // Replace the existing hex code
                    editor.session.replace(targetRange, color);
                    // Update the range so dragging the color slider updates smoothly
                    targetRange.end.column = targetRange.start.column + color.length;
                } else {
                    // Insert a brand new hex code
                    editor.insert(color);
                    // Create a range immediately so dragging the slider works
                    const currentPos = editor.getCursorPosition();
                    const Range = ace.require("ace/range").Range;
                    targetRange = new Range(currentPos.row, currentPos.column - color.length, currentPos.row, currentPos.column);
                }

                if (navigator.vibrate) navigator.vibrate(20);
            };

            // 6. Programmatically click the hidden input to open the mobile UI
            picker.click();
        }

        // --- QUICK BAR ---
        const keys = [
            // Core Structure
            { label: "🎨", val: "COLOR" },
            { label: "Tab", val: "  " }, 
            { label: "let", val: "let " },
            { label: "const", val: "const " },
            { label: "func", val: "function() {\n\t\n}" },
            { label: "if", val: "if () {\n\t\n}" },
            { label: "return", val: "return " },
            { label: "log", val: "console.log()" },
            
            // Brackets & Quotes
            { label: "{", val: "{}" }, 
            { label: "}", val: "}" },
            { label: "(", val: "()" }, 
            { label: ")", val: ")" },
            { label: "[", val: "[]" }, 
            { label: "]", val: "]" },
            { label: "`", val: "``" },
            { label: "'", val: "''" },
            { label: '"', val: '""' },
            
            // Operators & Punctuation
            { label: ".", val: "." },
            { label: ",", val: "," },
            { label: ":", val: ":" },
            { label: ";", val: ";" }, 
            { label: "=", val: " = " },
            { label: "===", val: " === " },
            { label: "=>", val: " => " },
            { label: "...", val: "..." },
            { label: "?.", val: "?." },
            { label: "!=", val: " != " },
            { label: "&&", val: " && " },
            { label: "||", val: " || " }
        ];


                // --- UPGRADED QUICK BAR WITH REORDERING ---
        const keysContainer = document.getElementById('keys-container');
        const layoutIcon = document.getElementById('layout-icon');

        // Load saved order from localStorage or use default
        let savedOrder = JSON.parse(localStorage.getItem('quick-bar-order'));
        
        // --- SMART FIX: Auto-reset layout if new buttons are added! ---
        if (savedOrder && savedOrder.length !== keys.length) {
            console.log("App update detected: Resetting Quick Bar layout...");
            savedOrder = null;
            localStorage.removeItem('quick-bar-order');
        }

        const currentKeys = savedOrder || keys;

                // --- DRAG STATE GLOBAL VARIABLES ---
        let draggedBtn = null;
        let placeholder = null;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let scrollRAF = null;
        let pointerX = 0;
        let pointerY = 0;

        function renderKeys() {
            keysContainer.innerHTML = ''; // Clear existing
            currentKeys.forEach((k, index) => {
                const btn = document.createElement('div');
                btn.className = 'code-key';
                btn.textContent = k.label;
                btn.dataset.index = index;
                
                // NEW: Give the color picker a permanent class so styling stays when dragged
                if (k.label === "🎨") {
                    btn.classList.add("color-picker-btn");
                }
                
                let pressTimer;
                let wasDragged = false; // Flag to prevent typing when dropping
                
                const startPress = (e) => {
                    // Ignore right clicks
                    if (e.type === 'mousedown' && e.button !== 0) return;
                    
                    wasDragged = false;
                    btn.classList.add('lifting'); // Starts the CSS pulse
                    
                    pressTimer = setTimeout(() => {
                        btn.classList.remove('lifting');
                        wasDragged = true; // Locks the click event
                        
                        // Haptic feedback! (Works on most mobile browsers)
                        if (navigator.vibrate) navigator.vibrate(50); 
                        
                        initiateDrag(btn, e);
                    }, 1000); // Exactly 1 second
                };

                const cancelPress = () => {
                    clearTimeout(pressTimer);
                    btn.classList.remove('lifting'); // Stops animation if released early
                };

                // Normal Click (Insert Code)
                btn.onclick = (e) => {
                    e.preventDefault();
                    if (wasDragged) return; 

                    // 1. Intercept the Color Picker button
                    if (k.label === "🎨") {
                        triggerColorPicker();
                        return; // Stop here, don't type anything
                    }

                    // Standard Insertion
                    editor.insert(k.val);
                    editor.focus();

    if (["()", "{}", "[]", '""', "''", "``"].includes(k.val)) editor.navigateLeft(1);
    if (k.label === "log") editor.navigateLeft(1);
};

                // Listeners for Long Press
                btn.addEventListener('touchstart', startPress, {passive: true});
                btn.addEventListener('touchend', cancelPress);
                btn.addEventListener('touchcancel', cancelPress); // NEW: Catches system interruptions
                btn.addEventListener('mousedown', startPress);
                btn.addEventListener('mouseup', cancelPress);
                btn.addEventListener('mouseleave', cancelPress); // Cancel if mouse leaves

                keysContainer.appendChild(btn);
            });
        }

        function initiateDrag(btn, e) {
            draggedBtn = btn;
            
            // 1. Get exact current position
            const rect = btn.getBoundingClientRect();
            
            // 2. Create the invisible placeholder
            placeholder = document.createElement('div');
            placeholder.className = 'drag-placeholder';
            
            // 3. Insert placeholder exactly where the button is
            btn.parentNode.insertBefore(placeholder, btn);
            
            // 4. Pop the button out of the layout
            btn.classList.add('dragging');
            
            // 5. Position it fixed at the exact spot it was
            btn.style.left = rect.left + 'px';
            btn.style.top = rect.top + 'px';
            btn.style.width = rect.width + 'px';
            btn.style.height = rect.height + 'px';
            
            // 6. Calculate where the user's finger is inside the button
            pointerX = e.touches ? e.touches[0].clientX : e.clientX;
            pointerY = e.touches ? e.touches[0].clientY : e.clientY;
            
            dragOffsetX = pointerX - rect.left;
            dragOffsetY = pointerY - rect.top;
        // Add document-level listeners for moving and dropping
        document.addEventListener('mousemove', onDragMove, { passive: false });
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
                        // Fire up the auto-scroll engine
            scrollRAF = requestAnimationFrame(autoScroll);


              }
                function autoScroll() {
            if (!draggedBtn) return;
            
            const rect = keysContainer.getBoundingClientRect();
            const edgeSize = 40; // Triggers scroll when 40px from edge
            const scrollSpeed = 6; // Pixels per frame
            const isVertical = layoutEl.classList.contains('layout-side');
            let scrolled = false;

            if (isVertical) {
                // Scroll Up
                if (pointerY < rect.top + edgeSize) { keysContainer.scrollTop -= scrollSpeed; scrolled = true; }
                // Scroll Down
                else if (pointerY > rect.bottom - edgeSize) { keysContainer.scrollTop += scrollSpeed; scrolled = true; }
            } else {
                // Scroll Left
                if (pointerX < rect.left + edgeSize) { keysContainer.scrollLeft -= scrollSpeed; scrolled = true; }
                // Scroll Right
                else if (pointerX > rect.right - edgeSize) { keysContainer.scrollLeft += scrollSpeed; scrolled = true; }
            }

            // If we scrolled, elements moved! Re-check collisions.
            if (scrolled) evaluateSwap(isVertical);

            scrollRAF = requestAnimationFrame(autoScroll);
        }

        function onDragMove(e) {
            if (!draggedBtn) return;
            e.preventDefault(); 

            // Update global pointer variables for the autoScroll engine
            pointerX = e.touches ? e.touches[0].clientX : e.clientX;
            pointerY = e.touches ? e.touches[0].clientY : e.clientY;

            draggedBtn.style.left = (pointerX - dragOffsetX) + 'px';
            draggedBtn.style.top = (pointerY - dragOffsetY) + 'px';

            const isVertical = layoutEl.classList.contains('layout-side');
            evaluateSwap(isVertical);
        }

        function evaluateSwap(isVertical) {
            if (!draggedBtn) return;
            const draggedRect = draggedBtn.getBoundingClientRect();
            const centerX = draggedRect.left + draggedRect.width / 2;
            const centerY = draggedRect.top + draggedRect.height / 2;
            const siblings = [...keysContainer.querySelectorAll('.code-key:not(.dragging)')];
            
            for (let sibling of siblings) {
                const siblingRect = sibling.getBoundingClientRect();
                
                if (isVertical) {
                    if (centerY > siblingRect.top && centerY < siblingRect.bottom) {
                        const siblingCenterY = siblingRect.top + siblingRect.height / 2;
                        if (centerY < siblingCenterY) keysContainer.insertBefore(placeholder, sibling);
                        else keysContainer.insertBefore(placeholder, sibling.nextSibling);
                        break; 
                    }
                } else {
                    if (centerX > siblingRect.left && centerX < siblingRect.right) {
                        const siblingCenterX = siblingRect.left + siblingRect.width / 2;
                        if (centerX < siblingCenterX) keysContainer.insertBefore(placeholder, sibling);
                        else keysContainer.insertBefore(placeholder, sibling.nextSibling);
                        break; 
                    }
                }
            }
        }


        function onDragEnd(e) {
            if (!draggedBtn) return;
            cancelAnimationFrame(scrollRAF); // Kill the auto-scroll engine


            // 1. Snap the button directly into the placeholder's location
            keysContainer.insertBefore(draggedBtn, placeholder);
            
            // 2. Clean up visual styles so it goes back to normal
            draggedBtn.classList.remove('dragging');
            draggedBtn.style.cssText = ''; // Clears inline fixed positioning
            
            // 3. Destroy the placeholder
            placeholder.remove();
            placeholder = null;

            // 4. Remove listeners so they don't pile up
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchend', onDragEnd);

            // 5. Save the new order!
            saveNewOrder();
            
            draggedBtn = null;
        }

        function saveNewOrder() {
            const newOrder = [];
            const currentElements = keysContainer.querySelectorAll('.code-key');
            
            // Rebuild the array based on the new visual DOM order
            currentElements.forEach(el => {
                const originalIndex = el.dataset.index;
                newOrder.push(currentKeys[originalIndex]);
            });
            
            // Update the dataset indexes to match the new positions
            currentElements.forEach((el, idx) => el.dataset.index = idx);
            
            // Update global array and save to local storage
            currentKeys.length = 0; // Clear existing array
            currentKeys.push(...newOrder); // Repopulate
            localStorage.setItem('quick-bar-order', JSON.stringify(currentKeys));
        }

        // Initialize the bar
        renderKeys();



        let layoutMode = 0; 
        function cycleLayout() {
            layoutMode = (layoutMode + 1) % 3;
            layoutEl.className = '';
            
            consoleBox.style.width = '';
            consoleBox.style.height = '';
            lastValidSize = null; 
            
            if (layoutMode === 0) {
                layoutEl.classList.add('layout-bottom');
                layoutIcon.textContent = "⬒";
            } else if (layoutMode === 1) {
                layoutEl.classList.add('layout-side');
                layoutIcon.textContent = "◳";
            } else {
                layoutEl.classList.add('layout-side', 'left-bar');
                layoutIcon.textContent = "◧";
            }
            
            setTimeout(() => {
                editor.resize();
                updateConsoleIcon();
            }, 50);
        }
        // ==========================================
        // --- PRO TOOL: LIVE COLOR HIGHLIGHTER ---
        // ==========================================
        
        // Create an invisible style tag in the head to hold our dynamic colors
        const styleTag = document.createElement('style');
        styleTag.id = 'color-highlighter-styles';
        document.head.appendChild(styleTag);
        let colorMarkers = []; // Array to remember and clean up old markers

        function updateColorHighlights() {
            const session = editor.getSession();
            
            // 1. Remove old color background markers so they don't pile up
            colorMarkers.forEach(id => session.removeMarker(id));
            colorMarkers = [];
            
            let newStyles = "";
            const foundColors = new Set();
            
            // 2. Scan all the code in the editor
            const text = session.getValue();
            const lines = text.split('\n');
            // Regex to find accurate 3 or 6 digit hex codes
            const hexRegex = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
            const Range = ace.require("ace/range").Range;

            // 3. Find matches and apply highlights
            lines.forEach((line, row) => {
                let match;
                while ((match = hexRegex.exec(line)) !== null) {
                    const color = match[0].toLowerCase();
                    const className = "ace_color_" + color.replace('#', ''); // e.g., ace_color_ff0000
                    
                    // Generate CSS for this specific color background
                    if (!foundColors.has(color)) {
                        foundColors.add(color);
                        newStyles += `
                        .ace_marker-layer .${className} { 
                            background-color: ${color} !important; 
                            position: absolute !important; /* Forces Ace to respect X/Y coordinates */
                            border-radius: 4px !important;
                            opacity: 0.4 !important;
                            z-index: 0 !important; /* Keeps it behind the text */
                        }\n`;
                    }

                    // Tell Ace Editor to apply this class to the text coordinates
                    const range = new Range(row, match.index, row, match.index + match[0].length);
                    const markerId = session.addMarker(range, className, "text");
                    colorMarkers.push(markerId);
                }
            });
            
            // Inject the newly generated styles into the document
            styleTag.innerHTML = newStyles;
        }

        // Run the highlighter immediately when the app loads
        setTimeout(updateColorHighlights, 100);

        // Run it every time the user types (with a 300ms delay to save battery/performance)
        let highlightTimeout;
        editor.session.on('change', () => {
            clearTimeout(highlightTimeout);
            highlightTimeout = setTimeout(updateColorHighlights, 300);
        });
        // ==========================================
        // --- 📁 FILE MANAGER MODAL LOGIC ---
        // ==========================================
        const fileModal = document.getElementById('file-manager-modal');
        const fileList = document.getElementById('file-list');
        const newFileInput = document.getElementById('new-file-name');

        function openFileManager() {
            renderFileList();
            fileModal.classList.add('active');
            newFileInput.value = ''; // Clear input
        }

        function closeFileManager() {
            fileModal.classList.remove('active');
        }

        // Close if user clicks the blurred glass outside the box
        fileModal.addEventListener('click', (e) => {
            if (e.target === fileModal) closeFileManager();
        });

        function renderFileList() {
            fileList.innerHTML = '';
            
            Object.keys(projects).forEach(fileName => {
                const code = projects[fileName];
                // Calculate roughly how many KB the file is
                const sizeKB = (new Blob([code]).size / 1024).toFixed(1);
                
                const item = document.createElement('div');
                item.className = `file-item ${fileName === currentProject ? 'active-file' : ''}`;
                item.onclick = () => loadProject(fileName);
                
                // 🛡️ SECURITY PATCH: Sanitize the file name to prevent XSS
                const safeName = fileName.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                item.innerHTML = `
                    <div class="file-info">
                        <span class="file-name">${safeName}</span>
                        <span class="file-size">${sizeKB} KB</span>
                    </div>
                `;

                // Don't allow deleting the very last file
                if (Object.keys(projects).length > 1) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn-delete';
                    delBtn.innerHTML = '🗑️';
                    delBtn.onclick = (e) => {
                        e.stopPropagation(); // Stop the row click from triggering
                        deleteProject(fileName);
                    };
                    item.appendChild(delBtn);
                }

                fileList.appendChild(item);
            });
        }

        function createNewFile() {
            let name = newFileInput.value.trim();
            if (!name) return;
            
            // 🛡️ SECURITY PATCH: Strip out all HTML tags and weird symbols immediately
            name = name.replace(/[<>"'/\\|?*]/g, '');
            if (!name) return; // If they only typed symbols, cancel creation
            
            // 🛡️ LENGTH PATCH: Hard cap the base name to 16 characters max
            if (name.length > 16) name = name.substring(0, 16);
            
            // Add .js extension if user forgot it
            if (!name.endsWith('.js') && !name.endsWith('.txt')) name += '.js';
            
            if (projects[name]) {
                alert("A file with this name already exists!");
                return;
            }

            // YOUR FIX: Inject the exact same boilerplate HTML code for every new file
            projects[name] = `// Welcome to your JS IDE!
// Write your JavaScript below and click "Run Code".

let greeting = "Hello, Developer!";
let number = 42;

console.log(greeting);
console.log("The answer is: " + number);

// Try making an error to see the debugger:
// console.log(unknownVariable);`;

            localStorage.setItem('js-ide-projects', JSON.stringify(projects));
            
            // --- NEW BEHAVIOR: Stay in Modal ---
            newFileInput.value = ''; // Clear the input box so it's ready for another
            renderFileList();        // Refresh the visual list to show the newly created file
            // Note: We removed loadProject(name) so it doesn't forcefully switch over!
        }

        function loadProject(fileName) {
            // Save the current file's text just in case before switching
            if (editSessions[currentProject]) {
                projects[currentProject] = editSessions[currentProject].getValue();
            }
            
            currentProject = fileName;
            localStorage.setItem('js-ide-active-project', currentProject);
            
            // 🧠 SWAP THE BRAIN: Instantly loads text, cursor position, and Undo memory!
            editor.setSession(getOrCreateSession(fileName));
            
            updateHeaderTitle();
            closeFileManager();
            clearConsole();
        }

        // ==========================================
        // --- 🗑️ SMART DELETE SYSTEM ---
        // ==========================================
        let fileToDelete = null;

        function deleteProject(fileName) {
            fileToDelete = fileName;
            document.getElementById('delete-file-name').textContent = fileName;
            document.getElementById('delete-confirm-modal').classList.add('active');
        }

        function closeDeleteModal() {
            document.getElementById('delete-confirm-modal').classList.remove('active');
            fileToDelete = null;
            cancelDeleteHold(); // Reset button visually
        }

        // Close delete modal if clicked outside
        document.getElementById('delete-confirm-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('delete-confirm-modal')) closeDeleteModal();
        });

        // --- Hold-to-Confirm Animation Engine ---
        const holdDeleteBtn = document.getElementById('btn-hold-delete');
        const deleteProgress = holdDeleteBtn.querySelector('.delete-progress');
        let holdStartTime;
        let holdAnimFrame;
        const HOLD_DURATION = 1000; // 1000ms = 1 full second

        function startDeleteHold(e) {
            if (e.type === 'mousedown' && e.button !== 0) return; // Ignore right clicks
            if (e.cancelable) e.preventDefault();
            
            holdDeleteBtn.classList.add('holding');
            holdStartTime = performance.now();
            
            // This runs 60 times a second for buttery smooth progress bar filling
            function updateProgress(currentTime) {
                const elapsed = currentTime - holdStartTime;
                const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
                
                deleteProgress.style.width = `${progress}%`;
                
                if (progress < 100) {
                    holdAnimFrame = requestAnimationFrame(updateProgress);
                } else {
                    executeDelete(); // BOOM.
                }
            }
            holdAnimFrame = requestAnimationFrame(updateProgress);
        }

        function cancelDeleteHold() {
            cancelAnimationFrame(holdAnimFrame);
            holdDeleteBtn.classList.remove('holding');
            deleteProgress.style.width = '0%';
        }

        function executeDelete() {
            cancelAnimationFrame(holdAnimFrame);
            
            // Tactile feedback if the phone supports it
            if (navigator.vibrate) navigator.vibrate([50, 50, 100]); 
            
            // --- ORIGINAL DELETION LOGIC ---
            const fileName = fileToDelete;
            delete projects[fileName];
            delete editSessions[fileName]; 
            localStorage.setItem('js-ide-projects', JSON.stringify(projects));
            
            if (currentProject === fileName) {
                currentProject = Object.keys(projects)[0];
                localStorage.setItem('js-ide-active-project', currentProject);
                editor.setSession(getOrCreateSession(currentProject));
                updateHeaderTitle();
            }
            
            renderFileList();
            closeDeleteModal();
        }

        // Bind the touch & mouse events to the button
        holdDeleteBtn.addEventListener('mousedown', startDeleteHold);
        holdDeleteBtn.addEventListener('touchstart', startDeleteHold, {passive: false});
        
        holdDeleteBtn.addEventListener('mouseup', cancelDeleteHold);
        holdDeleteBtn.addEventListener('mouseleave', cancelDeleteHold);
        holdDeleteBtn.addEventListener('touchend', cancelDeleteHold);
        holdDeleteBtn.addEventListener('touchcancel', cancelDeleteHold);
