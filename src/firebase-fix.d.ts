declare module 'firebase/auth' {
    export type User = any;
    export const onAuthStateChanged: any;
    export const signInWithPopup: any;
    export const GoogleAuthProvider: any;
    export const OAuthProvider: any;
    export const getAuth: any;
    export const signOut: any;
}
declare module 'firebase/firestore' {
    export const getFirestore: any;
    export const collection: any;
    export const addDoc: any;
    export const serverTimestamp: any;
    export const doc: any;
    export const setDoc: any;
    export const getDoc: any;
}
