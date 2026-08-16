// IMPORTANT: Replace these with your actual Firebase Project configuration
// 1. Go to console.firebase.google.com
// 2. Create a new project
// 3. Add a Web App (the </> icon)
// 4. Copy the firebaseConfig object below
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.error("Firebase is not configured! Please update js/firebase-config.js");
} else {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore ? firebase.firestore() : null;
