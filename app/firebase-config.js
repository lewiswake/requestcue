import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLZp3f5WAWkAJDpBidh-C2mib2nhnLys4",

  authDomain: "song-request-a8a68.firebaseapp.com",

  projectId: "song-request-a8a68",

  storageBucket: "song-request-a8a68.firebasestorage.app",

  messagingSenderId: "522633732679",

  appId: "1:522633732679:web:564894980a2e0484828762",

  measurementId: "G-H6NY9N42JF",
};

let app, auth, db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

export { app, auth, db };
