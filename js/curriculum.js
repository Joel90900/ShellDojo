// ShellDojo — reconstrucción funcional del módulo curricular.
// El archivo original no estaba disponible en la rama main.
// Exporta todos los datos que consumen main.js y los controladores de UI.

const tracks = [
  {id:"linux",title:"Linux & Terminal",tier:"free",badge:"🐧 LINUX SYSADMIN",prompt:"operator@linux:~$",sets:[
    ["Navegación del sistema","pwd|ls -la|cd /"],["Gestión de archivos","touch practica.txt|mkdir laboratorio|cp practica.txt copia.txt"],
    ["Lectura de archivos","cat practica.txt|head -n 5 practica.txt|tail -n 5 practica.txt"],["Búsqueda","find . -name '*.txt'|grep error registro.log|which bash"],
    ["Permisos","chmod 644 practica.txt|chmod +x script.sh|ls -l"],["Procesos","ps aux|top|kill 1234"],["Servicios","sudo apt update|sudo systemctl status ssh|df -h"]
  ]},
  {id:"git",title:"Git & GitHub",tier:"free",badge:"🌿 VERSION CONTROL",prompt:"operator@git:~/project$",sets:[
    ["Primer repositorio","git init|git status|git log --oneline"],["Preparar cambios","git add .|git diff|git diff --staged"],
    ["Commits",'git commit -m "Primer commit"|git status|git log -1'],["Ramas","git branch|git switch -c feature-login|git branch -a"],
    ["Integración","git switch main|git merge feature-login|git log --oneline --graph"],["Remotos","git remote -v|git remote add origin https://github.com/usuario/proyecto.git|git push -u origin main"],
    ["Sincronización","git fetch origin|git pull origin main|git push origin main"]
  ]},
  {id:"docker",title:"Docker & Containers",tier:"pro",badge:"🐳 CONTAINER OPS",prompt:"operator@docker:~$",sets:[
    ["Versión","docker --version|docker info|docker version"],["Contenedores","docker pull nginx|docker run hello-world|docker ps -a"],
    ["Ciclo de vida","docker run -d --name web nginx|docker stop web|docker rm web"],["Imágenes","docker images|docker tag nginx nginx:local|docker image inspect nginx"],
    ["Volúmenes","docker volume ls|docker volume create datos|docker volume inspect datos"],["Redes","docker network ls|docker network create app-net|docker network inspect app-net"],
    ["Compose","docker compose version|docker compose config|docker compose ps"]
  ]},
  {id:"networking",title:"Redes & SysAdmin",tier:"pro",badge:"🌐 NETWORK ENGINEER",prompt:"operator@network:~$",sets:[
    ["Identidad de red","ip addr|ip route|hostname"],["Conectividad","ping -c 4 8.8.8.8|ping -c 4 google.com|traceroute google.com"],
    ["DNS","nslookup google.com|dig google.com|host example.com"],["Puertos","ss -tuln|ss -tunap|lsof -i"],
    ["HTTP","curl -I https://example.com|curl -L https://example.com|wget https://example.com"],["Firewall","sudo ufw status|sudo ufw status verbose|sudo iptables -L"],
    ["Diagnóstico","ip route get 8.8.8.8|curl -v https://example.com|ss -s"]
  ]},
  {id:"sql",title:"SQL & Databases",tier:"team",badge:"🗄️ DATABASE OPS",prompt:"operator@sql:~$",sets:[
    ["SELECT","SELECT * FROM usuarios;|SELECT nombre FROM usuarios;|SELECT * FROM usuarios LIMIT 10;"],
    ["Filtros","SELECT * FROM usuarios WHERE activo = 1;|SELECT * FROM usuarios ORDER BY nombre ASC;|SELECT * FROM usuarios WHERE edad >= 18;"],
    ["Agregaciones","SELECT COUNT(*) FROM usuarios;|SELECT AVG(edad) FROM usuarios;|SELECT ciudad, COUNT(*) FROM usuarios GROUP BY ciudad;"],
    ["JOIN","SELECT * FROM clientes INNER JOIN pedidos ON clientes.id = pedidos.cliente_id;|SELECT * FROM clientes LEFT JOIN pedidos ON clientes.id = pedidos.cliente_id;|SELECT c.nombre, p.id FROM clientes c JOIN pedidos p ON c.id = p.cliente_id;"],
    ["Manipulación","INSERT INTO usuarios (nombre) VALUES ('Ana');|UPDATE usuarios SET activo = 1 WHERE id = 1;|DELETE FROM usuarios WHERE id = 1;"],
    ["Tablas","CREATE TABLE categorias (id INT PRIMARY KEY, nombre VARCHAR(80));|ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(20);|DESCRIBE usuarios;"],
    ["Índices","CREATE INDEX idx_usuario_nombre ON usuarios(nombre);|START TRANSACTION;|COMMIT;"]
  ]},
  {id:"python",title:"Python & Automation",tier:"team",badge:"🐍 PYTHON AUTOMATION",prompt:"operator@python:~$",sets:[
    ["Intérprete","python --version|python -c \"print(1 + 1)\"|python -m pip --version"],
    ["Variables","python -c \"name = 'Dojo'; print(name)\"|python -c \"print(type(42))\"|python -c \"print(int('25'))\""],
    ["Colecciones","python -c \"items = [1, 2, 3]; print(items)\"|python -c \"print(len([1, 2, 3]))\"|python -c \"user = {'name': 'Ana'}; print(user['name'])\""],
    ["Condicionales","python -c \"print('OK' if 5 > 2 else 'NO')\"|python -c \"for n in range(3): print(n)\"|python -c \"n = 0; n += 1; print(n)\""],
    ["Funciones","python -c \"def saludar(): print('Hola'); saludar()\"|python -c \"def doble(n): return n * 2; print(doble(4))\"|python -c \"print(sum([1, 2, 3]))\""],
    ["Módulos","python -c \"from pathlib import Path; print(Path.cwd())\"|python -c \"import os; print(os.name)\"|python -c \"import json; print(json.dumps({'ok': True}))\""],
    ["Automatización","python -m pip list|python -m venv .venv|python -c \"import datetime; print(datetime.date.today())\""]
  ]}
];

