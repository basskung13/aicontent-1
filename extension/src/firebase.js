import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

// Config retrieved via firebase-mcp-server
const firebaseConfig = {
    apiKey: "AIzaSyDGEnGxtkor9PwWkgjiQvrr9SmZ_IHKapE",
    authDomain: "content-auto-post.firebaseapp.com",
    projectId: "content-auto-post",
    storageBucket: "content-auto-post.firebasestorage.app",
    messagingSenderId: "710780145350",
    appId: "1:710780145350:web:f15040b92353daa93ad1c7",
    measurementId: "G-XXMR04318T",
    databaseURL: "https://content-auto-post-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);

// 🛠️ FIX: Use getAuth + setPersistence
// This pattern is safer than initializeAuth in some environments where
// default persistence initialization might behave unexpectedly.
export const auth = getAuth(app);

// Only set browser persistence if we are in a browser context (Popup), not Service Worker
if (typeof window !== "undefined") {
    setPersistence(auth, browserLocalPersistence).catch(err => {
        console.error("Firebase Persistence Error:", err);
    });
}

// export const db = getFirestore(app);
// export const storage = getStorage(app);
// export const functions = getFunctions(app);
export default app;
