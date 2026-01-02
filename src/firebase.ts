import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDBhWv0ZQh6ILiP10kbb3FS09-CTTZLQWU",
    authDomain: "pulsepad.firebaseapp.com",
    projectId: "pulsepad",
    storageBucket: "pulsepad.firebasestorage.app",
    messagingSenderId: "502316179756",
    appId: "1:502316179756:web:69e0bd1e1959731bc80c89",
    measurementId: "G-9X27L73G0P"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
