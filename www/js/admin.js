document.addEventListener('DOMContentLoaded', () => {
    if (!db) {
        alert("Database not configured. Please check js/firebase-config.js");
        return;
    }

    const tablesGrid = document.getElementById('tables-grid');
    const totalGuestsCount = document.getElementById('total-guests-count');
    const tablesFilledCount = document.getElementById('tables-filled-count');
    const resetBtn = document.getElementById('reset-btn');
    
    // QR Code elements
    const showQrBtn = document.getElementById('show-qr-btn');
    const qrModal = document.getElementById('qr-modal');
    const closeBtn = document.querySelector('.close-btn');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrUrlDisplay = document.getElementById('qr-url-display');
    
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;
    let qrCode = null;

    // Listen for real-time updates
    db.collection('tables').onSnapshot(snapshot => {
        let tablesData = {};
        let totalGuests = 0;
        let fullTables = 0;

        snapshot.forEach(doc => {
            tablesData[doc.id] = doc.data();
        });

        tablesGrid.innerHTML = ''; // Clear current grid

        for (let i = 1; i <= TOTAL_TABLES; i++) {
            const tableId = i.toString();
            const data = tablesData[tableId] || { count: 0, guests: [] };
            
            totalGuests += data.count;
            if (data.count === MAX_CAPACITY) fullTables++;

            renderTableCard(tableId, data);
        }

        // Update stats
        totalGuestsCount.textContent = `${totalGuests} / ${TOTAL_TABLES * MAX_CAPACITY}`;
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

    // Reset functionality
    resetBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset ALL tables? This will delete all current assignments.')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            
            try {
                // To reset, we just delete all documents in the 'tables' collection
                const snapshot = await db.collection('tables').get();
                const batch = db.batch();
                
                snapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                alert('Event successfully reset!');
            } catch (error) {
                console.error("Error resetting:", error);
                alert('An error occurred while resetting.');
            } finally {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Reset All Tables';
            }
        }
    });

    // QR Code functionality
    showQrBtn.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
        
        // The URL guests should visit is just the current URL without admin.html
        let appUrl = window.location.href.replace('admin.html', 'index.html');
        if (!appUrl.includes('index.html')) {
            appUrl += appUrl.endsWith('/') ? 'index.html' : '/index.html';
        }
        
        qrUrlDisplay.textContent = appUrl;

        // Generate QR code if not already generated
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

    closeBtn.addEventListener('click', () => {
        qrModal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.classList.add('hidden');
        }
    });
});
