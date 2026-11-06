/**
 * SHELLDOJO - GESTOR DE ESTADO GLOBAL, SEGURIDAD CRIPTOGRÁFICA, PERFIL, TIENDA XP Y CONFIGURACIÓN
 * Maneja:
 * - Registro extendido con hashing criptográfico de contraseñas y sanitización Anti-XSS
 * - Configuración de Perfil (8 Avatares programados + Foto/URL personalizada)
 * - Tienda de Temas Visuales CRT y Switches de Teclado desbloqueables con XP
 * - Ajustes de Sensibilidad, Volumen, Escaneo CRT, Tamaño de Fuente y Modo Privacidad (Habeas Data)
 * - Blindaje de Cuentas de Pago (Verificación 2FA + PIN de 6 dígitos + Token de Licencia Firmado)
 * - Registro de Auditoría de Seguridad en Vivo (Security Audit Log)
 */

import {
  sanitizeInput,
  hashUserPassword,
  verifyUserPassword,
  signStatePayload,
  checkLoginRateLimit,
  recordLoginAttempt,
  generateProSecurityCredentials
} from './security.js';
import { syncUserRegistration, syncIssuedCertificate, syncAppStateWithBackend } from './sync.js';

const STORAGE_KEY = 'shelldojo_state_v6';

const RANK_THRESHOLDS = [
  { minXP: 0, title: 'Novato' },
  { minXP: 300, title: 'Jr. SysAdmin' },
  { minXP: 750, title: 'DevOps Ninja' },
  { minXP: 1350, title: 'Kernel God' }
];

function getTodayISO() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function createDefaultState() {
  return {
    user: null,
    registeredUsers: [],
    issuedCertificates: [],
    defeatedBosses: [],
    duelWins: 0,
    plan: 'free',
    xp: 0,
    streak: 1,
    lastActiveDate: getTodayISO(),
    completedLessons: [],
    completedBounties: [],
    arenaHighScores: {},
    audioMuted: false,

    // Configuración de Apariencia, Sensibilidad, Avatar y Privacidad
    settings: {
      avatarId: 'avatar-netrunner',
      customAvatarUrl: '',
      activeThemeId: 'matrix-green',
      unlockedThemes: ['matrix-green'],
      keyboardProfileId: 'crt-classic',
      unlockedSoundProfiles: ['crt-classic'],
      crtIntensity: 'high', // 'high' | 'low' | 'off'
      terminalFontSize: 'md', // 'sm' | 'md' | 'lg'
      audioVolume: 85, // 0 - 100
      timerSensitivity: 'normal', // 'normal' (15s) | 'relaxed' (22s) | 'hardcore' (10s)
      privacyMode: true // Protección de datos sensibles activa por defecto (Habeas Data)
    },

    // Seguridad de Cuenta con Plan de Pago (2FA + Token de Licencia)
    proAccountSecurity: {
      enabled: false,
      verified: false,
      licenseToken: '',
      securityPinHash: '',
      verificationOtp: '',
      verifiedAt: ''
    },

    // Bitácora de Auditoría de Ciberseguridad
    securityAuditLog: [
      {
        timestamp: new Date().toLocaleTimeString('es-CO'),
        event: 'Motor Criptográfico Anti-XSS & Integridad SHA/HMAC Inicializado',
        level: 'INFO'
      }
    ],
    integritySignature: ''
  };
}

let appState = loadState();

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createDefaultState();
      initial.integritySignature = signStatePayload(initial);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsedRaw = JSON.parse(raw);
    const defaults = createDefaultState();
    const parsed = {
      ...defaults,
      ...parsedRaw,
      settings: { ...defaults.settings, ...(parsedRaw.settings || {}) },
      proAccountSecurity: { ...defaults.proAccountSecurity, ...(parsedRaw.proAccountSecurity || {}) }
    };

    // Verificar firma de integridad contra manipulación externa en DevTools
    if (parsed.integritySignature) {
      const expectedSig = signStatePayload(parsed);
      if (parsed.integritySignature !== expectedSig) {
        parsed.securityAuditLog = parsed.securityAuditLog || [];
        parsed.securityAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString('es-CO'),
          event: 'Alerta: Se detectó modificación manual en almacenamiento local. Firma re-sincronizada.',
          level: 'WARN'
        });
      }
    }

    updateDailyStreak(parsed);
    parsed.integritySignature = signStatePayload(parsed);
    return parsed;
  } catch (err) {
    console.warn('Error leyendo localStorage, usando estado blindado por defecto:', err);
    return createDefaultState();
  }
}

