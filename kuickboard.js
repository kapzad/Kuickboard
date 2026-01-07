const canvas = document.getElementById('whiteboard');
        const ctx = canvas.getContext('2d');
        const modeIndicator = document.getElementById('mode-indicator');
        const colorIndicator = document.getElementById('color-indicator');

        // --- State Management ---
        // Load from Local Storage on startup
        let elements = JSON.parse(localStorage.getItem('whiteboard_data')) || [];
        let currentMode = 'RECTANGLE'; 
        
        // Color Management
        const colors = ['black', 'red', 'green', 'blue'];
        let colorIndex = 0;

        let isDrawing = false;
        let startX, startY;
        let hoveredElementIndex = -1;
        let isTypingLabel = false;
        let activeLabelIndex = -1;
        let globalMouseX = 0;
        let globalMouseY = 0;

        // --- Persistence Helper ---
        function save() {
            localStorage.setItem('whiteboard_data', JSON.stringify(elements));
        }

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            redraw();
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // --- Shape Recognition Logic ---
        function recognizeShape(points) {
            if (points.length < 15) return null;

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            points.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });

            const w = maxX - minX;
            const h = maxY - minY;
            if (w < 25 || h < 25) return null;

            const start = points[0];
            const end = points[points.length - 1];
            const dist = Math.hypot(start.x - end.x, start.y - end.y);
            if (dist > Math.hypot(w, h) * 0.4) return null; 

            // Circle check
            const cx = minX + w/2, cy = minY + h/2;
            let rTotal = 0;
            points.forEach(p => rTotal += Math.hypot(p.x - cx, p.y - cy));
            const avgR = rTotal / points.length;
            let cDev = 0;
            points.forEach(p => cDev += Math.abs(Math.hypot(p.x - cx, p.y - cy) - avgR));
            const cError = cDev / points.length / avgR;

            // Rect check
            let rDev = 0;
            points.forEach(p => rDev += Math.min(Math.abs(p.x-minX), Math.abs(p.x-maxX), Math.abs(p.y-minY), Math.abs(p.y-maxY)));
            const rError = rDev / points.length / ((w+h)/2);

            if (cError < 0.22 && cError < rError) return { type: 'CIRCLE', x: minX, y: minY, w, h };
            if (rError < 0.22) return { type: 'RECTANGLE', x: minX, y: minY, w, h };
            return null;
        }

        // --- Drawing ---
        function drawElement(el, context) {
            context.beginPath();
            context.lineWidth = 2;
            
            // Use stored color or default to black
            const elColor = el.color || 'black'; 

            if (el.isHovered) {
                context.strokeStyle = elColor;
                context.globalAlpha = 0.4; // Fade outline
                // Slight fill based on color
                // Simple mapping for RGBA fill
                let fillStyle = 'rgba(0,0,0,0.05)';
                if(elColor === 'red') fillStyle = 'rgba(255,0,0,0.1)';
                if(elColor === 'green') fillStyle = 'rgba(0,128,0,0.1)';
                if(elColor === 'blue') fillStyle = 'rgba(0,0,255,0.1)';
                context.fillStyle = fillStyle;
            } else {
                context.strokeStyle = elColor;
                context.globalAlpha = 1.0;
                context.fillStyle = 'transparent';
            }

            if (el.type === 'RECTANGLE') {
                context.rect(el.x, el.y, el.w, el.h);
                context.stroke();
                if(el.isHovered) context.fill();
            } else if (el.type === 'CIRCLE') {
                context.ellipse(el.x + el.w/2, el.y + el.h/2, Math.abs(el.w/2), Math.abs(el.h/2), 0, 0, 2*Math.PI);
                context.stroke();
                if(el.isHovered) context.fill();
            } else if (el.type === 'LINE') {
                context.moveTo(el.x, el.y);
                context.lineTo(el.x + el.w, el.y + el.h);
                context.stroke();
            } else if (el.type === 'PEN') {
                context.lineCap = "round";
                context.lineJoin = "round";
                if (el.points.length > 0) {
                    context.moveTo(el.points[0].x, el.points[0].y);
                    el.points.forEach(p => context.lineTo(p.x, p.y));
                    context.stroke();
                }
                context.lineCap = "butt";
                context.lineJoin = "miter";
            } else if (el.type === 'LABEL') {
                context.globalAlpha = 1.0;
                context.fillStyle = elColor;
                context.font = '16px Arial';
                context.fillText(el.text + (el === elements[activeLabelIndex] ? '|' : ''), el.x, el.y);
            }

            // Draw text inside shapes
            if ((el.type === 'RECTANGLE' || el.type === 'CIRCLE') && el.text) {
                context.globalAlpha = 1.0;
                context.fillStyle = elColor;
                context.font = '16px Arial';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(el.text, el.x + el.w/2, el.y + el.h/2);
                context.textAlign = 'left'; context.textBaseline = 'alphabetic'; // Reset
            }
            context.globalAlpha = 1.0; // Reset alpha
        }

        function redraw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            elements.forEach(el => drawElement(el, ctx));
        }

        // --- Mouse Interaction ---
        canvas.addEventListener('mousedown', e => {
            if (isTypingLabel) { 
                isTypingLabel = false; 
                activeLabelIndex = -1; 
                save(); // Save when label done
                redraw(); 
                return; 
            }
            if (e.button !== 0) return;

            isDrawing = true;
            startX = e.offsetX; startY = e.offsetY;
            
            // New element gets current selected color
            const currentColor = colors[colorIndex];

            const newEl = (currentMode === 'PEN') ? 
                { type: 'PEN', points: [{x:startX, y:startY}], color: currentColor, isHovered: false } :
                { type: currentMode, x:startX, y:startY, w:0, h:0, text:'', color: currentColor, isHovered: false };
            
            elements.push(newEl);
            redraw();
        });

        canvas.addEventListener('mousemove', e => {
            globalMouseX = e.offsetX; globalMouseY = e.offsetY;
            if (isDrawing) {
                const el = elements[elements.length - 1];
                if (currentMode === 'PEN') el.points.push({x: e.offsetX, y: e.offsetY});
                else { el.w = e.offsetX - startX; el.h = e.offsetY - startY; }
                redraw();
            } else {
                let found = false;
                hoveredElementIndex = -1;
                for (let i = elements.length - 1; i >= 0; i--) {
                    const el = elements[i];
                    if (el.type === 'RECTANGLE' || el.type === 'CIRCLE') {
                        // Collision check
                        let hit = false;
                        if (el.type === 'RECTANGLE') {
                            hit = globalMouseX >= Math.min(el.x, el.x+el.w) && globalMouseX <= Math.max(el.x, el.x+el.w) &&
                                  globalMouseY >= Math.min(el.y, el.y+el.h) && globalMouseY <= Math.max(el.y, el.y+el.h);
                        } else {
                            const cx = el.x+el.w/2, cy = el.y+el.h/2;
                            hit = (Math.pow(globalMouseX-cx, 2)/Math.pow(el.w/2, 2) + Math.pow(globalMouseY-cy, 2)/Math.pow(el.h/2, 2)) <= 1;
                        }
                        if (!found && hit) { el.isHovered = true; hoveredElementIndex = i; found = true; } 
                        else el.isHovered = false;
                    }
                }
                canvas.style.cursor = found ? 'text' : 'crosshair';
                redraw();
            }
        });

        canvas.addEventListener('mouseup', () => {
            if (!isDrawing) return;
            isDrawing = false;
            const last = elements[elements.length - 1];
            
            if (last.type === 'PEN') {
                const rec = recognizeShape(last.points);
                if (rec) { 
                    // Remove pen stroke, add recognized shape
                    elements.pop(); 
                    // Maintain the color of the pen stroke
                    elements.push({
                        ...rec, 
                        text: '', 
                        color: last.color, 
                        isHovered: false
                    }); 
                }
            } else if (Math.abs(last.w) < 5 && Math.abs(last.h) < 5) {
                elements.pop();
            }
            
            save(); // Save state
            redraw();
        });

        // --- Keyboard Handling ---
        window.addEventListener('keydown', e => {
            // ALT: Toggle Mode
            if (e.key === 'Alt') {
                e.preventDefault();
                currentMode = (currentMode === 'RECTANGLE') ? 'PEN' : 'RECTANGLE';
                modeIndicator.innerText = currentMode;
                return;
            }

            // Shortcuts with CTRL
            if (e.ctrlKey) {
                const key = e.key.toLowerCase();
                
                // O: Circle
                if (key === 'o') { e.preventDefault(); currentMode = 'CIRCLE'; modeIndicator.innerText = currentMode;}
                
                // L: Line
                if (key === 'l') { e.preventDefault(); currentMode = 'LINE'; modeIndicator.innerText = currentMode;}
                
                // Z: Undo
                if (key === 'z') { 
                    elements.pop(); 
                    isTypingLabel = false; 
                    save(); 
                    redraw(); 
                }
                
                // R: Clear All
                if (key === 'r') { 
                    e.preventDefault(); 
                    elements = []; 
                    save(); 
                    redraw(); 
                }
                
                // Q: Clear Shape Text
                if (key === 'q') {
                    e.preventDefault(); 
                    if (hoveredElementIndex !== -1) {
                        elements[hoveredElementIndex].text = '';
                        save();
                        redraw();
                    }
                }

                // K: Color Toggle
                if (key === 'k') {
                    e.preventDefault();
                    colorIndex = (colorIndex + 1) % colors.length;
                    const c = colors[colorIndex];
                    colorIndicator.innerText = c;
                    colorIndicator.style.color = c;
                    colorIndicator.style.borderColor = c;
                }
                
                return;
            }

            // Text Entry
            if (e.key.length === 1 && !e.altKey && !e.metaKey) {
                if (hoveredElementIndex !== -1) {
                    elements[hoveredElementIndex].text += e.key;
                } else {
                    if (!isTypingLabel) {
                        isTypingLabel = true;
                        // Use current active color for new labels
                        elements.push({ 
                            type: 'LABEL', 
                            x: globalMouseX, 
                            y: globalMouseY, 
                            text: e.key,
                            color: colors[colorIndex]
                        });
                        activeLabelIndex = elements.length - 1;
                    } else {
                        elements[activeLabelIndex].text += e.key;
                    }
                }
                save();
                redraw();
            }

            // Backspace
            if (e.key === 'Backspace') {
                const target = hoveredElementIndex !== -1 ? elements[hoveredElementIndex] : (isTypingLabel ? elements[activeLabelIndex] : null);
                if (target) {
                    target.text = target.text.slice(0, -1);
                    save();
                    redraw();
                }
            }
        });