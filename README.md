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