export const CURRICULUM_DATA = tracks.map(t => ({
  id:t.id,title:t.title,subtitle:`Ruta práctica de ${t.title}.`,tier:t.tier,badge:t.badge,prompt:t.prompt,
  lessons:t.sets.map(([title,commands],i) => ({
    id:`${t.id}-${String(i+1).padStart(2,"0")}`,title,
    theory:`Aprende ${title.toLowerCase()} en ${t.title}. Ejecuta cada comando, observa el resultado y comprende sus parámetros.`,
    anatomy:[{type:"executable",token:commands.split("|")[0].split(" ")[0],role:"Comando principal"}],
    steps:commands.split("|").map((command,j)=>({
      instruction:["Ejecuta la operación principal.","Aplica el siguiente comando y revisa su resultado.","Finaliza la práctica y valida la salida."][j],
      validCommands:[command],hint:`Escribe exactamente: ${command}`,simulatedOutput:`[OK] Operación completada: ${command}`,
      anatomy:[{type:"executable",token:command.split(" ")[0],role:"Comando CLI"}]
    }))
  })),
  examChallenges:t.sets.slice(0,5).map(([title,commands],i)=>({
    id:`${t.id}-exam-${i+1}`,scenario:`Reto ${i+1}: completa una tarea de ${title} en ${t.title}.`,
    prompt:t.prompt,hint:`Pista: ${commands.split("|")[0]}`,validCommands:[commands.split("|")[0]],
    explanation:`El comando ${commands.split("|")[0]} resuelve esta tarea. Verifica sus parámetros y el contexto.`
  }))
}));

export const SUBSCRIPTION_PLANS = [
  {id:"free",name:"Cadet",badge:"INICIO GRATUITO",priceMonthlyCOP:0,popular:false,description:"Aprende los fundamentos de la terminal.",features:["Rutas de Linux y Git","Misiones básicas","Diccionario CLI","Progreso local"],limitations:["Rutas avanzadas bloqueadas"]},
  {id:"pro",name:"Pro Operator",badge:"MÁS POPULAR",priceMonthlyCOP:29900,popular:true,description:"Amplía tus habilidades técnicas.",features:["Todo lo incluido en Cadet","Docker y Redes","Arena de entrenamiento","Personalización"],limitations:["SQL y Python requieren Team"]},
  {id:"team",name:"Cyber Squad",badge:"ACCESO TOTAL",priceMonthlyCOP:89900,popular:false,description:"Acceso completo a todas las rutas.",features:["Todas las rutas","SQL y Python","Contenido avanzado","Experiencia completa"],limitations:[]}
];

