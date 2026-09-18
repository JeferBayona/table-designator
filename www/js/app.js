document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('assignment-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const registrationCard = document.getElementById('registration-card');
    const resultCard = document.getElementById('result-card');
    
    const tableNumberContainer = document.getElementById('table-number-container');
    const tableNumberDisplay = document.getElementById('assigned-table-number');
    const proceedText = document.getElementById('proceed-text');
    const displayName = document.getElementById('display-name');

    const noEventState = document.getElementById('no-event-state');
    const appContent = document.getElementById('app-content');
    const eventTitleDisplay = document.getElementById('event-title-display');
    
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;
    
    let isTableAssignmentEnabled = false;
    let currentAssignmentStyle = 'generic';

    // Get eventId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');

    if (!eventId) {
        noEventState.classList.remove('hidden');
        return;
    }

    if (!db) {
        alert("Database not configured.");
        return;
    }

    noEventState.classList.remove('hidden');
    noEventState.innerHTML = '<h2>Loading event...</h2><p>Please wait.</p>';

    try {
        // Add a 7-second timeout to prevent infinite hanging for QR scans on bad connections
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network timeout")), 7000));
        const fetchPromise = db.collection('events').doc(eventId).get();
        const eventDoc = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!eventDoc.exists) {
            noEventState.classList.remove('hidden');
            noEventState.innerHTML = '<h2 style="color: var(--danger);">Event Not Found</h2><p>This event does not exist or has been removed.</p>';
            return;
        }

        const eventData = eventDoc.data();
        eventTitleDisplay.textContent = `Welcome to ${eventData.title}`;
        
        // Listen to event settings real-time
        db.collection('events').doc(eventId).onSnapshot(doc => {
            if (doc.exists) {
                isTableAssignmentEnabled = doc.data().tableAssignmentEnabled || false;
                window.currentTotalTables = doc.data().totalTables || 10;
                window.currentTableCapacity = doc.data().tableCapacity || 4;
                currentAssignmentStyle = doc.data().assignmentStyle || 'generic';
            }
        });

        // Load global guest suggestions
        db.collection('guests').get().then(snapshot => {
            const datalist = document.getElementById('guest-suggestions');
            if (datalist) {
                snapshot.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.data().name;
                    datalist.appendChild(option);
                });
            }
        });

        noEventState.classList.add('hidden');
        appContent.classList.remove('hidden');
    } catch (err) {
        console.error("Error loading event:", err);
        noEventState.classList.remove('hidden');
        noEventState.innerHTML = '<h2 style="color: var(--danger);">Connection Error</h2><p>Could not load the event. Your connection might be too slow or offline.</p><button onclick="window.location.reload()" class="primary-btn" style="margin-top: 15px;">Try Again</button>';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const guestInput = document.getElementById('guest-name');
        const guestName = guestInput.value.trim();

        if (!guestName) return;

        // Check local storage for this specific event
        const localKeyName = `checkedInName_${eventId}`;
        const localKeyTable = `assignedTable_${eventId}`;

        if (localStorage.getItem(localKeyName) === guestName) {
            const savedTable = localStorage.getItem(localKeyTable);
            showResult(savedTable, guestName);
            return;
        }

        setLoading(true);
        errorMessage.classList.add('hidden');

        try {
            // Record guest globally for future auto-suggest
            db.collection('guests').doc(guestName.toLowerCase().replace(/[^a-z0-9]/g, '')).set({
                name: guestName
            }, { merge: true }).catch(console.error);

            let assignedTable = null;

            if (isTableAssignmentEnabled) {
                assignedTable = await assignRandomTable(guestName, eventId);
                if (!assignedTable) {
                    showError("All tables are currently full! Please see the organizer.");
                    setLoading(false);
                    return;
                }
            }

            // Add to event's attendees collection
            await db.collection('events').doc(eventId).collection('attendees').add({
                name: guestName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tableNumber: assignedTable
            });

            localStorage.setItem(localKeyName, guestName);
            if (assignedTable) {
                localStorage.setItem(localKeyTable, assignedTable);
            }
            
            showResult(assignedTable, guestName);
        } catch (error) {
            console.error("Assignment error:", error);
            showError("An error occurred while checking in. Please try again.");
        } finally {
            setLoading(false);
        }
    });

    async function assignRandomTable(guestName, evId) {
        return await db.runTransaction(async (transaction) => {
            const eventRef = db.collection('events').doc(evId);
            const tablesRef = eventRef.collection('tables');
            
            // Re-fetch event inside transaction to get accurate totalTables
            const eventDoc = await transaction.get(eventRef);
            let targetTotalTables = eventDoc.data().totalTables || window.currentTotalTables || 10;
            const targetCapacity = eventDoc.data().tableCapacity || window.currentTableCapacity || 4;

            const tableRefs = [];
            for (let i = 1; i <= targetTotalTables; i++) {
                tableRefs.push(tablesRef.doc(i.toString()));
            }

            const snapshots = await Promise.all(tableRefs.map(ref => transaction.get(ref)));
            
            let availableTables = [];
            let existingTablesData = {};

            snapshots.forEach((doc, index) => {
                const tableId = (index + 1).toString();
                if (doc.exists) {
                    existingTablesData[tableId] = doc.data();
                }
            });

            for (let i = 1; i <= targetTotalTables; i++) {
                const tableId = i.toString();
                const tableData = existingTablesData[tableId] || { count: 0, guests: [] };
                
                if (tableData.count < targetCapacity) {
                    availableTables.push(tableId);
                }
            }

            // If no available tables, auto-expand total tables by 1
            if (availableTables.length === 0) {
                targetTotalTables += 1;
                const newTableId = targetTotalTables.toString();
                
                transaction.update(eventRef, { totalTables: targetTotalTables });
                
                const newTableRef = tablesRef.doc(newTableId);
                transaction.set(newTableRef, {
                    count: 1,
                    guests: [guestName]
                });
                return newTableId;
            }

            // Normal assignment to random available table
            const randomIdx = Math.floor(Math.random() * availableTables.length);
            const selectedTableId = availableTables[randomIdx];
            const tableRef = tablesRef.doc(selectedTableId);
            const tableData = existingTablesData[selectedTableId] || { count: 0, guests: [] };
            
            transaction.set(tableRef, {
                count: tableData.count + 1,
                guests: [...tableData.guests, guestName]
            });

            return selectedTableId;
        });
    }

    function showResult(tableNumber, name, customPhrase = null) {
        const localKeyPhrase = `assignedPhrase_${eventId}`;
        
        if (customPhrase) {
            localStorage.setItem(localKeyPhrase, customPhrase);
        } else {
            customPhrase = localStorage.getItem(localKeyPhrase);
        }

        if (currentAssignmentStyle === 'string_cut' && tableNumber) {
            runStringCutAnimation(tableNumber, name);
        } else {
            // Generic Display
            registrationCard.classList.add('hidden');
            resultCard.classList.remove('hidden');
            displayName.textContent = name;

            if (tableNumber) {
                proceedText.textContent = customPhrase || "Please proceed to your table:";
                tableNumberContainer.classList.remove('hidden');
                tableNumberDisplay.textContent = tableNumber;
            } else {
                proceedText.textContent = "You have successfully checked in.";
                tableNumberContainer.classList.add('hidden');
            }
        }
    }

    function runStringCutAnimation(tableNumber, name) {
        // Hide standard UI
        registrationCard.classList.add('hidden');
        document.getElementById('app-content').classList.add('hidden');
        
        const overlay = document.getElementById('animation-overlay');
        overlay.classList.remove('hidden');
        
        const scissor = document.getElementById('scissor');
        const winningBallNumber = document.getElementById('winning-ball-number');
        
        winningBallNumber.textContent = tableNumber;

        let hasCut = false;
        
        const JUGGLE_OPTIONS = [
            { text: "Marupok Ako", result: "Marupok ako, kaya doon ako sa Table" },
            { text: "Independent", result: "Independent ako, kaya swak ako sa Table" },
            { text: "God's Best", result: "Waiting for God's best, mag-rest muna sa Table" },
            { text: "Single & Happy", result: "Single and happy, kaya parati sa Table" },
            { text: "Content", result: "Content in Christ, ang the highest ay Table" },
            { text: "Praying for The One", result: "Praying for The One, for fun sa Table" }
        ];

        function handleMove(e) {
            if (hasCut) return;
            
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // Check if pointer intersects any string wrapper
            const redWrapper = document.getElementById('string-red-wrapper').getBoundingClientRect();
            const greenWrapper = document.getElementById('string-green-wrapper').getBoundingClientRect();
            
            let cutTarget = null;
            
            if (clientX >= redWrapper.left && clientX <= redWrapper.right && clientY >= redWrapper.top && clientY <= redWrapper.bottom) {
                cutTarget = 'red';
            } else if (clientX >= greenWrapper.left && clientX <= greenWrapper.right && clientY >= greenWrapper.top && clientY <= greenWrapper.bottom) {
                cutTarget = 'green';
            }

            if (cutTarget) {
                hasCut = true;
                
                scissor.style.left = `${clientX}px`;
                scissor.style.top = `${clientY}px`;
                scissor.classList.remove('hidden');
                scissor.classList.add('scissor-snip');
                
                document.getElementById(`string-${cutTarget}-bottom`).classList.add('cut');
                document.getElementById('cut-instruction').classList.add('hidden');

                // Wait for the heart to fall (1s animation) before showing fishbowl
                setTimeout(() => {
                    scissor.style.opacity = 0;
                    
                    const fishbowlStage = document.getElementById('fishbowl-stage');
                    fishbowlStage.classList.remove('hidden');
                    // Force reflow
                    void fishbowlStage.offsetWidth;
                    fishbowlStage.classList.add('bowl-slide-up');
                    
                    const juggleText = document.getElementById('juggle-text');
                    juggleText.classList.remove('hidden');
                    
                    // Generate fake balls to bounce around completely randomly
                    const lotteryBallsContainer = document.getElementById('lottery-balls');
                    lotteryBallsContainer.innerHTML = '';
                    for (let i = 0; i < 15; i++) {
                        const ball = document.createElement('div');
                        ball.className = 'lottery-ball';
                        ball.textContent = Math.floor(Math.random() * 20) + 1;
                        
                        // Random movement using Web Animations API
                        ball.animate([
                            { transform: 'translate(0, 0) rotate(0deg)' },
                            { transform: `translate(${Math.random()*160 - 80}px, ${-Math.random()*150}px) rotate(90deg)` },
                            { transform: `translate(${Math.random()*160 - 80}px, ${-Math.random()*220}px) rotate(180deg)` },
                            { transform: `translate(${Math.random()*160 - 80}px, ${-Math.random()*150}px) rotate(270deg)` },
                            { transform: 'translate(0, 0) rotate(360deg)' }
                        ], {
                            duration: 400 + Math.random() * 600,
                            iterations: Infinity,
                            direction: 'alternate',
                            easing: 'ease-in-out'
                        });
                        
                        lotteryBallsContainer.appendChild(ball);
                    }
                    
                    // Start juggling words
                    let juggleInterval = setInterval(() => {
                        const randomOpt = JUGGLE_OPTIONS[Math.floor(Math.random() * JUGGLE_OPTIONS.length)];
                        juggleText.textContent = randomOpt.text;
                        juggleText.classList.remove('juggle-flip');
                        void juggleText.offsetWidth; // trigger reflow
                        juggleText.classList.add('juggle-flip');
                    }, 250); // Slower interval
                    
                    // draw out the winning ball
                    setTimeout(() => {
                        clearInterval(juggleInterval);
                        
                        // Stop balls tumbling
                        lotteryBallsContainer.innerHTML = '';
                        
                        const finalOpt = JUGGLE_OPTIONS[Math.floor(Math.random() * JUGGLE_OPTIONS.length)];
                        juggleText.textContent = finalOpt.text;
                        juggleText.classList.remove('juggle-flip');
                        void juggleText.offsetWidth;
                        juggleText.classList.add('juggle-flip');
                        
                        const winningBall = document.getElementById('winning-ball');
                        document.getElementById('winning-ball-number').textContent = tableNumber;
                        winningBall.classList.remove('hidden');
                        winningBall.classList.add('ball-draw-out');
                        
                        // after animation completes, return to result card
                        setTimeout(() => {
                            overlay.classList.add('hidden');
                            document.getElementById('app-content').classList.remove('hidden');
                            
                            currentAssignmentStyle = 'generic'; 
                            showResult(tableNumber, name, finalOpt.result);
                            
                        }, 3500); // Slower exit wait
                    }, 3500); // 3.5s for juggling balls to build suspense
                }, 1000); // Wait 1s for the heart to fall down
            }
        }

        // Add event listeners for swiping/moving
        overlay.addEventListener('touchmove', handleMove);
        overlay.addEventListener('mousemove', handleMove);
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Checking in...' : 'Check In';
        if (isLoading) errorMessage.classList.add('hidden');
    }
});
