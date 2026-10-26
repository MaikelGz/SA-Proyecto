# Plataforma de monitorización de salud del suelo

Aplicación web para consultar datos ambientales por región, visualizar series históricas de AEMET y obtener recomendaciones agrícolas a partir de lecturas de sensores. El repositorio combina una interfaz web estática, Firebase (Authentication y Cloud Firestore), scripts de ingesta en Python y un servicio HTTP opcional para un asistente basado en un modelo local.

> **Estado funcional:** algunas funciones de la interfaz usan datos simulados. En particular, la observación AEMET mostrada en el dashboard se genera en el navegador; la simulación de lectura de sensor tampoco persiste la lectura. Los scripts Python de ingesta son procesos separados y deben ejecutarse expresamente.

## Contenido

- [Capacidades](#capacidades)
- [Arquitectura](#arquitectura)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Flujos de la aplicación](#flujos-de-la-aplicación)
- [Modelo de datos de Firestore](#modelo-de-datos-de-firestore)
- [Datos AEMET](#datos-aemet)
- [Requisitos y puesta en marcha](#requisitos-y-puesta-en-marcha)
- [Asistente de IA: arquitectura, ejecución y conocimiento](#asistente-de-ia-arquitectura-ejecución-y-conocimiento)
- [Seguridad y operación](#seguridad-y-operación)
- [Limitaciones conocidas](#limitaciones-conocidas)

## Capacidades

- Registro e inicio de sesión con correo y contraseña mediante Firebase Authentication.
- Almacenamiento del perfil de usuario y de su ubicación en Firestore.
- Selección de provincias o regiones disponibles en los metadatos de Firestore.
- Dashboard de región con lectura más reciente de sensor, reglas de recomendación y observación meteorológica simulada.
- Consulta de históricos mensuales de AEMET por región, parámetro, ámbito geográfico y año, con gráfico de barras Chart.js.
- Visualización de figuras comparativas preprocesadas incluidas en `figuras/`.
- Carga de inventario de estaciones, observaciones y ficheros climatológicos a Firestore mediante herramientas Python.
- Interfaz de chat que envía preguntas al servicio Flask opcional.

## Arquitectura

```text
Navegador
  ├── HTML + styles.css
  ├── JavaScript ES Modules ── Firebase Web SDK ── Authentication / Firestore
  └── chatAssistant.js ── HTTP POST /ask ── Flask (puerto 5000)
                                               └── API compatible con Llama.cpp (modelo local)

Procesos de administración Python ── AEMET OpenData / CSV locales ── Firebase Admin SDK ── Firestore
```

El frontend no tiene un servidor de aplicación propio: debe servirse desde HTTP(S), ya que los módulos JavaScript y Firebase no están pensados para abrirse directamente con `file://`. Los scripts Python usan credenciales administrativas independientes del SDK web.

## Estructura del repositorio

| Ruta | Responsabilidad |
|---|---|
| `auth.html`, `auth.js` | Formulario de registro e inicio de sesión; crea usuarios de Authentication y sus perfiles en Firestore. |
| `index.html`, `js/mainPage.js` | Página inicial autenticada; carga el perfil y las regiones disponibles, y permite elegir una región. |
| `region-dashboard.html`, `js/dashboardPage.js` | Resumen de sensores, recomendaciones por reglas, observación AEMET simulada y navegación al histórico. |
| `historical-data.html`, `js/historicalPage.js` | Selector de parámetro y año, consulta de Firestore y visualización de datos mensuales. |
| `js/chatAssistant.js` | Cliente HTTP del chat, conectado a `http://localhost:5000/ask`. |
| `firebase-config.js` | Inicialización del SDK web de Firebase: aplicación, Authentication, Firestore y Analytics. |
| `styles.css` | Estilos comunes de las páginas. La página de autenticación también incluye estilos locales. |
| `fetch_aemet_realtime.py` | Consulta observaciones convencionales de una estación AEMET y guarda datos de precipitación en Firestore. |
| `import_requestsIDEMAs.py` | Descarga el inventario de estaciones y carga una estación asociada a cada provincia. |
| `upload_all_aemet_data.py` | Lee CSV climatológicos y los importa como valores mensuales en Firestore. |
| `simulateSensor.py` | Inserta diez lecturas de sensor de ejemplo en Firestore. |
| `IA/api_assistant.py` | API Flask con endpoint `POST /ask`; añade contexto de región y delega la respuesta al asistente. |
| `IA/agriculture_assistant.py` | Carga la base de conocimiento y realiza la petición al servidor de inferencia local. |
| `IA/base_conocimiento.txt` | Conocimiento textual agrícola usado como contexto del asistente. |
| `aemetDATA/` | CSV de AEMET agrupados por año y ámbito regional (2019–2023 en el conjunto incluido). |
| `figuras/` | Gráficos estáticos de promedios y parámetros de humedad del suelo. |

## Flujos de la aplicación

### Autenticación y perfil

`auth.js` alterna entre registro e inicio de sesión. El registro crea una cuenta con correo y contraseña en Firebase Authentication y escribe `username`, `email` y `location` en `usuarios/{uid}`. Al iniciar sesión se redirige a `index.html`. Las páginas protegidas observan el estado con `onAuthStateChanged` y redirigen a `auth.html` cuando no hay sesión activa.

### Selección regional

`js/mainPage.js` obtiene el perfil del usuario y consulta `metadata/regionsWithType`. La lista `allRegionsInfo` se utiliza para llenar el selector. La elección se conserva en la URL al navegar al dashboard, como parámetro `region` codificado.

### Dashboard

`js/dashboardPage.js` lee la región desde la URL, resuelve su nombre legible y obtiene la última entrada de `sensorData` ordenando por `sensor_timestamp`. Para generar recomendaciones consulta, cuando está disponible, el valor mensual de `AD25mm_Provincias` del año 2020 para la región seleccionada. Las reglas actuales examinan pH, humedad, temperatura y comparación con ese valor histórico; son reglas deterministas y no una inferencia de IA.

El botón **Simular Nueva Lectura** genera valores aleatorios en el navegador y refresca la presentación y las recomendaciones, sin escribir en Firestore. La observación AEMET del dashboard también se simula localmente con estaciones de ejemplo o valores aleatorios. El fichero `fetch_aemet_realtime.py` es un flujo independiente y no alimenta directamente esta vista.

### Datos históricos

`js/historicalPage.js` utiliza la región, el parámetro y el año seleccionados para leer un documento de Firestore. Si existe el campo `monthlyValues`, representa enero–diciembre en un gráfico de barras Chart.js. La página incorpora además imágenes PNG estáticas de `figuras/`.

## Asistente de IA: arquitectura, ejecución y conocimiento

El asistente está compuesto por **dos servicios locales** y un fichero de conocimiento. El navegador actúa como cliente; Flask recibe las consultas y el servidor Llama.cpp ejecuta el modelo. En esta arquitectura, las consultas y el modelo se procesan en el equipo donde se levantan los servicios, sin depender de una API comercial externa.

```text
Pregunta en el dashboard
    │  { question, region }
    ▼
js/chatAssistant.js ── POST http://localhost:5000/ask ──► IA/api_assistant.py (Flask)
                                                               │
                                      IA/base_conocimiento.txt ├─ contexto
                                                               │
                                                               ▼
                              IA/agriculture_assistant.py ──► Llama.cpp /v1/chat/completions
                                                               │
Pregunta + región + conocimiento ──────────────────────────────┘
    ◄── { answer }
```

### Cómo obtiene el conocimiento

En el estado actual, el conocimiento se carga **al iniciar Flask** desde `IA/base_conocimiento.txt`. El archivo contiene texto con recomendaciones y conceptos agrícolas. `api_assistant.py` lo lee una vez y guarda su contenido en memoria; cada pregunta lo incorpora al prompt que se envía al modelo.

Esto es una estrategia sencilla de contexto completo (*stuffing*): **no existe actualmente búsqueda semántica, embeddings, índice vectorial, lectura de PDF/Word ni consulta directa a Firestore**. El modelo no inspecciona por sí mismo los datos históricos, las figuras, los CSV de `aemetDATA/` ni otros documentos del proyecto. Para que responda sobre un dato, dicho dato debe estar incluido en el texto que se le envía.

La región seleccionada se manda desde el navegador y Flask la añade como contexto textual a la pregunta. Esa región no provoca una consulta a Firestore ni carga automáticamente datos de AEMET; solo aporta el nombre al prompt. Por tanto, las recomendaciones actuales sobre la región dependen de que el conocimiento incluido contenga información relevante para esa zona.

Para incorporar información documental al enfoque actual, se puede resumir o convertir el contenido pertinente a texto y añadirlo a `IA/base_conocimiento.txt`; después hay que reiniciar Flask para que vuelva a cargarlo. Esta opción sirve para una base pequeña y estable. Si se quiere consultar muchos documentos, documentos cambiantes o datos particulares por región, hará falta implementar una capa de recuperación: extraer texto, dividirlo en fragmentos, buscar los fragmentos relevantes para cada pregunta y enviar únicamente esos fragmentos como contexto al modelo. Para datos estructurados de Firestore, Flask necesitaría además un cliente de Firestore y una consulta explícita autorizada; hoy esa conexión no forma parte del asistente.

### Recorrido de una consulta

1. En el dashboard, `js/chatAssistant.js` toma el texto de la caja de chat y el nombre de región visible. Envía JSON con `question` y `region` a `http://localhost:5000/ask`.
2. Flask, en `IA/api_assistant.py`, obtiene el JSON, rechaza una pregunta vacía y construye una pregunta contextualizada con la región.
3. `IA/agriculture_assistant.py` prepara un prompt con el rol de asesor agrícola, el texto completo de `base_conocimiento.txt` y la consulta contextualizada.
4. Se envía una solicitud HTTP al endpoint configurado para el servidor de inferencia. La respuesta se devuelve a Flask y Flask responde al navegador con JSON `{ "answer": "..." }`.
5. El cliente actualiza el último mensaje del asistente en la ventana de chat. Si no puede contactar con Flask, muestra un mensaje genérico de error.

La interfaz usa CORS habilitado en Flask para aceptar peticiones del navegador. El servicio de inferencia debe estar activo además del servicio Flask; ejecutar solo `api_assistant.py` no basta para producir respuestas.

### Ejecución local

#### 1. Preparar Python y el modelo

Instala Python y crea un entorno virtual en la raíz del proyecto. Instala las dependencias del servicio Flask:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
# source .venv/bin/activate
python -m pip install flask flask-cors requests
```

Para servir el modelo se necesita también `llama-cpp-python` con soporte de servidor y un modelo GGUF compatible. La carpeta o ruta `models/mistral-7b/mistral-7b.Q4_K_M.gguf` que aparece en `IA/Inicio.txt` es un ejemplo esperado por ese comando; el archivo de pesos no está incluido en este repositorio y debe obtenerse por separado, respetando su licencia y los recursos de memoria disponibles. La instalación de `llama-cpp-python` puede depender del sistema operativo, la versión de Python y si se usará CPU o GPU; debe seguirse el método adecuado para el equipo.

#### 2. Arrancar el servidor de inferencia

Desde la raíz, activa el entorno que contiene `llama-cpp-python` y ejecuta el comando orientativo de `IA/Inicio.txt`:

```bash
python -m llama_cpp.server --model models/mistral-7b/mistral-7b.Q4_K_M.gguf
```

El servidor de llama.cpp suele ofrecer una API HTTP compatible con OpenAI en una dirección local. Confirma en la salida de inicio cuál es el host, puerto y ruta que está usando tu versión, y mantén esa terminal abierta. También puedes fijar explícitamente el puerto y la ruta del modelo según las opciones admitidas por la versión instalada.

#### 3. Configurar el cliente Python y arrancar Flask

`IA/agriculture_assistant.py` define la URL del endpoint en `LLAMA_API_URL`. **El valor que contiene ahora está malformado** y debe reemplazarse por la URL real del servidor local antes de hacer consultas, por ejemplo `http://127.0.0.1:8000/v1/chat/completions` si el servidor está escuchando en ese host y puerto. La URL tiene que terminar en la ruta que implemente la API.

Hay además una diferencia de formato que se debe corregir o comprobar: el código publica un campo `prompt` hacia `/v1/chat/completions`, mientras que esa ruta normalmente espera un cuerpo de estilo chat con `messages` (lista de mensajes con `role` y `content`). Se puede adaptar el código para usar el formato chat que espera el servidor, o configurar una ruta/servidor que acepte el formato de completions utilizado. La ruta y el esquema del JSON deben corresponder entre sí; no basta con cambiar el puerto.

Con el endpoint y el formato ya alineados, en otra terminal inicia Flask desde la raíz del repositorio:

```bash
python IA/api_assistant.py
```

Flask escucha en el puerto `5000`. La importación del módulo supone que Python puede resolver `agriculture_assistant` desde el directorio `IA`; ejecuta el comando anterior desde la raíz para mantener el contexto esperado. La base de conocimiento se carga al arrancar; reinicia este servicio al editar `IA/base_conocimiento.txt`.

#### 4. Abrir la interfaz y enviar una pregunta

En una tercera terminal, sirve el frontend estático desde la raíz:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`, inicia sesión y navega al dashboard de una región. Escribe una pregunta en el asistente y pulsa **Enviar** o la tecla **Enter**. Para que el flujo funcione, deben estar activos el servidor de inferencia y Flask. Si el navegador muestra un error de conexión, comprueba primero las terminales de ambos servicios, el endpoint y el cuerpo de la petición descritos arriba.

### Contrato HTTP del servicio Flask

La ruta implementada es `POST /ask` en `http://localhost:5000/ask`.

Petición:

```json
{
  "question": "¿Qué prácticas ayudan a conservar la humedad del suelo?",
  "region": "NAVARRA"
}
```

Respuesta satisfactoria:

```json
{
  "answer": "Respuesta generada por el asistente..."
}
```

Si `question` está vacío, el servicio devuelve estado HTTP 400 y un mensaje de pregunta no válida. La implementación actual no aplica autenticación ni limita el tamaño o frecuencia de las consultas. Para publicar el servicio fuera del equipo local habría que asegurar el endpoint, restringir CORS y protegerlo con autenticación y límites de uso.

## Modelo de datos de Firestore

La estructura que consumen o producen los componentes del proyecto es:

| Ruta | Contenido esperado |
|---|---|
| `usuarios/{uid}` | Perfil: `username`, `email`, `location`. |
| `metadata/regionsWithType` | Metadato con `allRegionsInfo`, una lista de regiones usada por el selector. |
| `aemetProvinceStationMap/{regionId}` | Correspondencia provincia/región con propiedades como `idema` y `provincia`. El importador de estaciones escribe este tipo de documento. |
| `sensorData/{documentId}` | Lectura con `temperatura`, `humedad`, `ph` y marca temporal. El dashboard espera que el campo de ordenación sea `sensor_timestamp`; `simulateSensor.py` actualmente guarda `timestamp`, por lo que sus documentos no coinciden con esa consulta sin adaptación. |
| `aemetHistoricalData/{regionId}/{parameterCode}/{year}` | Documento con `monthlyValues` (mapa de nombres de mes a valores), `regionOriginal`, `parameterCodeUsed` y `year`. El importador genera el tipo `Provincia` (singular), mientras el selector histórico pide `..._Provincias` (plural); deben alinearse para que esas consultas coincidan. |
| `aemetRealtimePrecipitation/{idema}` | Datos de precipitación recopilados por el proceso de observación, según su implementación. |

Los identificadores regionales se normalizan en los importadores (por ejemplo, sustituyendo espacios o caracteres especiales); la región de la URL y los IDs de Firestore deben mantener el mismo formato para que las lecturas coincidan.

## Datos AEMET

`aemetDATA/` contiene ficheros separados por año, parámetro y ámbito. Los parámetros identificados por el importador son `AD25` (humedad de suelo a 25 mm), `AD75` (75 mm), `PADMAX` (capacidad máxima de almacenamiento, representada como `ADRmax`), `ETO` (evapotranspiración de referencia) y `PREC` (precipitación). Los ámbitos incluyen provincias, grandes cuencas, comunidades autónomas y nacional. El selector histórico de la interfaz ofrece los tres ámbitos regionales y los años 2019–2023.

`upload_all_aemet_data.py` procesa CSV delimitados por punto y coma, reconoce las columnas de los doce meses y actualiza los metadatos de regiones. Los documentos guardados en Firestore siguen la jerarquía indicada arriba. El nombre de archivo debe seguir el patrón `<PARAMETRO>_<AÑO>_<ÁMBITO>.csv` para ser reconocido.

`import_requestsIDEMAs.py` consulta el inventario de estaciones de AEMET y selecciona una estación por provincia para alimentar el mapa de estaciones. `fetch_aemet_realtime.py` consulta la API convencional de AEMET mediante el patrón de dos solicitudes (metadatos y URL de descarga) y procesa observaciones para persistir precipitación.

## Requisitos y puesta en marcha

### Frontend

1. Configurar el proyecto Firebase en `firebase-config.js` y habilitar Authentication con correo/contraseña, Firestore y las reglas necesarias.
2. Servir el directorio raíz con cualquier servidor estático, por ejemplo:

   ```bash
   python -m http.server 8000
   ```

3. Abrir `http://localhost:8000/auth.html` para registrar o iniciar sesión. Las bibliotecas Firebase 11.6.0 y Chart.js se cargan desde CDN, por lo que el navegador necesita acceso a Internet.

Las páginas esperan que los documentos de metadatos, sensores e históricos ya existan en Firestore; el frontend no ejecuta las importaciones automáticamente.

### Procesos de ingesta y simulación

Python requiere, según el script, `requests`, `firebase-admin` y/o `pandas`. Instálelos en un entorno virtual, configure las credenciales de Firebase Admin y la clave de AEMET, y ejecute desde la raíz del repositorio:

```bash
python import_requestsIDEMAs.py
python upload_all_aemet_data.py
python fetch_aemet_realtime.py
python simulateSensor.py
```

Los comandos son independientes; ejecute solo los necesarios. Revise primero las rutas y parámetros editables al inicio de cada script. `upload_all_aemet_data.py` recorre los CSV disponibles bajo `aemetDATA/` y escribe en Firestore.

### Dependencias del asistente

La configuración detallada, la explicación del conocimiento documental, el contrato HTTP y los pasos para arrancar los dos servicios locales están en [Asistente de IA: arquitectura, ejecución y conocimiento](#asistente-de-ia-arquitectura-ejecución-y-conocimiento). El modelo GGUF no forma parte del repositorio.

## Seguridad y operación

- No publique claves privadas, archivos de cuenta de servicio, claves de AEMET ni credenciales en el repositorio. Use variables de entorno o ficheros locales excluidos del control de versiones y revoque/rote cualquier secreto que haya sido expuesto.
- La configuración del SDK web incluye una API key de Firebase de cliente; no equivale a una credencial administrativa, pero la seguridad de los datos depende de reglas de Firestore y Authentication correctamente configuradas.
- Los scripts con Firebase Admin tienen permisos elevados. Ejecútelos en un entorno de confianza y con una cuenta de servicio de privilegio mínimo.
- La clave de AEMET debe leerse desde configuración local; no la incruste en el código fuente.
- El endpoint Flask se ejecuta con `host='0.0.0.0'` y CORS abierto a todos los orígenes en la configuración actual. Limite origen, interfaz de red y acceso antes de exponerlo en una red compartida o en Internet.
- El navegador llama al chat por HTTP en `localhost`; para una instalación remota deberá configurar una URL accesible y HTTPS, además de ajustar CORS.

## Limitaciones conocidas

- La observación que muestra el dashboard está simulada en `js/dashboardPage.js`; no es una consulta en vivo a AEMET.
- La lectura manual simulada del dashboard no se almacena en Firestore.
- `simulateSensor.py` guarda `timestamp`, mientras el dashboard ordena por `sensor_timestamp`; alinear el campo temporal para que esas muestras alimenten el resumen.
- `upload_all_aemet_data.py` construye el segmento del parámetro con `Provincia` (singular), pero las opciones de la página histórica utilizan `Provincias` (plural). En consecuencia, los históricos provinciales importados con el nombre actual no se localizarán desde ese selector hasta normalizar el nombre en uno de los dos lados.
- La consulta de sensor del dashboard es global y no filtra por región.
- El contexto histórico de las recomendaciones usa de forma fija `AD25mm_Provincias` y el año 2020.
- El chat depende de un servidor Llama.cpp local y la URL configurada del modelo debe corregirse/verificarse.
- El servicio Flask de ejemplo no incorpora autenticación, límites de uso ni tratamiento completo de errores de entrada.
- La aplicación depende de la configuración externa de Firebase, sus reglas de seguridad, la disponibilidad de CDN y, para el asistente, los servicios locales descritos.

En el directorio del proyecto hay archivos de credenciales de Firebase Admin y una clave de AEMET, y `import_requestsIDEMAs.py` contiene una clave de AEMET incrustada. Si esos archivos o claves se han compartido o almacenado en un repositorio accesible, deben considerarse expuestos: revoque/rote las credenciales, quite los secretos del control de versiones y sustituya su lectura por variables de entorno o configuración local ignorada por Git.
