/**
 * SHELLDOJO - SINCRONIZADOR SILENCIOSO CLIENTE -> SERVIDOR
 * Envía eventos reales al backend (registro de usuario, transacciones de pago, certificados emitidos)
 * para que el panel de administración muestre estadísticas y datos reales de la plataforma.
 * Diseñado a prueba de fallos: si el servidor está offline, no interrumpe al usuario.
 */

const IS_REMOTE_ORIGIN = typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.port !== '3000');
const BACKEND_BASE = IS_REMOTE_ORIGIN ? 'http://localhost:3000' : '';

async function postJson(endpoint, data) {
  try {
    const res = await fetch(`${BACKEND_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncUserRegistration(user) {
  if (!user || !user.email) return;
  return postJson('/api/client/register', {
    name: user.name,
    handle: user.handle,
    email: user.email,
    docType: user.docType,
    docNumber: user.docNumber,
    phone: user.phone,
    country: user.country,
    institution: user.institution,
    occupation: user.occupation,
    plan: user.plan || 'free',
    xp: Number(user.xp || 0)
  });
}

export async function syncPaymentTransaction(receipt) {
  if (!receipt) return;
  return postJson('/api/client/payment', receipt);
}

export async function syncIssuedCertificate(certData) {
  if (!certData || !certData.certificateId) return;
  return postJson('/api/client/certificate', certData);
}

/**
 * Sincronización bidireccional en tiempo real entre el navegador y la base de datos (store.json).
 * Garantiza que cualquier usuario registrado en el cliente o creado en el panel admin esté siempre al día.
 */
export async function syncAppStateWithBackend() {
  try {
    const raw = localStorage.getItem('shelldojo_state_v6');
    const parsed = raw ? JSON.parse(raw) : {};
    const localUsers = parsed.registeredUsers || (parsed.user ? [parsed.user] : []);
    const localPayments = parsed.payments || [];
    const localCerts = parsed.issuedCertificates || [];

    const res = await postJson('/api/client/sync-all', {
      users: localUsers,
      user: parsed.user,
      payments: localPayments,
      certificates: localCerts
    });

    if (res && res.ok && Array.isArray(res.users)) {
      let stateChanged = false;

      // Unir usuarios del servidor con el almacenamiento local
      const localMap = new Map();
      (parsed.registeredUsers || []).forEach((u) => {
        if (u && u.email) localMap.set(u.email.toLowerCase(), u);
      });

      res.users.forEach((serverUser) => {
        if (!serverUser || !serverUser.email) return;
        const key = serverUser.email.toLowerCase();
        const existing = localMap.get(key);
        if (!existing) {
          localMap.set(key, { ...serverUser });
          stateChanged = true;
        } else {
          // Si el admin cambió el plan en la base de datos, actualizarlo inmediatamente
          if (serverUser.plan && serverUser.plan !== existing.plan) {
            existing.plan = serverUser.plan;
            stateChanged = true;
          }
          if (typeof serverUser.xp === 'number' && serverUser.xp > (existing.xp || 0)) {
            existing.xp = serverUser.xp;
            stateChanged = true;
          }
        }
      });

      // Si el usuario logueado actualmente tuvo cambios de plan o XP en el panel de control
      if (parsed.user && parsed.user.email) {
        const updated = localMap.get(parsed.user.email.toLowerCase());
        if (updated) {
          if (parsed.user.plan !== updated.plan) {
            parsed.user.plan = updated.plan;
            parsed.plan = updated.plan;
            stateChanged = true;
          }
          if (updated.xp > (parsed.xp || 0)) {
            parsed.xp = updated.xp;
            stateChanged = true;
          }
        }
      }

      parsed.registeredUsers = Array.from(localMap.values());
      if (stateChanged) {
        localStorage.setItem('shelldojo_state_v6', JSON.stringify(parsed));
      }
      return res;
    }
  } catch (err) {
    // Si el backend no está disponible en este instante, continuar offline
  }
}

export async function fetchRemoteLeaderboard() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/client/leaderboard`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function verifyRemoteCertificate(code) {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/client/verify-cert?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ------------------------ Duelo 1v1 Multijugador Real ------------------------ */

export async function sendDuelHeartbeat(payload) {
  return postJson('/api/duel/heartbeat', payload);
}

export async function submitDuelCommand(payload) {
  return postJson('/api/duel/submit', payload);
}

export async function resetDuelRoom(payload) {
  return postJson('/api/duel/reset', payload);
}

export async function leaveDuelRoom(payload) {
  return postJson('/api/duel/leave', payload);
}

/* ------------------------ Buzón de Opinión / Feedback ------------------------ */

export async function sendClientFeedback(feedbackData) {
  return postJson('/api/client/feedback', feedbackData);
}

export async function fetchPublicFeedback() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/client/feedback`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchAdminEmail() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/client/admin-email`);
    if (!res.ok) return 'soporteshelldojo@gmail.com';
    const data = await res.json();
    return data.adminEmail || 'soporteshelldojo@gmail.com';
  } catch {
    return 'soporteshelldojo@gmail.com';
  }
}
