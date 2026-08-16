document.addEventListener('DOMContentLoaded', () => {
    if (!db) {
        alert("Database not configured. Please check js/firebase-config.js");
        return;
    }

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
                attendeesData.push(data);
                
                const timeString = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString() : 'N/A';
                const tableString = data.tableNumber ? `Table ${data.tableNumber}` : '-';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${count}</td>
                    <td><strong>${data.name}</strong></td>
                    <td>${timeString}</td>
                    <td class="table-col ${isTableAssignmentEnabled ? '' : 'hidden'}">${tableString}</td>
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

            for (let i = 1; i <= TOTAL_TABLES; i++) {
                const tableId = i.toString();
                const data = tablesData[tableId] || { count: 0, guests: [] };
                if (data.count === MAX_CAPACITY) fullTables++;
                renderTableCard(tableId, data);
            }
            tablesFilledCount.textContent = `${fullTables} / ${TOTAL_TABLES}`;
        });
    }

    function renderTableCard(tableId, data) {
        const card = document.createElement('div');
        card.className = `table-card ${data.count === MAX_CAPACITY ? 'full' : (data.count > 0 ? 'active' : '')}`;
        
        let guestsHtml = '';
        for (let i = 0; i < MAX_CAPACITY; i++) {
            if (i < data.count) {
                guestsHtml += `<li>${data.guests[i]}</li>`;
            } else {
                guestsHtml += `<li class="empty-seat">Empty seat</li>`;
            }
        }

        card.innerHTML = `
            <div class="table-header">
                <h3>Table ${tableId}</h3>
                <span class="table-count">${data.count}/${MAX_CAPACITY}</span>
            </div>
            <ul class="guest-list">
                ${guestsHtml}
            </ul>
        `;
        tablesGrid.appendChild(card);
    }

    // Toggle Mode
    modeToggle.addEventListener('change', (e) => {
        if (!activeEventId) return;
        db.collection('events').doc(activeEventId).update({
            tableAssignmentEnabled: e.target.checked
        }).catch(err => console.error(err));
    });

    // Export to Excel/CSV
    exportBtn.addEventListener('click', () => {
        if (attendeesData.length === 0) {
            alert("No attendees to export yet!");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "No.,Name,Time Checked In,Assigned Table\n";

        attendeesData.forEach((row, index) => {
            const timeString = row.timestamp ? new Date(row.timestamp.toDate()).toLocaleString() : 'N/A';
            const tableString = row.tableNumber || 'N/A';
            const name = `"${row.name.replace(/"/g, '""')}"`;
            csvContent += `${index + 1},${name},"${timeString}",${tableString}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${activeEventId}_attendance.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
});
