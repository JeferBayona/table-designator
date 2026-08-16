document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('assignment-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const registrationCard = document.getElementById('registration-card');
    const resultCard = document.getElementById('result-card');
    
    const tableNumberContainer = document.getElementById('table-number-container');
    const tableNumberDisplay = document.getElementById('assigned-table-number');
    const proceedText = document.getElementById('proceed-text');
    const displayName = document.getElementById('display-name');
    
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;
    
    let isTableAssignmentEnabled = false;

    if (db) {
        db.collection('settings').doc('event').onSnapshot(doc => {
            if (doc.exists) {
                isTableAssignmentEnabled = doc.data().tableAssignmentEnabled || false;
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const guestName = document.getElementById('guest-name').value.trim();
        if (!guestName) return;

        if (!db) {
            showError("Database not configured. Please contact the organizer.");
            return;
        }

        // Check if guest is already checked in locally
        if (localStorage.getItem('checkedInName') === guestName) {
            const savedTable = localStorage.getItem('assignedTable');
            showResult(savedTable, guestName);
            return;
        }

        setLoading(true);

        try {
            let assignedTable = null;
            
            if (isTableAssignmentEnabled) {
                assignedTable = await assignRandomTable(guestName);
                if (!assignedTable) {
                    showError("All tables are currently full! Please see the organizer.");
                    setLoading(false);
                    return;
                }
            }

            // Always add to attendees collection
            await db.collection('attendees').add({
                name: guestName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tableNumber: assignedTable
            });

            localStorage.setItem('checkedInName', guestName);
            if (assignedTable) {
                localStorage.setItem('assignedTable', assignedTable);
            }
            
            showResult(assignedTable, guestName);
        } catch (error) {
            console.error("Assignment error:", error);
            showError("An error occurred while checking in. Please try again.");
        } finally {
            setLoading(false);
        }
    });

    async function assignRandomTable(guestName) {
        return await db.runTransaction(async (transaction) => {
            const tablesRef = db.collection('tables');
            const querySnapshot = await transaction.get(tablesRef);
            let availableTables = [];
            let existingTablesData = {};

            querySnapshot.forEach(doc => {
                existingTablesData[doc.id] = doc.data();
            });

            for (let i = 1; i <= TOTAL_TABLES; i++) {
                const tableId = i.toString();
                const tableData = existingTablesData[tableId] || { count: 0, guests: [] };
                
                if (tableData.count < MAX_CAPACITY) {
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

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Checking in...' : 'Check In';
        errorMessage.classList.add('hidden');
    }
});
