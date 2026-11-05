# 📟 ShellDojo: Terminal Academy & Panic Arena

**ShellDojo** es una plataforma interactiva de entrenamiento en línea de comandos con estética retro-futurista **Cyberpunk CRT**. Está diseñada para que estudiantes y desarrolladores aprendan comandos reales desde cero y sin presión en el **Modo Dojo**, y luego pongan a prueba su memoria muscular a contrarreloj en la **Panic Arena**.

---

## ✨ Características Principales

1. **Arquitectura Modular ES6 (`type="module"`):** Separación limpia entre datos (`curriculum.js`), núcleo (`state.js`, `validator.js`, `audio.js`) y controladores de interfaz (`renderer.js`, `dojoController.js`, `arenaController.js`).
2. **4 Rutas Completas de Certificación:**
   - **Git & GitHub:** Inicialización, Staging, Ramas, Fusión, Stash y Reset.
   - **Linux & Bash:** Navegación POSIX, permisos octales (`chmod`), tuberías (`|`), `ps`, `grep` y `kill`.
   - **Docker & Contenedores:** `pull`, `run`, mapeo de puertos, `exec -it`, logs y Docker Compose.
   - **Windows CMD & Redes:** `ipconfig /flushdns`, `ping`, `netstat -ano | findstr` y gestión de procesos con `tasklist`/`taskkill`.
3. **Modo Dojo (Sin Reloj):**
   - **Anatomía Visual del Comando:** Desglose por bloques de colores (Ejecutable, Subcomando, Bandera, Argumento, Tubería).
   - **Consola Persistente:** El historial se conserva entre los 3 pasos de cada lección.
   - **Sistema Ghost Hint (`[Tab]`):** Coloca el comando esperado como guía fantasma en el input para evitar bloqueos.
4. **Modo Panic Arena (Contrarreloj 15s):**
   - 3 nodos de servidor (vidas), multiplicador de combo, alarma sonora en los últimos 5 segundos y **Reporte Post-Mortem** con explicación técnica de errores y botón para compartir resultado estilo Wordle.
5. **Sintetizador Web Audio API Nativo:** Efectos de teclado, éxito, error, alarma y subida de nivel generados matemáticamente sin archivos MP3 externos.

---

## 🚀 Cómo Ejecutar el Proyecto Localmente (Evitando el bloqueo CORS)

Debido a que el proyecto utiliza **JavaScript ES6 Modules (`<script type="module">`)**, los navegadores modernos bloquean la carga de módulos si abres el archivo `index.html` directamente con doble clic (`protocolo file://`) por políticas de seguridad CORS.

Debes servir la carpeta mediante un servidor HTTP local usando cualquiera de estas opciones:

### Opción 1: Con Python (Recomendado, sin instalar nada adicional)
Abre una terminal dentro de la carpeta del proyecto y ejecuta:

```bash
# En Python 3.x
python -m http.server 8000
```

Luego abre tu navegador en:
👉 **`http://localhost:8000`**

### Opción 2: Con VS Code (Extensión Live Server)
1. Abre la carpeta del proyecto en **Visual Studio Code**.
2. Instala la extensión **Live Server** (de Ritwick Dey).
3. Haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

### Opción 3: Con Node.js (`npx serve`)
```bash
npx serve .
```

---

## 🌐 Cómo Desplegar Gratis en Producción

Al ser una aplicación 100% estática sin pasos de compilación obligatorios, puedes desplegarla en menos de 1 minuto:

### Despliegue en GitHub Pages
1. Sube el contenido del proyecto a un repositorio de GitHub.
2. Ve a **Settings &rarr; Pages** en tu repositorio.
3. En **Build and deployment**, selecciona **Deploy from a branch**, elige la rama `main` y la carpeta `/ (root)`.
4. Guarda los cambios. En unos segundos tu aplicación estará disponible en `https://tu-usuario.github.io/tu-repo/`.

### Despliegue en Vercel
1. Entra a [vercel.com](https://vercel.com) e importa tu repositorio de GitHub (o ejecuta `npx vercel` desde la carpeta del proyecto).
2. En **Framework Preset**, selecciona **Other** (sin comando de build y con directorio de salida `.`).
3. Haz clic en **Deploy**.

