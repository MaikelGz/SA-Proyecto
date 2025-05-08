// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyALV4zpwSw4nhaCndmdSsPzym4u0vz9oN0",
  authDomain: "sensorizacao-e-ambiente-51347.firebaseapp.com",
  projectId: "sensorizacao-e-ambiente-51347",
  storageBucket: "sensorizacao-e-ambiente-51347.appspot.com",
  messagingSenderId: "78342438251",
  appId: "1:78342438251:web:ed4b7b2814665765a2202e",
  measurementId: "G-W27G3ZKVJW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

export { app, db, auth, analytics };
