
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

        // 2. Auto-Save Logic
        const savedCode = localStorage.getItem('js-ide-autosave');
        if (savedCode) {
            editor.setValue(savedCode, 1);
        }

        let saveTimeout;
        editor.session.on('change', function() {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                localStorage.setItem('js-ide-autosave', editor.getValue());
                const statusInd = document.getElementById('status-indicator');
                if(statusInd) {
                     statusInd.innerHTML = "● Saved";
                     statusInd.style.color = "#94a3b8"; 
                }
            }, 1000);
        });
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
                    if (node.classList && node.classList.contains('ace_mobile-menu')) {
                        injectCloseButton(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('.ace_mobile-menu').forEach(injectCloseButton);
                    }
                });
            });
        });

        menuWatcher.observe(document.body, { childList: true, subtree: true });

      

        // --- KEYBOARD FIX (VISUAL VIEWPORT API) ---
        // This effectively listens to the keyboard opening/closing
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const height = window.visualViewport.height;
                // Force Main Layout to match visible area minus Header (50px)
                const headerHeight = 50; 
                document.getElementById('main-layout').style.height = `${height - headerHeight}px`;
                
                // Ensure we scroll to top so header isn't pushed off
                window.scrollTo(0, 0);
                
                // Redraw Editor
                editor.resize();
            });
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

                if (typeof message === 'object' && message !== null) {
                    try {
                        entry.textContent = JSON.stringify(message, null, 2);
                        entry.style.fontFamily = 'monospace';
                        entry.style.whiteSpace = 'pre';
                    } catch(e) {
                        entry.textContent = "[Circular Object]";
                    }
                } else {
                    entry.textContent = String(message);
                }
                
                outputDiv.appendChild(entry);
                outputDiv.scrollTop = outputDiv.scrollHeight;
            } catch (err) {
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
        async function runCode() {
            const statusInd = document.getElementById('status-indicator');
            statusInd.innerHTML = "● Running...";
            statusInd.style.color = "#f59e0b";

            if (isCollapsed) toggleConsoleState();

            const code = editor.getValue();
            appendToConsole("--- Executing ---", "system");

            setTimeout(async () => { 
                try {
                    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                    const runFunc = new AsyncFunction(code); 
                    await runFunc(); 
                    
                    statusInd.innerHTML = "● Success";
                    statusInd.style.color = "#10b981";
                } catch (err) {
                    console.error(err.toString());
                    statusInd.innerHTML = "● Error";
                    statusInd.style.color = "#ef4444";
                }
            }, 10);
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

        // --- QUICK BAR ---
        const keys = [
            { label: "{", val: "{}" }, 
            { label: "}", val: "}" },
            { label: "(", val: "()" }, 
            { label: ")", val: ")" },
            { label: "[", val: "[]" }, 
            { label: "]", val: "]" },
            { label: ";", val: ";" }, 
            { label: "=", val: " = " },
            { label: "=>", val: " => " },
            { label: "!=", val: " != " },
            { label: "&&", val: " && " },
            { label: "||", val: " || " },
            { label: "let", val: "let " },
            { label: "const", val: "const " },
            { label: "func", val: "function() {\n\t\n}" },
            { label: "log", val: "console.log()" }
        ];

                // --- UPGRADED QUICK BAR WITH REORDERING ---
        const keysContainer = document.getElementById('keys-container');
        const layoutIcon = document.getElementById('layout-icon');

        // Load saved order from localStorage or use default
        let savedOrder = JSON.parse(localStorage.getItem('quick-bar-order'));
        const currentKeys = savedOrder || keys;

        function renderKeys() {
            keysContainer.innerHTML = ''; // Clear existing
            currentKeys.forEach((k, index) => {
                const btn = document.createElement('div');
                btn.className = 'code-key';
                btn.textContent = k.label;
                btn.dataset.index = index;
                
                // --- LONG PRESS & DRAG LOGIC ---
                let pressTimer;
                
                const startPress = (e) => {
                    pressTimer = setTimeout(() => {
                        initiateDrag(btn, e);
                    }, 500); // 500ms for long press
                };

                const cancelPress = () => {
                    clearTimeout(pressTimer);
                };

                // Normal Click (Insert Code)
                btn.onclick = (e) => {
                    e.preventDefault();
                    editor.insert(k.val);
                    editor.focus();
                    if (["()", "{}", "[]", '""', "''"].includes(k.val)) editor.navigateLeft(1);
                    if (k.label === "log") editor.navigateLeft(1);
                };

                // Listeners for Long Press
                btn.addEventListener('touchstart', startPress, {passive: true});
                btn.addEventListener('touchend', cancelPress);
                btn.addEventListener('touchmove', cancelPress);
                btn.addEventListener('mousedown', startPress);
                btn.addEventListener('mouseup', cancelPress);

                keysContainer.appendChild(btn);
            });
        }

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

           