export const DAILY_BOUNTIES = [
  {id:"bounty-linux-list",title:"Explorador de archivos",description:"Lista archivos, incluidos los ocultos.",hint:"Combina ls con -la.",prompt:"cadet@dojo:~$",difficulty:"fácil",xpReward:35,proOnly:false,validCommands:["ls -la"]},
  {id:"bounty-git-status",title:"Estado del repositorio",description:"Consulta los cambios de Git.",hint:"Usa git status.",prompt:"git@dojo:~/repo$",difficulty:"fácil",xpReward:40,proOnly:false,validCommands:["git status"]},
  {id:"bounty-docker-ps",title:"Contenedores activos",description:"Muestra los contenedores activos.",hint:"Docker seguido de ps.",prompt:"ops@dojo:~$",difficulty:"media",xpReward:60,proOnly:true,validCommands:["docker ps"]}
];

export const LEADERBOARD_ENTRIES = [
  {name:"KernelFox",handle:"kernelfox",xp:2450,country:"CO"},{name:"ByteRider",handle:"byterider",xp:2180,country:"MX"},
  {name:"RootNova",handle:"rootnova",xp:1960,country:"AR"},{name:"ShellPilot",handle:"shellpilot",xp:1720,country:"CO"}
];

export const BOSS_BATTLES = [
  {id:"boss-malware",name:"Malware Overlord",bossName:"Malware Overlord",title:"Contención de amenazas",lore:"Identifica y contiene una amenaza en el sistema.",xpReward:250,medalTitle:"Defensor del Kernel",prompt:"root@incident:~$",phases:[
    {phaseTitle:"Identificar procesos",instruction:"Identifica los procesos activos.",hint:"Consulta todos los procesos.",validCommands:["ps aux"]},
    {phaseTitle:"Inspeccionar recursos",instruction:"Revisa el uso de memoria.",hint:"Usa el monitor de procesos.",validCommands:["top"]},
    {phaseTitle:"Revisar conexiones",instruction:"Lista puertos abiertos.",hint:"Muestra sockets en escucha.",validCommands:["ss -tuln"]},
    {phaseTitle:"Aislar servicio",instruction:"Detén el proceso de ejemplo.",hint:"Envía señal al PID.",validCommands:["kill 1234"]},
    {phaseTitle:"Validar recuperación",instruction:"Comprueba el servicio SSH.",hint:"Consulta su estado.",validCommands:["sudo systemctl status ssh"]}
  ]},
  {id:"boss-outage",name:"Kernel Phantom",bossName:"Kernel Phantom",title:"Recuperación de infraestructura",lore:"Recupera la disponibilidad de la infraestructura.",xpReward:300,medalTitle:"Arquitecto de Resiliencia",prompt:"root@recovery:~$",phases:[
    {phaseTitle:"Verificar host",instruction:"Consulta el nombre del servidor.",hint:"Usa hostname.",validCommands:["hostname"]},
    {phaseTitle:"Revisar interfaces",instruction:"Inspecciona direcciones IP.",hint:"Usa ip addr.",validCommands:["ip addr"]},
    {phaseTitle:"Comprobar ruta",instruction:"Consulta las rutas de red.",hint:"Usa ip route.",validCommands:["ip route"]},
    {phaseTitle:"Probar DNS",instruction:"Comprueba resolución de dominio.",hint:"Usa nslookup.",validCommands:["nslookup google.com"]},
    {phaseTitle:"Validar HTTP",instruction:"Comprueba el servicio web.",hint:"Solicita cabeceras HTTP.",validCommands:["curl -I https://example.com"]}
  ]}
];

export const OPERATOR_AVATARS = [
  ["avatar-root","Root Operator","SysAdmin","🧑‍💻","from-green-900 to-black"],["avatar-cyber","Cyber Sentinel","Security Ops","🦾","from-cyan-900 to-black"],
  ["avatar-ninja","Terminal Ninja","CLI Specialist","🥷","from-slate-700 to-black"],["avatar-fox","Packet Fox","Network Ops","🦊","from-orange-900 to-black"],
  ["avatar-ghost","Ghost Admin","Cloud Ops","👻","from-violet-900 to-black"],["avatar-python","Python Coder","Automation","🐍","from-yellow-900 to-black"],
  ["avatar-docker","Container Master","Containers","🐳","from-blue-900 to-black"],["avatar-database","Data Architect","Database","🗄️","from-emerald-900 to-black"]
].map(([id,name,role,emoji,bgClass])=>({id,name,role,emoji,bgClass}));

