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

    try {
        const eventDoc = await db.collection('events').doc(eventId).get();
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

        appContent.classList.remove('hidden');
    } catch (err) {
        console.error("Error loading event:", err);
        alert("Could not load event data.");
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
            const tablesRef = db.collection('events').doc(evId).collection('tables');
            
            const targetTotalTables = window.currentTotalTables || TOTAL_TABLES;

            // In the Firebase Web Client SDK, transaction.get() only accepts a DocumentReference, not a Query/Collection.
            // So we explicitly create references for all target tables and read them concurrently.
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
                const capacity = tableData.capacity || MAX_CAPACITY;
                
                if (tableData.count < capacity) {
                    availableTables.push(tableId);
                }
            }

            if (availableTables.length === 0) return null;

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

    function showResult(tableNumber, name) {
        if (currentAssignmentStyle === 'string_cut' && tableNumber) {
            runStringCutAnimation(tableNumber, name);
        } else {
            // Generic Display
            registrationCard.classList.add('hidden');
            resultCard.classList.remove('hidden');
            displayName.textContent = name;

            if (tableNumber) {
                proceedText.textContent = "Please proceed to your table:";
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
        const ballContainer = document.getElementById('ball-container');
        const ballNumber = document.getElementById('ball-number');
        const bowlContainer = document.getElementById('bowl-container');
        
        ballNumber.textContent = tableNumber;

        let hasCut = false;

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
                
                // Show scissor at coordinate
                scissor.style.left = `${clientX}px`;
                scissor.style.top = `${clientY}px`;
                scissor.classList.remove('hidden');
                scissor.classList.add('scissor-snip');
                
                // Cut the specific string
                document.getElementById(`string-${cutTarget}-bottom`).classList.add('cut');
                
                // Remove instructions
                document.getElementById('cut-instruction').classList.add('hidden');

                // Sequence the ball drop
                setTimeout(() => {
                    scissor.style.opacity = 0;
                    
                    // slide bowl up
                    bowlContainer.classList.add('bowl-slide-up');
                    
                    // drop ball
                    setTimeout(() => {
                        ballContainer.classList.remove('hidden');
                        ballContainer.querySelector('#ball').classList.add('ball-drop');
                        
                        // after animation completes, return to result card
                        setTimeout(() => {
                            overlay.classList.add('hidden');
                            document.getElementById('app-content').classList.remove('hidden');
                            
                            // fallback to generic result view to show name and number permanently
                            currentAssignmentStyle = 'generic'; 
                            showResult(tableNumber, name);
                            
                        }, 2500); // Wait for bounce to finish + pause
                    }, 500);
                }, 300); // Time for scissor snip to finish
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
