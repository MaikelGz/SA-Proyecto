# 🌍 Proyecto de Monitoreo Ambiental con Firebase y Web Technologies  

Este proyecto integra **tecnologías web modernas** y **servicios en la nube** para construir una plataforma de visualización y gestión de datos ambientales en tiempo real.  

## 🚀 Tecnologías Utilizadas  

- **HTML5** → Estructura semántica de las interfaces de usuario (`index.html`, `auth.html`, `region-dashboard.html`, `historical-data.html`).  
- **CSS3 (Responsive Design)** → Estilos unificados en `styles.css`, con media queries y clases reutilizables para mejorar la experiencia de usuario.  
- **Accesibilidad** → Uso correcto de etiquetas `<label>`, formularios accesibles y semántica clara.  
- **JavaScript (Cliente)** → Manipulación del DOM, validación de formularios y conexión con Firebase SDK (`onAuthStateChanged`, `setDoc`, `getDoc`).  
- **Firebase (Backend en la Nube)** → Autenticación de usuarios, almacenamiento de datos y conexión segura vía HTTPS.  
- **JSON** → Formato clave para configuración, comunicación con Firebase y procesamiento de datos de sensores.  
- **Python (Servidor)** → Scripts para:  
  - Recolección de datos meteorológicos (`fetch_aemet_realtime.py`)  
  - Simulación de sensores (`simulateSensor.py`)  
  - Subida masiva de datos a Firebase (`upload_all_aemet_data.py`)  

## 📡 Características Principales  

- **Autenticación segura de usuarios** mediante Firebase Authentication.  
- **Dashboard regional** para monitoreo en tiempo real de datos ambientales.  
- **Histórico de datos** accesible desde Firestore para análisis de tendencias.  
- **Integración con datos meteorológicos oficiales (AEMET)**.  
- **Simulación de sensores** para pruebas y validaciones.  

## 🎯 Objetivo  

El proyecto busca **centralizar, visualizar y gestionar datos ambientales** a través de una aplicación web moderna, segura y accesible, potenciando la **computación en la nube** y la **interoperabilidad de datos**.  
