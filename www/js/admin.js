document.addEventListener('DOMContentLoaded', () => {
    if (!db) {
        alert("Database not configured. Please check js/firebase-config.js");
        return;
    }
    const db = firebase.firestore();

    // Force Firebase to reconnect when app comes to foreground
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            db.enableNetwork().catch(console.error);
        } else {
            db.disableNetwork().catch(console.error);
        }
    });

    // Event Elements
    const eventSelect = document.getElementById('event-select');
    const createEventBtn = document.getElementById('create-event-btn');
    const dashboardContent = document.getElementById('dashboard-content');
    const activeEventTitle = document.getElementById('active-event-title');
    const activeEventDate = document.getElementById('active-event-date');

    const createEventModal = document.getElementById('create-event-modal');
    const closeCreateEvent = document.getElementById('close-create-event');
    const createEventForm = document.getElementById('create-event-form');
    const submitEventBtn = document.getElementById('submit-event-btn');

    // Dashboard Elements
    const tablesGrid = document.getElementById('tables-grid');
    const totalGuestsCount = document.getElementById('total-guests-count');
    const tablesFilledCount = document.getElementById('tables-filled-count');
    const resetBtn = document.getElementById('reset-btn');
    const exportBtn = document.getElementById('export-btn');
    
    const modeToggle = document.getElementById('assignment-mode-toggle');
    const modeStatusText = document.getElementById('mode-status-text');
    const tablesSectionContainer = document.getElementById('tables-section-container');
    const tablesStatCard = document.getElementById('tables-stat-card');
    const attendanceListBody = document.getElementById('attendance-list-body');
    
    // QR Code elements
    const showQrBtn = document.getElementById('show-qr-btn');
    const qrModal = document.getElementById('qr-modal');
    const closeQr = document.getElementById('close-qr');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrUrlDisplay = document.getElementById('qr-url-display');
    
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;
    
    let qrCode = null;
    let attendeesData = [];
    let isTableAssignmentEnabled = false;
    let activeEventId = null;

    let unsubAttendees = null;
    let unsubTables = null;
    let unsubEvent = null;

    // Load Events
    db.collection('events').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const currentVal = eventSelect.value;
        eventSelect.innerHTML = '<option value="">-- Select an Event --</option>';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = data.title;
            eventSelect.appendChild(option);
        });

        if (currentVal && snapshot.docs.find(d => d.id === currentVal)) {
            eventSelect.value = currentVal;
        }
    });

    // Create Event Handlers
    createEventBtn.addEventListener('click', () => createEventModal.classList.remove('hidden'));
    closeCreateEvent.addEventListener('click', () => createEventModal.classList.add('hidden'));

    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('event-name').value.trim().toLowerCase().replace(/\s+/g, '-');
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;

        if (!id || !title || !date) return;
        submitEventBtn.disabled = true;

        try {
            const docRef = db.collection('events').doc(id);
            const doc = await docRef.get();
            if (doc.exists) {
                alert("An event with this short ID already exists.");
                return;
            }

            await docRef.set({
                title: title,
                date: date,
                tableAssignmentEnabled: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            createEventModal.classList.add('hidden');
            createEventForm.reset();
            eventSelect.value = id;
            loadEvent(id);
        } catch (err) {
            console.error(err);
            alert("Error creating event.");
        } finally {
            submitEventBtn.disabled = false;
        }
    });

    // Handle Event Selection
    eventSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            document.getElementById('welcome-hero').classList.add('hidden');
            loadEvent(e.target.value);
        } else {
            dashboardContent.classList.add('hidden');
            document.getElementById('welcome-hero').classList.remove('hidden');
            activeEventId = null;
        }
    });

    // Load global guest suggestions for manual check-in
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

    function loadEvent(eventId) {
        activeEventId = eventId;
        dashboardContent.classList.remove('hidden');

        if (unsubEvent) unsubEvent();
        if (unsubAttendees) unsubAttendees();
        if (unsubTables) unsubTables();

        // Listen to Event Settings
        unsubEvent = db.collection('events').doc(eventId).onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            activeEventTitle.textContent = data.title;
            activeEventDate.textContent = data.date;
            isTableAssignmentEnabled = data.tableAssignmentEnabled || false;
            
            // Set dynamic total tables (default 10)
            const dynamicTotalTables = data.totalTables || 10;
            document.getElementById('total-tables-setting').value = dynamicTotalTables;
            // Store globally so tables listener can use it
            window.currentTotalTables = dynamicTotalTables;

            modeToggle.checked = isTableAssignmentEnabled;
            modeStatusText.textContent = `Random Table Assignment: ${isTableAssignmentEnabled ? 'ON' : 'OFF'}`;
            
            if (isTableAssignmentEnabled) {
                tablesSectionContainer.classList.remove('hidden');
                tablesStatCard.style.display = 'block';
                document.querySelectorAll('.table-col').forEach(el => el.classList.remove('hidden'));
            } else {
                tablesSectionContainer.classList.add('hidden');
                tablesStatCard.style.display = 'none';
                document.querySelectorAll('.table-col').forEach(el => el.classList.add('hidden'));
            }
        });

        // Listen to Attendees
        unsubAttendees = db.collection('events').doc(eventId).collection('attendees').orderBy('timestamp', 'asc').onSnapshot(snapshot => {
            attendeesData = [];
            attendanceListBody.innerHTML = '';
            let count = 0;

            snapshot.forEach(doc => {
                count++;
                const data = doc.data();
                attendeesData.push({ id: doc.id, ...data });
                
                const timeString = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : 'N/A';
                const tableString = data.tableNumber ? `Table ${data.tableNumber}` : 'Unassigned';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${data.name}</td>
                    <td>${timeString}</td>
                    <td class="table-col ${isTableAssignmentEnabled ? '' : 'hidden'}">${tableString}</td>
                    <td>
                        <button class="edit-btn secondary-btn" data-id="${doc.id}" data-name="${data.name}" data-table="${data.tableNumber || ''}" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">Edit</button>
                        <button class="delete-btn primary-btn" data-id="${doc.id}" data-table="${data.tableNumber || ''}" data-name="${data.name}" style="padding: 4px 8px; font-size: 12px; background-color: var(--danger);">Delete</button>
                    </td>
                `;
                attendanceListBody.appendChild(tr);
            });
            totalGuestsCount.textContent = count;
        });

        // Listen to Tables
        unsubTables = db.collection('events').doc(eventId).collection('tables').onSnapshot(snapshot => {
            let tablesData = {};
            let fullTables = 0;

            snapshot.forEach(doc => tablesData[doc.id] = doc.data());
            tablesGrid.innerHTML = ''; 

            const targetTotalTables = window.currentTotalTables || TOTAL_TABLES;
            // Calculate max table number based on data, defaulting to at least the set target total
            const tableIds = Object.keys(tablesData).map(id => parseInt(id, 10));
            const maxTable = Math.max(targetTotalTables, ...tableIds, 0);

            for (let i = 1; i <= maxTable; i++) {
                const tableId = i.toString();
                const data = tablesData[tableId] || { count: 0, guests: [] };
                const cap = data.capacity || MAX_CAPACITY;
                if (data.count >= cap) fullTables++;
                renderTableCard(tableId, data);
            }
            tablesFilledCount.textContent = `${fullTables} / ${targetTotalTables}`;
        });
    }

    function renderTableCard(tableId, data) {
        const capacity = data.capacity || MAX_CAPACITY;
        const card = document.createElement('div');
        card.className = `table-card ${data.count >= capacity ? 'full' : (data.count > 0 ? 'active' : '')}`;
        
        let guestsHtml = '';
        for (let i = 0; i < capacity; i++) {
            if (i < data.count) {
                guestsHtml += `<li>${data.guests[i]}</li>`;
            } else {
                guestsHtml += `<li class="empty-seat">Empty seat</li>`;
            }
        }

        card.innerHTML = `
            <div class="table-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0;">Table ${tableId}</h3>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span class="table-count" style="margin: 0;">${data.count}/${capacity}</span>
                    <button class="edit-capacity-btn" data-id="${tableId}" data-cap="${capacity}" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px;" title="Edit Capacity">✎</button>
                </div>
            </div>
            <ul class="guest-list">
                ${guestsHtml}
            </ul>
        `;
        tablesGrid.appendChild(card);
    }

    // Handle Table Grid Actions (like Edit Capacity)
    tablesGrid.addEventListener('click', (e) => {
        if (!activeEventId) return;

        // Traverse up to find the button if an icon was clicked
        let target = e.target;
        while (target && target !== tablesGrid && !target.classList.contains('edit-capacity-btn')) {
            target = target.parentElement;
        }

        if (target && target.classList.contains('edit-capacity-btn')) {
            const tableId = target.getAttribute('data-id');
            const currentCap = target.getAttribute('data-cap');

            const newCapRaw = prompt(`Enter new capacity for Table ${tableId}:`, currentCap);
            if (newCapRaw === null) return;
            const newCap = parseInt(newCapRaw, 10);

            if (isNaN(newCap) || newCap < 1) {
                alert("Please enter a valid number greater than 0.");
                return;
            }

            db.collection('events').doc(activeEventId).collection('tables').doc(tableId).set({
                capacity: newCap
            }, { merge: true }).catch(err => {
                console.error("Error updating table capacity:", err);
                alert("Failed to update capacity.");
            });
        }
    });

    // Toggle Mode
    modeToggle.addEventListener('change', (e) => {
        if (!activeEventId) return;
        db.collection('events').doc(activeEventId).update({
            tableAssignmentEnabled: e.target.checked
        }).catch(err => console.error(err));
    });

    // Save total tables config
    document.getElementById('save-tables-btn').addEventListener('click', () => {
        if (!activeEventId) return;
        const newTotal = parseInt(document.getElementById('total-tables-setting').value, 10);
        if (newTotal > 0) {
            db.collection('events').doc(activeEventId).update({
                totalTables: newTotal
            }).then(() => alert("Total tables updated successfully!"))
              .catch(err => console.error(err));
        }
    });

    // Export to Excel/CSV
    exportBtn.addEventListener('click', () => {
        if (attendeesData.length === 0) {
            alert("No attendees to export yet!");
            return;
        }

        let csvContent = "No.,Name,Time Checked In,Assigned Table\n";

        attendeesData.forEach((row, index) => {
            const timeString = row.timestamp ? new Date(row.timestamp.toDate()).toLocaleString() : 'N/A';
            const tableString = row.tableNumber || 'N/A';
            const name = `"${row.name.replace(/"/g, '""')}"`;
            csvContent += `${index + 1},${name},"${timeString}",${tableString}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `attendance_${activeEventTitle.textContent}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // Handle Edit / Delete Attendee
    attendanceListBody.addEventListener('click', async (e) => {
        if (!activeEventId) return;

        const target = e.target;
        if (target.classList.contains('delete-btn')) {
            const id = target.getAttribute('data-id');
            const name = target.getAttribute('data-name');
            const table = target.getAttribute('data-table');

            if (confirm(`Are you sure you want to delete ${name}?`)) {
                try {
                    if (table) {
                        // Remove from table
                        await db.runTransaction(async (t) => {
                            const tableRef = db.collection('events').doc(activeEventId).collection('tables').doc(table);
                            const doc = await t.get(tableRef);
                            if (doc.exists) {
                                const data = doc.data();
                                const newGuests = data.guests.filter(g => g !== name);
                                t.update(tableRef, {
                                    count: Math.max(0, data.count - 1),
                                    guests: newGuests
                                });
                            }
                        });
                    }
                    // Delete attendee record
                    await db.collection('events').doc(activeEventId).collection('attendees').doc(id).delete();
                } catch (err) {
                    console.error("Error deleting:", err);
                    alert("Failed to delete attendee.");
                }
            }
        }

        if (target.classList.contains('edit-btn')) {
            const id = target.getAttribute('data-id');
            const oldName = target.getAttribute('data-name');
            const oldTable = target.getAttribute('data-table');

            const newName = prompt("Edit Guest Name:", oldName);
            if (newName === null) return;
            
            const newTableRaw = prompt("Edit Assigned Table Number (leave blank to unassign):", oldTable);
            if (newTableRaw === null) return;
            const newTable = newTableRaw.trim();

            try {
                // If table changed, we must transactionally swap tables
                if (oldTable !== newTable) {
                    await db.runTransaction(async (t) => {
                        // Remove from old table
                        if (oldTable) {
                            const oldTableRef = db.collection('events').doc(activeEventId).collection('tables').doc(oldTable);
                            const oldDoc = await t.get(oldTableRef);
                            if (oldDoc.exists) {
                                const data = oldDoc.data();
                                const newGuests = data.guests.filter(g => g !== oldName);
                                t.update(oldTableRef, {
                                    count: Math.max(0, data.count - 1),
                                    guests: newGuests
                                });
                            }
                        }
                        // Add to new table
                        if (newTable) {
                            const newTableRef = db.collection('events').doc(activeEventId).collection('tables').doc(newTable);
                            const newDoc = await t.get(newTableRef);
                            const data = newDoc.exists ? newDoc.data() : { count: 0, guests: [] };
                            t.set(newTableRef, {
                                count: data.count + 1,
                                guests: [...data.guests, newName.trim()]
                            });
                        }
                    });
                } else if (oldName !== newName.trim() && oldTable) {
                    // Name changed but table same -> update name in table array
                    await db.runTransaction(async (t) => {
                        const tableRef = db.collection('events').doc(activeEventId).collection('tables').doc(oldTable);
                        const doc = await t.get(tableRef);
                        if (doc.exists) {
                            const data = doc.data();
                            const newGuests = data.guests.map(g => g === oldName ? newName.trim() : g);
                            t.update(tableRef, { guests: newGuests });
                        }
                    });
                }

                // Update attendee record
                await db.collection('events').doc(activeEventId).collection('attendees').doc(id).update({
                    name: newName.trim(),
                    tableNumber: newTable || null
                });

            } catch (err) {
                console.error("Error editing:", err);
                alert("Failed to edit attendee.");
            }
        }
    });

    // Reset Event
    resetBtn.addEventListener('click', async () => {
        if (!activeEventId) return;
        if (confirm('Are you sure you want to reset ALL tables and DELETE the attendance list for this event? Export your list first!')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            
            try {
                const batch = db.batch();
                const eventRef = db.collection('events').doc(activeEventId);
                
                const tablesSnapshot = await eventRef.collection('tables').get();
                tablesSnapshot.forEach(doc => batch.delete(doc.ref));
                
                const attendeesSnapshot = await eventRef.collection('attendees').get();
                attendeesSnapshot.forEach(doc => batch.delete(doc.ref));
                
                await batch.commit();
                alert('Event successfully reset!');
            } catch (error) {
                console.error(error);
                alert('Error resetting.');
            } finally {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Reset This Event';
            }
        }
    });

    // Delete Event
    document.getElementById('delete-event-btn').addEventListener('click', async () => {
        if (!activeEventId) return;

        const confirmDelete = confirm("Are you sure you want to completely DELETE this event? This action cannot be undone.");
        if (!confirmDelete) return;

        try {
            const eventRef = db.collection('events').doc(activeEventId);
            const batch = db.batch();
            
            const attendeesSnapshot = await eventRef.collection('attendees').get();
            attendeesSnapshot.forEach(doc => batch.delete(doc.ref));

            const tablesSnapshot = await eventRef.collection('tables').get();
            tablesSnapshot.forEach(doc => batch.delete(doc.ref));

            batch.delete(eventRef);
            await batch.commit();

            alert("Event successfully deleted.");
            
            document.querySelector(`#event-select option[value="${activeEventId}"]`).remove();
            eventSelect.value = "";
            activeEventId = null;
            dashboardContent.classList.add('hidden');
            document.getElementById('welcome-hero').classList.remove('hidden');

            if (unsubEvent) unsubEvent();
            if (unsubAttendees) unsubAttendees();
            if (unsubTables) unsubTables();
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("Failed to delete event.");
        }
    });

    // QR Code
    showQrBtn.addEventListener('click', () => {
        if (!activeEventId) return;
        qrModal.classList.remove('hidden');
        
        let appUrl = `https://JeferBayona.github.io/table-designator/?eventId=${activeEventId}`;
        
        qrUrlDisplay.textContent = appUrl;

        qrcodeContainer.innerHTML = ''; // clear previous
        qrCode = new QRCode(qrcodeContainer, {
            text: appUrl,
            width: 256,
            height: 256,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    });

    closeQr.addEventListener('click', () => qrModal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.add('hidden');
    });

    // Manual Check-In
    document.getElementById('manual-checkin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeEventId) return;

        const nameInput = document.getElementById('manual-guest-name');
        const tableInput = document.getElementById('manual-table-number');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const guestName = nameInput.value.trim();
        const tableNumber = tableInput.value.trim();

        if (!guestName) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        try {
            if (tableNumber) {
                // Assign to specific table (bypassing capacity limits for manual overrides)
                await db.runTransaction(async (transaction) => {
                    const tableRef = db.collection('events').doc(activeEventId).collection('tables').doc(tableNumber);
                    // Create refs up to tableNumber to avoid collection queries
                    const tableDoc = await transaction.get(tableRef);
                    
                    const tableData = tableDoc.exists ? tableDoc.data() : { count: 0, guests: [] };
                    
                    transaction.set(tableRef, {
                        count: tableData.count + 1,
                        guests: [...tableData.guests, guestName]
                    });
                });
            }

            // Record guest globally for auto-suggest
            db.collection('guests').doc(guestName.toLowerCase().replace(/[^a-z0-9]/g, '')).set({
                name: guestName
            }, { merge: true }).catch(console.error);

            // Add to attendees list
            await db.collection('events').doc(activeEventId).collection('attendees').add({
                name: guestName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tableNumber: tableNumber || null
            });

            // Reset form
            nameInput.value = '';
            tableInput.value = '';
            alert("Guest added successfully!");
        } catch (error) {
            console.error("Error adding guest manually:", error);
            alert("Failed to add guest manually.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Person';
        }
    });
});
