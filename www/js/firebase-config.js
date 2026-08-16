// IMPORTANT: Replace these with your actual Firebase Project configuration
// 1. Go to console.firebase.google.com
// 2. Create a new project
// 3. Add a Web App (the </> icon)
// 4. Copy the firebaseConfig object below
const firebaseConfig = {
    apiKey: "AIzaSyBq5GQ7uFZ2myMiK8xp2Apej5_c_1Yvirk",
    authDomain: "oikos-young-pro.firebaseapp.com",
    projectId: "oikos-young-pro",
    storageBucket: "oikos-young-pro.firebasestorage.app",
    messagingSenderId: "770143984762",
    appId: "1:770143984762:web:9c58203a740ecbbbd76fc3"
};

// Initialize Firebase
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.error("Firebase is not configured! Please update js/firebase-config.js");
} else {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore ? firebase.firestore() : null;