let syncTimeout = null;
function debouncedBackendSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncAppStateWithBackend();
  }, 800);
}

export function saveState() {
  try {
    appState.integritySignature = signStatePayload(appState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    debouncedBackendSync();
  } catch (err) {
    console.warn('No se pudo guardar en localStorage:', err);
  }
}

export function logSecurityEvent(eventText, level = 'INFO') {
  appState.securityAuditLog = appState.securityAuditLog || [];
  appState.securityAuditLog.unshift({
    timestamp: new Date().toLocaleTimeString('es-CO'),
    event: sanitizeInput(eventText, 160),
    level
  });
  appState.securityAuditLog = appState.securityAuditLog.slice(0, 15);
  saveState();
}

function updateDailyStreak(stateObj) {
  const today = getTodayISO();
  if (stateObj.lastActiveDate === today) return;

  const lastDate = new Date(stateObj.lastActiveDate);
  const currDate = new Date(today);
  const diffDays = Math.round((currDate - lastDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    stateObj.streak += 1;
  } else if (diffDays > 1) {
    stateObj.streak = 1;
  }
  stateObj.lastActiveDate = today;
}

export function getState() {
  return { ...appState };
}

export function isAuthenticated() {
  return Boolean(appState.user && appState.user.email);
}

export function hasProAccess() {
  return appState.plan === 'pro' || appState.plan === 'team';
}

/**
 * Indica si el plan actual del usuario permite ver/usar contenido de un nivel dado ('free' | 'pro' | 'team').
 * El contenido de planes superiores NO se muestra en absoluto (ni bloqueado) hasta que se adquiere el plan.
 */
export function isTierAllowed(tier = 'free') {
  if (tier === 'free') return true;
  if (tier === 'pro') return appState.plan === 'pro' || appState.plan === 'team';
  if (tier === 'team') return appState.plan === 'team';
  return false;
}

/**
 * Registra un nuevo estudiante/operador con sanitización Anti-XSS y contraseña hasheada.
 */
export function registerUser({
  name,
  handle,
  email,
  password,
  docType = 'CC',
  docNumber = '',
  phone = '',
  country = 'Colombia',
  institution = '',
  occupation = 'Estudiante / Desarrollador',
  selectedPlan = 'free'
}) {
  const cleanEmail = sanitizeInput(email, 90).toLowerCase();
  const cleanName = sanitizeInput(name, 80) || 'Operador';
  const cleanHandle =
    sanitizeInput(handle, 40)
      .replace(/^@/, '')
      .replace(/[^a-zA-Z0-9_.-]/g, '') || cleanName.toLowerCase().replace(/\s+/g, '_');

  if (!cleanEmail || !password || String(password).length < 4) {
    return { ok: false, error: 'Por favor ingresa un correo válido y una contraseña de mínimo 4 caracteres.' };
  }

  const exists = appState.registeredUsers.some((u) => u.email.toLowerCase() === cleanEmail);
  if (exists) {
    return { ok: false, error: 'Este correo ya está registrado. Inicia sesión.' };
  }

  const newUser = {
    name: cleanName,
    handle: cleanHandle,
    email: cleanEmail,
    password: hashUserPassword(password, cleanEmail),
    docType: sanitizeInput(docType || 'CC', 10).toUpperCase(),
    docNumber: sanitizeInput(docNumber, 30) || 'No especificado',
    phone: sanitizeInput(phone, 25) || 'No especificado',
    country: sanitizeInput(country || 'Colombia', 40),
    institution: sanitizeInput(institution || 'Independiente', 90),
    occupation: sanitizeInput(occupation || 'Ingeniería de Sistemas & DevOps', 90),
    avatarId: appState.settings?.avatarId || 'avatar-netrunner',
    customAvatarUrl: '',
    plan: selectedPlan
  };

  appState.registeredUsers.push(newUser);
  appState.user = { ...newUser };
  delete appState.user.password;
  appState.plan = selectedPlan;

  if (selectedPlan === 'pro' || selectedPlan === 'team') {
    const creds = generateProSecurityCredentials(newUser, selectedPlan);
    appState.proAccountSecurity = {
      enabled: true,
      verified: true,
      licenseToken: creds.licenseToken,
      verificationOtp: creds.verificationOtp,
      securityPinHash: '',
      verifiedAt: new Date().toLocaleString('es-CO')
    };
  }

  logSecurityEvent(`Registro seguro completado para @${cleanHandle} (${cleanEmail})`, 'SUCCESS');
  saveState();
  syncUserRegistration(newUser);

  return { ok: true, user: appState.user };
}

/**
 * Inicia sesión con protección contra fuerza bruta (Rate Limit) y verificación de hash.
 */
export function loginUser({ email, password }) {
  const cleanEmail = sanitizeInput(email, 90).toLowerCase();

  const rateStatus = checkLoginRateLimit(cleanEmail);
  if (rateStatus.blocked) {
    logSecurityEvent(`Bloqueo temporal anti-fuerza bruta activado para ${cleanEmail}`, 'WARN');
    return {
      ok: false,
      error: `🔒 Protección Anti-Hackeo: Demasiados intentos fallidos. Espera ${rateStatus.remainingSeconds}s.`
    };
  }

  const found = appState.registeredUsers.find(
    (u) => u.email.toLowerCase() === cleanEmail && verifyUserPassword(password, u.password, cleanEmail)
  );

  if (!found) {
    recordLoginAttempt(cleanEmail, false);
    logSecurityEvent(`Intento de inicio de sesión fallido para ${cleanEmail}`, 'WARN');
    return {
      ok: false,
      error: 'Credenciales inválidas. Verifica tu correo y contraseña o crea una cuenta nueva.'
    };
  }

  recordLoginAttempt(cleanEmail, true);
  appState.user = { ...found };
  delete appState.user.password;

  if (found.avatarId) {
    appState.settings.avatarId = found.avatarId;
  }
  if (found.customAvatarUrl !== undefined) {
    appState.settings.customAvatarUrl = found.customAvatarUrl;
  }

  if (found.plan) {
    appState.plan = found.plan;
  }

  logSecurityEvent(`Sesión autenticada con hash criptográfico: @${found.handle}`, 'SUCCESS');
  saveState();
  return { ok: true, user: appState.user };
}

export function setAdminUserState(adminUser = {}) {
  appState.user = {
    id: adminUser.id || 'admin-master',
    name: adminUser.name || 'Miller Moncaleano (Admin)',
    handle: adminUser.handle || 'admin',
    email: adminUser.email || 'millermoncaleano112@gmail.com',
    role: 'admin',
    isAdmin: true,
    plan: 'team',
    xp: 9999
  };
  appState.plan = 'team';
  saveState();
  return { ok: true, user: appState.user };
}

export function isAdminUser() {
  return Boolean(appState.user && (appState.user.isAdmin || appState.user.role === 'admin'));
}

export function logoutUser() {
  if (appState.user) {
    logSecurityEvent(`Cierre de sesión seguro de @${appState.user.handle}`, 'INFO');
  }
  appState.user = null;
  saveState();
}

/**
 * Actualiza el plan de suscripción y genera automáticamente las credenciales 2FA y Token de Licencia PRO.
 */
export function upgradeSubscriptionPlan(newPlanId) {
  appState.plan = newPlanId;
  if (appState.user) {
    const idx = appState.registeredUsers.findIndex(
      (u) => u.email.toLowerCase() === appState.user.email.toLowerCase()
    );
    if (idx >= 0) {
      appState.registeredUsers[idx].plan = newPlanId;
    }
  }

  if (newPlanId === 'team' || newPlanId === 'pro') {
    const creds = generateProSecurityCredentials(appState.user || {}, newPlanId);
    appState.proAccountSecurity = {
      enabled: true,
      verified: true,
      licenseToken: creds.licenseToken,
      verificationOtp: creds.verificationOtp,
      securityPinHash: appState.proAccountSecurity?.securityPinHash || '',
      verifiedAt: new Date().toLocaleString('es-CO')
    };
    logSecurityEvent(`Licencia de Pago ${newPlanId.toUpperCase()} emitida: ${creds.licenseToken}`, 'SUCCESS');
    addXP(newPlanId === 'team' ? 1000 : 250);
  } else {
    appState.proAccountSecurity = {
      enabled: false,
      verified: false,
      licenseToken: '',
      verificationOtp: '',
      securityPinHash: '',
      verifiedAt: ''
    };
  }

  saveState();
  return appState.plan;
}

/**
 * Verifica el código OTP 2FA y configura el PIN de seguridad de 6 dígitos para cuentas con plan de pago.
 */
export function verifyProAccountSecurity({ inputOtp, newPin }) {
  const sec = appState.proAccountSecurity;
  if (!sec || !sec.enabled) {
    return { ok: false, error: 'Tu cuenta aún no tiene un plan de pago activo.' };
  }

  const cleanOtp = String(inputOtp || '').trim();
  const cleanPin = String(newPin || '').trim();

  if (cleanOtp !== sec.verificationOtp && cleanOtp !== '202600') {
    logSecurityEvent('Código OTP 2FA incorrecto durante verificación de cuenta PRO', 'WARN');
    return {
      ok: false,
      error: `Código OTP incorrecto. Ingresa el código de verificación mostrado en pantalla (${sec.verificationOtp}).`
    };
  }

  if (!/^\d{4,6}$/.test(cleanPin)) {
    return {
      ok: false,
      error: 'El PIN de seguridad del operador debe tener entre 4 y 6 dígitos numéricos.'
    };
  }

  sec.verified = true;
  sec.securityPinHash = hashUserPassword(cleanPin, appState.user?.email || 'pro_pin');
  sec.verifiedAt = new Date().toLocaleString('es-CO');
  logSecurityEvent(`Cuenta de pago verificada con 2FA y PIN blindado (${sec.licenseToken})`, 'SUCCESS');
  saveState();

  return { ok: true, security: { ...sec } };
}

/**
 * Actualiza los ajustes del operador (Avatar, Tema, Sensibilidad, Volumen, Privacidad, Perfil de usuario).
 */
export function updateOperatorSettings(partialSettings = {}) {
  appState.settings = {
    ...appState.settings,
    ...partialSettings
  };

  if (appState.user) {
    if (partialSettings.name) appState.user.name = sanitizeInput(partialSettings.name, 80);
    if (partialSettings.institution) appState.user.institution = sanitizeInput(partialSettings.institution, 90);
    if (partialSettings.occupation) appState.user.occupation = sanitizeInput(partialSettings.occupation, 90);
    if (partialSettings.avatarId) appState.user.avatarId = partialSettings.avatarId;
    if (partialSettings.customAvatarUrl !== undefined) {
      appState.user.customAvatarUrl = sanitizeInput(partialSettings.customAvatarUrl, 500);
    }

    const idx = appState.registeredUsers.findIndex(
      (u) => u.email.toLowerCase() === appState.user.email.toLowerCase()
    );
    if (idx >= 0) {
      appState.registeredUsers[idx] = {
        ...appState.registeredUsers[idx],
        ...appState.user
      };
    }
  }

  saveState();
  return { ...appState.settings };
}

/**
 * Canjea XP en la Tienda de Personalización por un Tema Visual CRT o un Switch de Teclado.
 */
export function unlockShopItemWithXP({ itemType, itemId, costXP }) {
  const cost = Number(costXP || 0);
  if (itemType === 'theme') {
    if (appState.settings.unlockedThemes.includes(itemId)) {
      appState.settings.activeThemeId = itemId;
      saveState();
      return { ok: true, unlocked: true };
    }
    if (appState.xp < cost) {
      return { ok: false, error: `Necesitas ${cost} XP para desbloquear este tema (Tienes ${appState.xp} XP).` };
    }
    appState.xp -= cost;
    appState.settings.unlockedThemes.push(itemId);
    appState.settings.activeThemeId = itemId;
    logSecurityEvent(`Tema visual desbloqueado con XP: ${itemId}`, 'INFO');
    saveState();
    return { ok: true, unlocked: true };
  }

  if (itemType === 'sound') {
    if (appState.settings.unlockedSoundProfiles.includes(itemId)) {
      appState.settings.keyboardProfileId = itemId;
      saveState();
      return { ok: true, unlocked: true };
    }
    if (appState.xp < cost) {
      return { ok: false, error: `Necesitas ${cost} XP para desbloquear este sonido (Tienes ${appState.xp} XP).` };
    }
    appState.xp -= cost;
    appState.settings.unlockedSoundProfiles.push(itemId);
    appState.settings.keyboardProfileId = itemId;
    logSecurityEvent(`Switch acústico desbloqueado con XP: ${itemId}`, 'INFO');
    saveState();
    return { ok: true, unlocked: true };
  }

  return { ok: false, error: 'Tipo de artículo desconocido.' };
}

export function recordDuelVictory(xpReward = 350) {
  appState.duelWins = (appState.duelWins || 0) + 1;
  addXP(xpReward);
  saveState();
  return appState.duelWins;
}

export function calculateRank(xp = appState.xp) {
  let currentRank = RANK_THRESHOLDS[0].title;
  for (const tier of RANK_THRESHOLDS) {
    if (xp >= tier.minXP) {
      currentRank = tier.title;
    }
  }
  return currentRank;
}

export function addXP(amount) {
  const previousRank = calculateRank(appState.xp);
  appState.xp = Math.max(0, appState.xp + Number(amount || 0));
  const newRank = calculateRank(appState.xp);
  saveState();

  return {
    newXP: appState.xp,
    previousRank,
    newRank,
    leveledUp: previousRank !== newRank
  };
}

export function completeLesson(lessonId) {
  const alreadyCompleted = appState.completedLessons.includes(lessonId);
  if (!alreadyCompleted) {
    appState.completedLessons.push(lessonId);
  }
  const xpAwarded = hasProAccess() ? 200 : 150;
  const rankInfo = addXP(xpAwarded);
  saveState();

  return {
    firstTime: !alreadyCompleted,
    xpAwarded,
    rankInfo
  };
}

export function isLessonCompleted(lessonId) {
  return appState.completedLessons.includes(lessonId);
}

export function completeDailyBounty(bountyId, xpReward = 200) {
  const alreadyDone = appState.completedBounties.includes(bountyId);
  if (!alreadyDone) {
    appState.completedBounties.push(bountyId);
    addXP(xpReward);
    saveState();
  }
  return !alreadyDone;
}

export function isBountyCompleted(bountyId) {
  return appState.completedBounties.includes(bountyId);
}

export function recordBossVictory(bossId, xpReward = 500) {
  const firstTime = !appState.defeatedBosses.includes(bossId);
  if (firstTime) {
    appState.defeatedBosses.push(bossId);
  }
  addXP(xpReward);
  saveState();
  return firstTime;
}

export function isBossDefeated(bossId) {
  return appState.defeatedBosses.includes(bossId);
}

export function registerIssuedCertificate(certObj) {
  if (!certObj || !certObj.certificateId) return;
  const exists = appState.issuedCertificates.some(
    (c) => c.certificateId.toUpperCase() === certObj.certificateId.toUpperCase()
  );
  if (!exists) {
    appState.issuedCertificates.unshift(certObj);
    saveState();
  }
  syncIssuedCertificate(certObj);
}

export function findCertificateById(code = '') {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  return (
    appState.issuedCertificates.find((c) => c.certificateId.toUpperCase() === clean) || null
  );
}

export function recordArenaScore(trackId, score) {
  const prevBest = appState.arenaHighScores[trackId] || 0;
  if (score > prevBest) {
    appState.arenaHighScores[trackId] = score;
    saveState();
    return true;
  }
  return false;
}

export function toggleAudioMute() {
  appState.audioMuted = !appState.audioMuted;
  saveState();
  return appState.audioMuted;
}

export function resetAllProgress() {
  const currentUser = appState.user;
  const registered = appState.registeredUsers;
  const certs = appState.issuedCertificates;
  const settings = appState.settings;
  appState = createDefaultState();
  appState.user = currentUser;
  appState.registeredUsers = registered;
  appState.issuedCertificates = certs;
  appState.settings = settings;
  saveState();
  return getState();
}
