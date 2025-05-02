// auth.js
import { db, auth } from './firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

let isLogin = false;

const form = document.getElementById("auth-form");
const usernameInput = document.getElementById("username");
const locationInput = document.getElementById("location");
const title = document.getElementById("form-title");
const button = form.querySelector("button");
const toggleLink = document.getElementById("toggle-link");

const toggleMode = () => {
  isLogin = !isLogin;
  title.textContent = isLogin ? "Iniciar Sesión" : "Registro";
  button.textContent = isLogin ? "Iniciar sesión" : "Registrarse";
  toggleLink.textContent = isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya estás registrado? Inicia sesión";
  usernameInput.style.display = isLogin ? "none" : "block";
  locationInput.style.display = isLogin ? "none" : "block";
};

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMode();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (isLogin) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Inicio de sesión exitoso");
      window.location.href = "index.html";
    } catch (error) {
      alert("Error al iniciar sesión: " + error.message);
    }
  } else {
    const username = usernameInput.value;
    const location = locationInput.value;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await setDoc(doc(db, "usuarios", user.uid), {
        username,
        email,
        location
      });
      alert("Registro exitoso");
      window.location.href = "index.html";
    } catch (error) {
      alert("Error al registrarse: " + error.message);
    }
  }
});
