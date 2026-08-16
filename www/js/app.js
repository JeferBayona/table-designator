document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('assignment-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const registrationCard = document.getElementById('registration-card');
    const resultCard = document.getElementById('result-card');
    const tableNumberDisplay = document.getElementById('assigned-table-number');
    const displayName = document.getElementById('display-name');
    
    // Total tables and max capacity
    const TOTAL_TABLES = 10;
    const MAX_CAPACITY = 4;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const guestName = document.getElementById('guest-name').value.trim();
        if (!guestName) return;

        if (!db) {
            showError("Database not configured. Please contact the organizer.");
            return;
        }

        // Check if guest is already stored locally
        if (localStorage.getItem('assignedTable')) {
            showResult(localStorage.getItem('assignedTable'), guestName);
            return;
        }

        setLoading(true);

        try {
            const assignedTable = await assignRandomTable(guestName);
            
            if (assignedTable) {
                // Save locally so if they refresh, they remember their table
                localStorage.setItem('assignedTable', assignedTable);
                showResult(assignedTable, guestName);
            } else {
                showError("All tables are currently full! Please see the organizer.");
            }
        } catch (error) {
            console.error("Assignment error:", error);
            showError("An error occurred while assigning a table. Please try again.");
        } finally {
            setLoading(false);
        }
    });

    async function assignRandomTable(guestName) {
        // We use a Firestore transaction to ensure we don't overfill a table
        // if multiple people submit at the exact same millisecond.
        return await db.runTransaction(async (transaction) => {
            const tablesRef = db.collection('tables');
            
            // Get all tables to find available ones
            // Note: In a transaction, reads must come before writes
            const querySnapshot = await transaction.get(tablesRef);
            let availableTables = [];

            // If tables collection is empty (first run), we assume all tables 1-10 are empty
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

            if (availableTables.length === 0) {
                return null; // All full
            }

            // Pick a random available table
            const randomIdx = Math.floor(Math.random() * availableTables.length);
            const selectedTableId = availableTables[randomIdx];
            
            const tableRef = tablesRef.doc(selectedTableId);
            const tableData = existingTablesData[selectedTableId] || { count: 0, guests: [] };
            
            // Update the table document
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
        tableNumberDisplay.textContent = tableNumber;
        displayName.textContent = name;
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Finding a table...' : 'Get My Table';
        errorMessage.classList.add('hidden');
    }
});