export const TERMINAL_THEMES_SHOP = [
  {id:"theme-default",name:"Matrix Green",description:"Verde clásico de terminal.",costXP:0,previewColors:["#39ff14","#00f0ff","#050807"],cssVars:{"--neonGreen":"#39ff14","--neonCyan":"#00f0ff","--neonAmber":"#ffb000","--neonRed":"#ff3131"}},
  {id:"theme-cyan",name:"Cyber Cyan",description:"Interfaz fría de alto contraste.",costXP:250,previewColors:["#00f0ff","#39ff14","#050807"],cssVars:{"--neonGreen":"#00f0ff","--neonCyan":"#39ff14","--neonAmber":"#ffb000","--neonRed":"#ff3131"}},
  {id:"theme-amber",name:"Amber Terminal",description:"Inspirado en terminales retro.",costXP:500,previewColors:["#ffb000","#00f0ff","#050807"],cssVars:{"--neonGreen":"#ffb000","--neonCyan":"#00f0ff","--neonAmber":"#39ff14","--neonRed":"#ff3131"}}
];

export const KEYBOARD_SOUND_PROFILES = [
  {id:"sound-default",name:"Mechanical Classic",description:"Respuesta mecánica equilibrada.",costXP:0},
  {id:"sound-blue",name:"Blue Switch",description:"Clic marcado y agudo.",costXP:150},
  {id:"sound-red",name:"Red Switch",description:"Pulsación lineal y silenciosa.",costXP:300}
];

export const DUEL_RIVALS_DATA = [
  {id:"rival-01",name:"PacketWolf",handle:"packetwolf",institution:"Colombia"},
  {id:"rival-02",name:"RootByte",handle:"rootbyte",institution:"Colombia"}
];

export const DUEL_ROUNDS_DATA = [
  {roundTitle:"Ronda 1 — Diagnóstico",scenario:"Identifica el directorio actual.",prompt:"duel@arena:~$",hint:"Usa pwd.",validCommands:["pwd"]},
  {roundTitle:"Ronda 2 — Archivos",scenario:"Lista archivos incluidos los ocultos.",prompt:"duel@arena:~$",hint:"Usa ls -la.",validCommands:["ls -la"]},
  {roundTitle:"Ronda 3 — Git",scenario:"Consulta el estado del repositorio.",prompt:"duel@git:~$",hint:"Usa git status.",validCommands:["git status"]},
  {roundTitle:"Ronda 4 — Red",scenario:"Consulta las interfaces IP.",prompt:"duel@net:~$",hint:"Usa ip addr.",validCommands:["ip addr"]},
  {roundTitle:"Ronda 5 — Contenedores",scenario:"Lista contenedores activos.",prompt:"duel@docker:~$",hint:"Usa docker ps.",validCommands:["docker ps"]}
];

export const STUDY_METHODS_DATA = [
  {icon:"🧠",title:"Práctica deliberada",badge:"APRENDER HACIENDO",description:"Divide los retos en pasos pequeños. Ejecuta el comando, observa la salida y explica qué cambió."},
  {icon:"🔁",title:"Repetición espaciada",badge:"RETENCIÓN",description:"Repasa comandos en sesiones cortas y vuelve a practicar los que resulten difíciles."},
  {icon:"🧩",title:"Recuperación activa",badge:"MEMORIA",description:"Intenta recordar el comando antes de revelar la pista o consultar el diccionario."}
];

export const STUDY_FLASHCARDS_DATA = [
  {question:"¿Qué comando muestra el directorio actual?",answer:"pwd",tip:"Print Working Directory."},
  {question:"¿Qué comando consulta el estado de Git?",answer:"git status",tip:"Úsalo antes de confirmar cambios."},
  {question:"¿Qué comando lista contenedores activos?",answer:"docker ps",tip:"Añade -a para incluir los detenidos."},
  {question:"¿Qué sentencia SQL consulta registros?",answer:"SELECT",tip:"Combínala con FROM y WHERE."},
  {question:"¿Qué módulo de Python trabaja con rutas?",answer:"pathlib",tip:"Path.cwd() devuelve el directorio actual."}
];
