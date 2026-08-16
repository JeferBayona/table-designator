document.addEventListener('DOMContentLoaded', () => {
    if (!db) {
        alert("Database not configured. Please check js/firebase-config.js");
        return;
    }

    const tablesGrid = document.getElementById('tables-grid');
    const totalGuestsCount = document.getElementById('total-guests-count');
    const tablesFilledCount = document.getElementById('tables-filled-count');
    const resetBtn = document.getElementById('reset-btn');
    const exportBtn = document.getElementById('export-btn');
    
    // Toggle elements
    const modeToggle = document.getElementById('assignment-mode-toggle');
    const modeStatusText = document.getElementById('mode-status-text');
    const tablesSectionContainer = document.getElementById('tables-section-container');
    const tablesStatCard = document.getElementById('tables-stat-card');
    const tableCols = document.querySelectorAll('.table-col');

    // Attendance List
    const attendanceListBody = document.getElementById('attendance-list-body');
    
    // QR Code elements
    const showQrBtn = document.getElementById('show-qr-btn');
    const qrModal = document.getElementById('qr-modal');
    const closeBtn = document.querySelector('.close-btn');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrUrlDisplay = document.getElementById('qr-url-display');
    
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;
    let qrCode = null;
    let attendeesData = [];
    let isTableAssignmentEnabled = false;

    // Listen to Global Settings
    db.collection('settings').doc('event').onSnapshot(doc => {
        if (doc.exists) {
            isTableAssignmentEnabled = doc.data().tableAssignmentEnabled || false;
        } else {
            // Initialize if not exists
            db.collection('settings').doc('event').set({ tableAssignmentEnabled: false });
            isTableAssignmentEnabled = false;
        }

        // Update UI based on mode
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

    // Handle Toggle Change
    modeToggle.addEventListener('change', (e) => {
        db.collection('settings').doc('event').update({
            tableAssignmentEnabled: e.target.checked
        }).catch(err => console.error("Error updating settings:", err));
    });

    // Listen for real-time attendees
    db.collection('attendees').orderBy('timestamp', 'asc').onSnapshot(snapshot => {
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

    // Listen for real-time tables
    db.collection('tables').onSnapshot(snapshot => {
        let tablesData = {};
        let fullTables = 0;

        snapshot.forEach(doc => {
            tablesData[doc.id] = doc.data();
        });

        tablesGrid.innerHTML = ''; // Clear current grid

        for (let i = 1; i <= TOTAL_TABLES; i++) {
            const tableId = i.toString();
            const data = tablesData[tableId] || { count: 0, guests: [] };
            
            if (data.count === MAX_CAPACITY) fullTables++;
            renderTableCard(tableId, data);
        }

        tablesFilledCount.textContent = `${fullTables} / ${TOTAL_TABLES}`;
    });

    function renderTableCard(tableId, data) {
        const card = document.createElement('div');
        card.className = `table-card ${data.count === MAX_CAPACITY ? 'full' : (data.count > 0 ? 'active' : '')}`;
        
        // Generate guest list HTML
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
            // Escape names with commas
            const name = `"${row.name.replace(/"/g, '""')}"`;
            
            csvContent += `${index + 1},${name},"${timeString}",${tableString}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_list_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Reset functionality
    resetBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset ALL tables and DELETE the attendance list? Export your list first!')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            
            try {
                const batch = db.batch();
                
                // Delete all tables
                const tablesSnapshot = await db.collection('tables').get();
                tablesSnapshot.forEach(doc => batch.delete(doc.ref));
                
                // Delete all attendees
                const attendeesSnapshot = await db.collection('attendees').get();
                attendeesSnapshot.forEach(doc => batch.delete(doc.ref));
                
                await batch.commit();
                alert('Event successfully reset!');
            } catch (error) {
                console.error("Error resetting:", error);
                alert('An error occurred while resetting.');
            } finally {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Reset Event';
            }
        }
    });

    // QR Code functionality
    showQrBtn.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
        
        let appUrl = window.location.href.replace('admin.html', 'index.html');
        if (!appUrl.includes('index.html')) {
            appUrl += appUrl.endsWith('/') ? 'index.html' : '/index.html';
        }
        
        qrUrlDisplay.textContent = appUrl;

        if (!qrCode) {
            qrCode = new QRCode(qrcodeContainer, {
                text: appUrl,
                width: 256,
                height: 256,
                colorDark : "#0f172a",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    });

    closeBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.add('hidden');
    });
});
