import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
