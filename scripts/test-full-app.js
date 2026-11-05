/**
 * SHELLDOJO - SUITE INTEGRAL DE PRUEBAS DE FUNCIONAMIENTO Y SEGURIDAD
 * Ejecuta validaciones estáticas, auditoría de seguridad y pruebas E2E contra el servidor.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
    results.push({ ok: true, message });
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    results.push({ ok: false, message });
  }
}

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path || '/', BASE_URL);
    const headers = { ...(options.headers || {}) };
    let payload = null;

    if (postData !== null && postData !== undefined) {
      payload = typeof postData === 'string' ? postData : JSON.stringify(postData);
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n============================================================');
  console.log('       🛡️ SHELLDOJO - AUDITORÍA COMPLETA Y SUITE DE PRUEBAS   ');
  console.log('============================================================\n');

  /* ------------------------------------------------------------------
   * FASE 1: INTEGRIDAD DE CÓDIGO Y ARCHIVOS ESTÁTICOS
   * ------------------------------------------------------------------ */
  console.log('--- FASE 1: Integridad de Archivos y Caché PWA ---');

  const swContent = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const cacheRegex = /'(.\/[^']+)'/g;
  let match;
  const cachedFiles = [];
  while ((match = cacheRegex.exec(swContent)) !== null) {
    if (match[1] !== './') cachedFiles.push(match[1].replace('./', ''));
  }

  let allAssetsExist = true;
  for (const file of cachedFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      allAssetsExist = false;
      console.error(`  Missing asset in sw.js: ${file}`);
    }
  }
  assert(allAssetsExist, 'Todos los recursos cacheados en sw.js existen en disco');

  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert(indexHtml.includes('id="view-feedback"'), 'index.html contiene la vista de feedback #view-feedback');
  assert(indexHtml.includes('id="view-duel"'), 'index.html contiene la arena 1v1 #view-duel');
  assert(indexHtml.includes('id="view-verify"'), 'index.html contiene el validador de diplomas #view-verify');
  assert(indexHtml.includes('id="view-portfolio"'), 'index.html contiene el portafolio #view-portfolio');
  assert(indexHtml.includes('id="checkout-modal"'), 'index.html contiene el modal de pasarela de pagos');

  const adminHtml = fs.readFileSync(path.join(ROOT_DIR, 'admin', 'index.html'), 'utf8');
  assert(adminHtml.includes('data-tab="feedback"'), 'admin/index.html incluye pestaña de Opiniones');
  assert(adminHtml.includes('data-tab="users"'), 'admin/index.html incluye pestaña de Usuarios');
  assert(adminHtml.includes('data-tab="payments"'), 'admin/index.html incluye pestaña de Pagos');
  assert(adminHtml.includes('data-tab="certificates"'), 'admin/index.html incluye pestaña de Certificados');

  /* ------------------------------------------------------------------
   * FASE 2: AUDITORÍA DE SEGURIDAD (PROTECCIÓN DE DATOS Y PRIVACIDAD)
   * ------------------------------------------------------------------ */
  console.log('\n--- FASE 2: Auditoría de Seguridad & Pentesting Básico ---');

  // 2.1 Intentos de Path Traversal
  const traversal1 = await request({ path: '/../server.js' });
  assert(traversal1.status === 404, 'Path Traversal /../server.js bloqueado con 404');

  const traversal2 = await request({ path: '/data/admin.json' });
  assert(traversal2.status === 404, 'Acceso directo a /data/admin.json bloqueado con 404');

  const traversal3 = await request({ path: '/data/store.json' });
  assert(traversal3.status === 404, 'Acceso directo a /data/store.json bloqueado con 404');

  const traversal4 = await request({ path: '/%2e%2e/%2e%2e/data/admin.json' });
  assert(traversal4.status === 404, 'Path Traversal con URL-encoding bloqueado con 404');

  // 2.2 Verificación de Headers de Seguridad
  const homeRes = await request({ path: '/' });
  assert(homeRes.status === 200, 'Sitio público responde 200 OK');
  assert(homeRes.headers['x-content-type-options'] === 'nosniff', 'Cabecera X-Content-Type-Options: nosniff presente');
  assert(homeRes.headers['x-frame-options'] === 'DENY', 'Cabecera anti-clickjacking X-Frame-Options: DENY presente');

  // 2.3 Acceso No Autorizado al API del Administrador
  const unauthStats = await request({ path: '/api/admin/stats' });
  assert(unauthStats.status === 401, 'Endpoint /api/admin/stats bloquea acceso sin sesión (401)');

  const unauthUsers = await request({ path: '/api/admin/users' });
  assert(unauthUsers.status === 401, 'Endpoint /api/admin/users bloquea acceso sin sesión (401)');

  const unauthFeedback = await request({ path: '/api/admin/feedback' });
  assert(unauthFeedback.status === 401, 'Endpoint /api/admin/feedback bloquea acceso sin sesión (401)');

  const unauthBackup = await request({ path: '/api/admin/backup' });
  assert(unauthBackup.status === 401, 'Endpoint /api/admin/backup bloquea descarga sin sesión (401)');

  /* ------------------------------------------------------------------
   * FASE 3: PRUEBAS FUNCIONALES CLIENTE & PÚBLICAS
   * ------------------------------------------------------------------ */
  console.log('\n--- FASE 3: Endpoints Públicos de Clientes ---');

  // 3.1 Obtener correo de admin
  const emailRes = await request({ path: '/api/client/admin-email' });
  assert(emailRes.status === 200 && emailRes.json?.adminEmail, 'GET /api/client/admin-email entrega correo configurado');

  // 3.2 Envío de Feedback de Cliente
  const testFeedbackPayload = {
    name: 'Operador Test Audit',
    email: 'audit-test@shelldojo.io',
    rating: 5,
    category: 'Felicitaciones y Reseña',
    message: 'Prueba automatizada de satisfacción y seguridad en ShellDojo.'
  };

  const postFbRes = await request(
    {
      path: '/api/client/feedback',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    testFeedbackPayload
  );
  assert(postFbRes.status === 200 && postFbRes.json?.ok === true, 'POST /api/client/feedback registra opinión con éxito');

  // 3.3 Listado de Feedback Público (debe ocultar el email del cliente por privacidad)
  const getFbRes = await request({ path: '/api/client/feedback' });
  assert(getFbRes.status === 200 && Array.isArray(getFbRes.json), 'GET /api/client/feedback devuelve lista de opiniones');
  const foundFb = getFbRes.json.find((f) => f.name === testFeedbackPayload.name);
  assert(foundFb && !foundFb.email, 'Privacidad garantizada: GET /api/client/feedback NO expone el correo del cliente públicamente');

  // 3.4 Pagos de Clientes
  const validPayment = {
    reference: `AUDIT-PAY-${Date.now()}`,
    cus: 'CUS-TEST-1234',
    amountCOP: 89000,
    planId: 'pro',
    planName: 'Pro Operator',
    buyerEmail: 'cliente-seguro@gmail.com',
    buyerDoc: '1098765432',
    method: 'pse',
    methodLabel: 'PSE - Bancolombia'
  };

  const payRes = await request(
    {
      path: '/api/client/payments',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    validPayment
  );
  assert(payRes.status === 200 && payRes.json?.ok === true, 'POST /api/client/payments registra comprobante de pago');

  // 3.5 Intento de pago malicioso / inválido (monto 0 o negativo)
  const invalidPayment = {
    reference: `FAIL-${Date.now()}`,
    amountCOP: -5000,
    planId: 'pro'
  };
  const failPayRes = await request(
    {
      path: '/api/client/payments',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    invalidPayment
  );
  assert(failPayRes.status === 400, 'POST /api/client/payments rechaza montos inválidos o negativos (400)');

  /* ------------------------------------------------------------------
   * FASE 4: DUELO 1V1 MULTIJUGADOR REAL (SIN BOTS SIMULADOS)
   * ------------------------------------------------------------------ */
  console.log('\n--- FASE 4: Duelo 1v1 Real (Sin Bots Simulados) ---');

  const testRoomCode = `TEST${Math.floor(1000 + Math.random() * 9000)}`;

  // 4.1 Jugador 1 se conecta -> Sala en espera (waiting)
  const hb1 = await request(
    {
      path: '/api/duel/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { roomCode: testRoomCode, playerId: 'p1_tester', handle: 'AliceNet' }
  );
  assert(hb1.status === 200 && hb1.json?.room?.status === 'waiting', '1 solo jugador en la sala: Estado = "waiting" (no inicia simulado)');

  // 4.2 Jugador 2 se conecta a la misma sala -> Sala inicia (in_progress)
  const hb2 = await request(
    {
      path: '/api/duel/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { roomCode: testRoomCode, playerId: 'p2_tester', handle: 'BobCyber' }
  );
  assert(hb2.status === 200 && hb2.json?.room?.status === 'in_progress', '2 personas conectadas: Duelo multijugador se activa (in_progress)');

  // 4.3 Envío de comando en el Duelo
  const cmdRes = await request(
    {
      path: '/api/duel/command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { roomCode: testRoomCode, playerId: 'p1_tester', command: 'git init' }
  );
  assert(cmdRes.status === 200 && cmdRes.json?.ok === true, 'POST /api/duel/command evalúa y puntúa comandos en tiempo real');

  // 4.4 Jugador 2 sale de la sala -> Vuelve a 'waiting'
  await request(
    {
      path: '/api/duel/leave',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { roomCode: testRoomCode, playerId: 'p2_tester' }
  );
  const hb1After = await request(
    {
      path: '/api/duel/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { roomCode: testRoomCode, playerId: 'p1_tester', handle: 'AliceNet' }
  );
  assert(hb1After.json?.room?.status === 'waiting', 'Cuando el rival abandona, la sala vuelve a espera y no continúa sola');

  /* ------------------------------------------------------------------
   * FASE 5: PANEL DE ADMINISTRACIÓN Y OPERACIONES CRUD EN BD
   * ------------------------------------------------------------------ */
  console.log('\n--- FASE 5: Panel de Administración & CRUD Base de Datos ---');

  // 5.1 Intento de Login con clave incorrecta
  const badLogin = await request(
    {
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'shelldojo-admin' }
    },
    { username: 'admin', password: 'wrongpassword' }
  );
  assert(badLogin.status === 401, 'Login de admin rechaza credenciales incorrectas (401)');

  // 5.2 Login exitoso con credenciales oficiales
  const goodLogin = await request(
    {
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'shelldojo-admin' }
    },
    { username: 'admin', password: 'admin123' }
  );
  assert(goodLogin.status === 200 && goodLogin.json?.ok === true, 'Login de admin exitoso con admin / admin123');

  const setCookie = goodLogin.headers['set-cookie']?.[0] || '';
  const sessionCookie = setCookie.split(';')[0];
  assert(setCookie.includes('HttpOnly'), 'Cookie de sesión de admin incluye flag de máxima seguridad HttpOnly');

  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'shelldojo-admin',
    Cookie: sessionCookie
  };

  // 5.3 Sesión Activa /me
  const meRes = await request({ path: '/api/admin/me', headers: authHeaders });
  assert(meRes.status === 200 && meRes.json?.username === 'admin', 'GET /api/admin/me valida la sesión activa del admin');

  // 5.4 Stats completas
  const statsRes = await request({ path: '/api/admin/stats', headers: authHeaders });
  assert(
    statsRes.status === 200 &&
      statsRes.json?.totalUsers !== undefined &&
      statsRes.json?.totalFeedback !== undefined,
    'GET /api/admin/stats entrega estadísticas consolidadas de usuarios y feedback'
  );

  // 5.5 CRUD Usuarios: Crear -> Modificar Plan -> Eliminar
  const newAuditUser = {
    name: 'Estudiante Auditoría',
    email: `auditor-${Date.now()}@test.com`,
    plan: 'free',
    xp: 250
  };
  const createUserRes = await request(
    { path: '/api/admin/users', method: 'POST', headers: authHeaders },
    newAuditUser
  );
  assert(createUserRes.status === 201 && createUserRes.json?.user?.id, 'CRUD Admin: Crear usuario en la BD');

  const createdUserId = createUserRes.json?.user?.id;
  const updateUserRes = await request(
    { path: '/api/admin/users', method: 'PUT', headers: authHeaders },
    { id: createdUserId, plan: 'pro', xp: 1500 }
  );
  assert(updateUserRes.status === 200, 'CRUD Admin: Actualizar usuario (cambio de plan a PRO y XP)');

  const deleteUserRes = await request(
    { path: '/api/admin/users', method: 'DELETE', headers: authHeaders },
    { id: createdUserId }
  );
  assert(deleteUserRes.status === 200, 'CRUD Admin: Eliminar usuario de la BD');

  // 5.6 CRUD Certificados: Emitir -> Revocar -> Restaurar -> Eliminar
  const testCertId = `SDJ-AUDIT-${Date.now().toString(36).toUpperCase()}`;
  const createCertRes = await request(
    { path: '/api/admin/certificates', method: 'POST', headers: authHeaders },
    {
      certificateId: testCertId,
      recipientName: 'Carlos Ingeniero',
      recipientDoc: '11223344',
      recipientEmail: 'carlos@audit.com',
      achievementTitle: 'Arquitectura Linux & Docker',
      xpTotal: 3000
    }
  );
  assert(createCertRes.status === 201, 'CRUD Admin: Emitir nuevo certificado oficial en la BD');

  const revokeCertRes = await request(
    { path: '/api/admin/certificates', method: 'PUT', headers: authHeaders },
    { certificateId: testCertId, revoked: true }
  );
  assert(revokeCertRes.status === 200 && revokeCertRes.json?.cert?.revoked === true, 'CRUD Admin: Revocar certificado');

  const deleteCertRes = await request(
    { path: '/api/admin/certificates', method: 'DELETE', headers: authHeaders },
    { certificateId: testCertId }
  );
  assert(deleteCertRes.status === 200, 'CRUD Admin: Eliminar certificado');

  // 5.7 CRUD Feedback: Modificar estado leído -> Eliminar feedback de prueba
  const adminFbList = await request({ path: '/api/admin/feedback', headers: authHeaders });
  assert(adminFbList.status === 200 && Array.isArray(adminFbList.json), 'CRUD Admin: Listar opiniones de clientes');

  const sampleFb = adminFbList.json.find((f) => f.name === testFeedbackPayload.name);
  if (sampleFb) {
    const markReadRes = await request(
      { path: '/api/admin/feedback', method: 'PUT', headers: authHeaders },
      { id: sampleFb.id, read: true }
    );
    assert(markReadRes.status === 200, 'CRUD Admin: Marcar opinión como leída');

    const delFbRes = await request(
      { path: '/api/admin/feedback', method: 'DELETE', headers: authHeaders },
      { id: sampleFb.id }
    );
    assert(delFbRes.status === 200, 'CRUD Admin: Eliminar opinión');
  }

  // 5.8 Configuración del Correo Receptor del Admin
  const emailCfgRes = await request({ path: '/api/admin/email-config', headers: authHeaders });
  assert(emailCfgRes.status === 200 && emailCfgRes.json?.adminEmail, 'CRUD Admin: Obtener correo receptor configurado');

  const saveEmailRes = await request(
    { path: '/api/admin/email-config', method: 'POST', headers: authHeaders },
    { adminEmail: 'soporteshelldojo@gmail.com' }
  );
  assert(saveEmailRes.status === 200 && saveEmailRes.json?.adminEmail === 'soporteshelldojo@gmail.com', 'CRUD Admin: Guardar nuevo correo receptor');

  // 5.9 Backup íntegro de la Base de Datos
  const backupRes = await request({ path: '/api/admin/backup', headers: authHeaders });
  assert(
    backupRes.status === 200 &&
      backupRes.json?.users !== undefined &&
      backupRes.json?.payments !== undefined &&
      backupRes.json?.certificates !== undefined &&
      backupRes.json?.feedback !== undefined,
    'CRUD Admin: Descarga de backup íntegro de store.json con todas las tablas'
  );

  // 5.10 Cierre de Sesión (Logout)
  const logoutRes = await request({ path: '/api/admin/logout', method: 'POST', headers: authHeaders });
  assert(logoutRes.status === 200, 'Logout de admin invalida la sesión');

  const postLogoutRes = await request({ path: '/api/admin/stats', headers: authHeaders });
  assert(postLogoutRes.status === 401, 'Tras logout, la sesión queda destruida y el acceso bloqueado (401)');

  console.log('\n============================================================');
  console.log(`  RESULTADO FINAL DE LA PRUEBA: ${passed} APROBADAS / ${failed} FALLIDAS`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error fatal durante la ejecución de las pruebas:', err);
  process.exit(1);
});
