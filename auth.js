// auth.js
import { db, auth } from './firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

let isLogin = false;

const form = document.getElementById("auth-form");
const usernameInput = document.getElementById("username");
const locationInput = document.getElementById("location");
const title = document.getElementById("form-title");
const button = form.querySelector("button");
const toggleLink = document.getElementById("toggle-link");

// Crear un elemento para mensajes de error
const messageBox = document.createElement("div");
messageBox.style.color = "red";
messageBox.style.marginTop = "10px";
form.appendChild(messageBox);

const toggleMode = () => {
  isLogin = !isLogin;
  title.textContent = isLogin ? "Iniciar Sesión" : "Registro";
  button.textContent = isLogin ? "Iniciar sesión" : "Registrarse";
  toggleLink.textContent = isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya estás registrado? Inicia sesión";
  usernameInput.style.display = isLogin ? "none" : "block";
  locationInput.style.display = isLogin ? "none" : "block";
  usernameInput.required = !isLogin;
  locationInput.required = !isLogin;
  messageBox.textContent = "";
};

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMode();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageBox.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    messageBox.textContent = "Por favor, completa todos los campos.";
    return;
  }

  if (password.length < 6) {
    messageBox.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    messageBox.textContent = "El formato del correo electrónico no es válido.";
    return;
  }
  
  if (isLogin) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
  
      if (user) {
        window.location.href = "index.html";
      }
    } catch (error) {
      switch (error.code) {
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          messageBox.textContent = "Correo o contraseña incorrectos.";
          break;
        case "auth/too-many-requests":
          messageBox.textContent = "Demasiados intentos fallidos. Inténtalo más tarde.";
          break;
        default:
          messageBox.textContent = "Error al iniciar sesión.";
      }
    }
  } else {
    const username = usernameInput.value.trim();
    const location = locationInput.value.trim();

    if (!username || !location) {
      messageBox.textContent = "Por favor, completa todos los campos.";
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "usuarios", user.uid), {
        username,
        email,
        location
      });

      window.location.href = "index.html";
    } catch (error) {
      switch (error.code) {
        case "auth/email-already-in-use":
          messageBox.textContent = "El correo ya está registrado.";
          break;
        case "auth/invalid-email":
          messageBox.textContent = "Correo inválido.";
          break;
        default:
          messageBox.textContent = "Error al registrarse: " + error.message;
      }
    }
  }
});
