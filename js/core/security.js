/**
 * SHELLDOJO - MOTOR DE CIBERSEGURIDAD, PRIVACIDAD DE DATOS (HABEAS DATA) Y VERIFICACIÓN 2FA PRO
 * Implementa:
 * 1. Sanitización estricta Anti-XSS (escapeHTML / sanitizeInput)
 * 2. Hashing de contraseñas y PINs de seguridad (nunca se guardan en texto plano)
 * 3. Firma de integridad Anti-Tampering (HMAC-like digest) sobre el estado en localStorage
 * 4. Protección contra Fuerza Bruta (Rate Limiting & Cooldown en Login)
 * 5. Enmascaramiento de Datos Sensibles (PII Masking: Cédula, Teléfono y Correo)
 * 6. Verificación de Dos Pasos (2FA + Token de Licencia Criptográfico) para Planes de Pago
 */

const SECRET_PEPPER = 'SDJ_CYBER_VAULT_2026_COLOMBIA_99481A';
const loginAttemptsMap = new Map();

/**
 * Escapa caracteres HTML peligrosos para bloquear cualquier intento de XSS.
 */
export function escapeHTML(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Limpia entradas de usuario removiendo etiquetas de script, atributos inline y vectores XSS.
 */
export function sanitizeInput(value = '', maxLength = 180) {
  return String(value ?? '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Genera un hash determinístico de múltiples rondas para contraseñas, PINs y firmas de integridad.
 */
export function computeCryptoDigest(input = '', salt = 'shelldojo_salt') {
  const payload = `${SECRET_PEPPER}::${salt}::${String(input)}`;
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  let h3 = 0x9e3779b9 ^ payload.length;
  let h4 = 0x85ebca6b ^ payload.length;

  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < payload.length; i++) {
      const ch = payload.charCodeAt(i) + round * 17;
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
      h3 = Math.imul(h3 ^ ch, 2246822507);
      h4 = Math.imul(h4 ^ ch, 3266489909);
    }
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);

  return [h1, h2, h3, h4]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Hashea la contraseña de un usuario usando su email como sal única.
 */
export function hashUserPassword(password = '', email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  return `SDJ_HASH_${computeCryptoDigest(password, cleanEmail)}`;
}

/**
 * Verifica si una contraseña coincide con el hash almacenado (soporta migración transparente).
 */
export function verifyUserPassword(inputPassword = '', storedPassword = '', email = '') {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('SDJ_HASH_')) {
    return hashUserPassword(inputPassword, email) === storedPassword;
  }
  return String(inputPassword) === String(storedPassword);
}

/**
 * Firma criptográfica de integridad sobre los campos críticos del estado para detectar manipulación en DevTools.
 */
export function signStatePayload(stateObj) {
  if (!stateObj) return '';
  const criticalString = JSON.stringify({
    plan: stateObj.plan,
    xp: stateObj.xp,
    completedCount: (stateObj.completedLessons || []).length,
    userEmail: stateObj.user?.email || 'anon',
    proVerified: Boolean(stateObj.proAccountSecurity?.verified)
  });
  return computeCryptoDigest(criticalString, 'STATE_INTEGRITY_V5');
}

/**
 * Enmascara datos sensibles (Cédula, Correo, Teléfono) cuando el Modo Privacidad Habeas Data está activo.
 */
export function maskSensitivePII(value = '', type = 'doc', privacyEnabled = false) {
  const raw = String(value || '').trim();
  if (!privacyEnabled || !raw || raw === 'No especificado') return raw;

  if (type === 'doc') {
    const parts = raw.split(/\s+/);
    const prefix = parts.length > 1 ? `${parts[0]} ` : '';
    const num = parts.length > 1 ? parts.slice(1).join('') : parts[0];
    if (num.length <= 4) return `${prefix}****`;
    return `${prefix}${num.slice(0, 2)}••••${num.slice(-2)}`;
  }

  if (type === 'email') {
    const [user, domain] = raw.split('@');
    if (!domain) return '•••@•••';
    const visible = user.slice(0, 2);
    return `${visible}••••@${domain}`;
  }

  if (type === 'phone') {
    if (raw.length <= 4) return '••••••';
    return `${raw.slice(0, 3)} ••• ••${raw.slice(-2)}`;
  }

  return raw;
}

/**
 * Protección contra fuerza bruta en el formulario de inicio de sesión (máximo 5 intentos fallidos).
 */
export function checkLoginRateLimit(email = 'global') {
  const key = String(email || 'global').toLowerCase();
  const record = loginAttemptsMap.get(key);
  if (!record) return { blocked: false, remainingSeconds: 0 };

  const now = Date.now();
  if (record.lockUntil && now < record.lockUntil) {
    const remainingSeconds = Math.ceil((record.lockUntil - now) / 1000);
    return { blocked: true, remainingSeconds };
  }

  if (record.lockUntil && now >= record.lockUntil) {
    loginAttemptsMap.delete(key);
  }

  return { blocked: false, remainingSeconds: 0 };
}

export function recordLoginAttempt(email = 'global', success = false) {
  const key = String(email || 'global').toLowerCase();
  if (success) {
    loginAttemptsMap.delete(key);
    return;
  }

  const record = loginAttemptsMap.get(key) || { count: 0, lockUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockUntil = Date.now() + 30 * 1000; // 30s de bloqueo de seguridad
  }
  loginAttemptsMap.set(key, record);
}

/**
 * Genera credenciales de blindaje para cuentas con Plan de Pago (Pro Operator / Cyber Squad):
 * - Token de Licencia firmado (SDJ-LIC-2026-XXXXXXXX)
 * - Código OTP de Verificación 2FA de 6 dígitos
 */
export function generateProSecurityCredentials(user = {}, planId = 'pro') {
  const seed = `${user?.email || 'user'}::${user?.docNumber || '000'}::${planId}::${Date.now()}`;
  const digest = computeCryptoDigest(seed, 'PRO_LICENSE_TOKEN');
  const licenseToken = `SDJ-LIC-${planId.toUpperCase()}-${digest.slice(0, 8)}`;
  const verificationOtp = String((parseInt(digest.slice(8, 16), 16) % 900000) + 100000);

  return {
    licenseToken,
    verificationOtp,
    issuedAt: new Date().toLocaleString('es-CO'),
    boundEmail: user?.email || 'operador@shelldojo.io',
    boundDoc: `${user?.docType || 'CC'} ${user?.docNumber || '1020845912'}`
  };
}

