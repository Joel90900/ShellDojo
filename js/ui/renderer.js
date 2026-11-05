/**
 * SHELLDOJO - CONTROLADOR DEL DOM, NAVEGACIÓN DE VISTAS, HUD, PLANES, MISIONES Y DICCIONARIO
 */

import {
  CURRICULUM_DATA,
  SUBSCRIPTION_PLANS,
  DAILY_BOUNTIES,
  LEADERBOARD_ENTRIES,
  BOSS_BATTLES,
  OPERATOR_AVATARS,
  TERMINAL_THEMES_SHOP,
  KEYBOARD_SOUND_PROFILES,
  DUEL_RIVALS_DATA,
  DUEL_ROUNDS_DATA,
  STUDY_METHODS_DATA,
  STUDY_FLASHCARDS_DATA
} from '../data/curriculum.js';
import {
  getState,
  calculateRank,
  isLessonCompleted,
  isAuthenticated,
  hasProAccess,
  isTierAllowed,
  isBountyCompleted,
  completeDailyBounty,
  findCertificateById,
  isBossDefeated,
  recordBossVictory,
  updateOperatorSettings,
  unlockShopItemWithXP,
  verifyProAccountSecurity,
  recordDuelVictory
} from '../core/state.js';
import { escapeHTML, maskSensitivePII } from '../core/security.js';
import { validateCommand } from '../core/validator.js';
import { SoundFX } from '../core/audio.js';
import { formatCurrency } from '../core/payments.js';
import {
  sendDuelHeartbeat,
  submitDuelCommand,
  resetDuelRoom,
  leaveDuelRoom,
  fetchPublicFeedback
} from '../core/sync.js';
import {
  processClientFeedback,
  getTargetAdminEmail,
  buildMailtoLinks
} from '../core/feedback.js';

let activeCategoryFilter = 'all';
let activeBossId = BOSS_BATTLES[0].id;
let activeBossPhaseIndex = 0;

// Estado del Duelo 1v1 Multijugador Real (Sin Bots Simulados)
let activeDuelRoomCode = '4829';
let duelHeartbeatTimer = null;
let duelLastRoomState = null;
let duelMyPlayerId = null;

function getOrCreatePlayerId() {
  if (duelMyPlayerId) return duelMyPlayerId;
  try {
    let stored = localStorage.getItem('shelldojo_player_id');
    if (!stored) {
      stored = 'sd_plr_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('shelldojo_player_id', stored);
    }
    duelMyPlayerId = stored;
  } catch {
    duelMyPlayerId = 'sd_plr_' + Math.random().toString(36).substring(2, 9);
  }
  return duelMyPlayerId;
}

// Los controles de 2FA, escudo de privacidad y auditoría se aplican automáticamente;
// no se muestran en Configuración. Cambiar a true solo para depuración interna.
const SHOW_SECURITY_PANEL_IN_SETTINGS = false;
/**
 * Devuelve únicamente los sistemas (tracks) y niveles que el plan actual del usuario puede usar.
 * El contenido de planes superiores no se muestra hasta que el usuario activa ese plan.
 */
export function getVisibleTracks() {
  return CURRICULUM_DATA.map((track) => ({
    ...track,
    lessons: track.lessons.filter((l) => isTierAllowed(l.planTier || 'free'))
  })).filter((track) => track.lessons.length > 0 && isTierAllowed(track.tier || 'free'));
}

/**
 * Aplica en tiempo real el Tema Visual (Variables CSS), la intensidad del Monitor CRT
 * y el tamaño de fuente de terminal elegidos en la Configuración del Operador.
 */
export function applyVisualSettingsToDOM() {
  const state = getState();
  const settings = state.settings || {};

  // 1. Aplicar variables CSS del tema activo
  const themeObj =
    TERMINAL_THEMES_SHOP.find((t) => t.id === settings.activeThemeId) || TERMINAL_THEMES_SHOP[0];
  if (themeObj && themeObj.cssVars) {
    Object.entries(themeObj.cssVars).forEach(([prop, val]) => {
      document.documentElement.style.setProperty(prop, val);
    });
  }

  // 2. Aplicar intensidad de líneas de escaneo CRT (high | low | off)
  const crtMode = settings.crtIntensity || 'high';
  document.body.classList.remove('crt-intensity-high', 'crt-intensity-low', 'crt-intensity-off');
  document.body.classList.add(`crt-intensity-${crtMode}`);

  // 3. Aplicar sensibilidad visual / tamaño de fuente de terminal (sm | md | lg)
  const fontSize = settings.terminalFontSize || 'md';
  document.body.classList.remove('terminal-font-sm', 'terminal-font-md', 'terminal-font-lg');
  document.body.classList.add(`terminal-font-${fontSize}`);
}

/**
 * Devuelve el HTML o emoji del avatar actual del operador.
 */
export function getOperatorAvatarHTML(sizeClass = 'w-6 h-6 text-sm') {
  const state = getState();
  const customUrl = state.user?.customAvatarUrl || state.settings?.customAvatarUrl || '';
  if (customUrl) {
    return `<img src="${escapeHTML(customUrl)}" alt="Avatar" class="${sizeClass} rounded-full object-cover border border-neonGreen" />`;
  }
  const avatarId = state.user?.avatarId || state.settings?.avatarId || 'avatar-netrunner';
  const found = OPERATOR_AVATARS.find((a) => a.id === avatarId) || OPERATOR_AVATARS[0];
  return `<span class="${sizeClass} rounded-full bg-gradient-to-br ${found.bgClass} border flex items-center justify-center select-none">${found.emoji}</span>`;
}

/**
 * Actualiza los indicadores del HUD superior, el avatar, el escudo 2FA y la barra global de progreso.
 */
export function updateHUD() {
  applyVisualSettingsToDOM();
  const state = getState();
  const loggedIn = isAuthenticated();

  const publicNav = document.getElementById('public-nav');
  const appNav = document.getElementById('app-nav');
  const statsGroup = document.getElementById('hud-stats-group');
  const logoutBtn = document.getElementById('btn-logout');

  const planBadge = document.getElementById('hud-plan-badge');
  const avatarEl = document.getElementById('hud-user-avatar');
  const handleEl = document.getElementById('hud-user-handle');
  const secBadge = document.getElementById('hud-security-badge');
  const rankEl = document.getElementById('hud-rank');
  const xpEl = document.getElementById('hud-xp');
  const streakEl = document.getElementById('hud-streak');
  const audioBtn = document.getElementById('btn-audio-toggle');

  if (publicNav) publicNav.classList.toggle('hidden', loggedIn);
  if (appNav) {
    appNav.classList.toggle('hidden', !loggedIn);
    appNav.classList.toggle('flex', loggedIn);
  }
  if (statsGroup) {
    statsGroup.classList.toggle('hidden', !loggedIn);
    statsGroup.classList.toggle('flex', loggedIn);
  }
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !loggedIn);

  const planLabels = {
    free: 'CADET FREE',
    pro: 'PRO OPERATOR',
    team: 'CYBER SQUAD'
  };
  const currentPlanLabel = planLabels[state.plan] || 'CADET FREE';

  if (planBadge) {
    planBadge.textContent = currentPlanLabel;
    planBadge.className =
      state.plan === 'free'
        ? 'text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-600 uppercase tracking-widest font-bold'
        : 'text-[10px] px-1.5 py-0.5 rounded bg-neonAmber/20 text-neonAmber border border-neonAmber uppercase tracking-widest font-bold';
  }

  if (avatarEl) {
    const customUrl = state.user?.customAvatarUrl || state.settings?.customAvatarUrl || '';
    if (customUrl) {
      avatarEl.innerHTML = `<img src="${escapeHTML(customUrl)}" alt="Avatar" class="w-full h-full object-cover rounded-full" />`;
    } else {
      const avatarId = state.user?.avatarId || state.settings?.avatarId || 'avatar-netrunner';
      const found = OPERATOR_AVATARS.find((a) => a.id === avatarId) || OPERATOR_AVATARS[0];
      avatarEl.textContent = found.emoji;
    }
  }

  if (handleEl && state.user) {
    handleEl.textContent = `@${state.user.handle}`;
  }

  if (secBadge) {
    const isProVerified = hasProAccess() && state.proAccountSecurity?.verified;
    secBadge.classList.toggle('hidden', !isProVerified);
  }

  if (rankEl) rankEl.textContent = calculateRank(state.xp);
  if (xpEl) xpEl.textContent = state.xp.toLocaleString();
  if (streakEl) streakEl.textContent = `${state.streak}d`;

  if (audioBtn) {
    audioBtn.textContent = state.audioMuted ? '🔇 MUTE' : '🔊 SFX';
    audioBtn.classList.toggle('text-slate-500', state.audioMuted);
    audioBtn.classList.toggle('text-neonGreen', !state.audioMuted);
  }

  // Bienvenida del Dashboard
  const welcomeTitle = document.getElementById('dashboard-welcome-title');
  const planPill = document.getElementById('dashboard-plan-pill');
  const upgradeBtn = document.getElementById('btn-go-upgrade');

  if (welcomeTitle && state.user) {
    welcomeTitle.textContent = `Centro de Mando // Bienvenido, ${state.user.name} (@${state.user.handle})`;
  }
  if (planPill) {
    planPill.textContent = `LICENCIA: ${currentPlanLabel}`;
  }
  if (upgradeBtn) {
    upgradeBtn.classList.toggle('hidden', hasProAccess());
  }

  // Barra global en la vista Academia (solo cuenta los niveles habilitados en el plan actual)
  const visibleTracksForStats = getVisibleTracks();
  const visibleLessonIds = visibleTracksForStats.flatMap((t) => t.lessons.map((l) => l.id));
  const totalLessons = visibleLessonIds.length;
  const completedCount = visibleLessonIds.filter((id) => state.completedLessons.includes(id)).length;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const dashAvatarBox = document.getElementById('dashboard-avatar-box');
  if (dashAvatarBox) {
    dashAvatarBox.innerHTML = getOperatorAvatarHTML('w-16 h-16 text-3xl');
  }

  const statsEl = document.getElementById('academy-Completion-stats');
  const barEl = document.getElementById('academy-global-bar');
  const pctEl = document.getElementById('academy-global-pct');

  if (statsEl) statsEl.textContent = `${completedCount} / ${totalLessons} Niveles (${totalLessons * 15} Retos)`;
  if (barEl) barEl.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
}

/**
 * Cambia entre las vistas de la aplicación.
 */
export function switchView(viewName) {
  if (viewName !== 'duel' && duelHeartbeatTimer) {
    clearInterval(duelHeartbeatTimer);
    duelHeartbeatTimer = null;
  }

  const views = [
    'landing',
    'auth',
    'academy',
    'dojo',
    'arena',
    'bounties',
    'cheatsheet',
    'pricing',
    'boss',
    'leaderboard',
    'verify',
    'duel',
    'portfolio',
    'settings',
    'feedback'
  ];
  views.forEach((v) => {
    const section = document.getElementById(`view-${v}`);
    if (section) {
      section.classList.toggle('hidden', v !== viewName);
    }
  });

  const navButtons = document.querySelectorAll('[data-nav]');
  navButtons.forEach((btn) => {
    const target = btn.getAttribute('data-nav');
    btn.classList.toggle('active-tab', target === viewName);
  });

  const publicNavButtons = document.querySelectorAll('[data-public-nav]');
  publicNavButtons.forEach((btn) => {
    const target = btn.getAttribute('data-public-nav');
    btn.classList.toggle('active-tab', target === viewName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Renderiza el Mapa de Progreso con las 4 tarjetas de rutas en el Dashboard,
 * aplicando candados PRO cuando el usuario tiene el plan gratuito ('free').
 */
export function renderAcademyTracks(callbacks) {
  const grid = document.getElementById('tracks-grid');
  if (!grid) return;

  const state = getState();
  const currentPlan = state.plan; // 'free' | 'pro' | 'team'
  grid.innerHTML = '';

  getVisibleTracks().forEach((track) => {
    const totalTrackLessons = track.lessons.length;
    const completedInTrack = track.lessons.filter((l) => isLessonCompleted(l.id)).length;
    const progressPct = Math.round((completedInTrack / totalTrackLessons) * 100);
    const bestScore = state.arenaHighScores[track.id] || 0;

    const card = document.createElement('article');
    card.className =
      'bg-crtPanel border border-crtBorder rounded-lg p-5 flex flex-col justify-between shadow-panel hover:border-slate-600 transition-all relative';

    const lessonsListHTML = track.lessons
      .map((lesson, idx) => {
        const done = isLessonCompleted(lesson.id);

        return `
          <div class="flex items-center justify-between gap-3 p-2.5 rounded bg-black/50 border ${
            done ? 'border-neonGreen/40' : 'border-crtBorder'
          }">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                done
                  ? 'bg-neonGreen/20 text-neonGreen border border-neonGreen/40'
                  : 'bg-slate-800 text-slate-300'
              }">
                ${done ? '✓ COMPLETADO' : `NVL 0${idx + 1} (${lesson.steps.length} RETOS)`}
              </span>
              <span class="text-xs text-slate-200 font-medium truncate">
                ${lesson.title}
              </span>
            </div>
            <button
              data-action="open-lesson"
              data-track="${track.id}"
              data-lesson="${lesson.id}"
              class="px-3 py-1 rounded text-xs font-bold bg-neonGreen/15 hover:bg-neonGreen text-neonGreen hover:text-black border border-neonGreen/50 transition-all shrink-0"
            >
              ${done ? 'Repasar' : 'Entrenar'} &rarr;
            </button>
          </div>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-black border border-crtBorder text-neonCyan">
              ${track.badge} • ${totalTrackLessons} NIVELES (${totalTrackLessons * 15} EJERCICIOS)
            </span>
            <h3 class="text-lg font-bold text-white mt-1">${track.title}</h3>
            <p class="text-xs text-slate-400 mt-0.5">${track.subtitle}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[10px] text-slate-400 block">RÉCORD ARENA</span>
            <span class="text-xs font-bold text-neonAmber">${bestScore} PTS</span>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">Progreso de Ruta (${completedInTrack}/${totalTrackLessons} Niveles)</span>
            <span class="font-bold text-neonGreen">${progressPct}%</span>
          </div>
          <div class="w-full h-2 bg-black rounded-full overflow-hidden border border-crtBorder">
            <div class="h-full bg-neonGreen transition-all duration-500" style="width: ${progressPct}%"></div>
          </div>
        </div>

        <div class="space-y-2 pt-1 max-h-72 overflow-y-auto pr-1">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Niveles Guiados (15 Ejercicios por Nivel):
          </div>
          ${lessonsListHTML}
        </div>
      </div>

      <div class="mt-5 pt-4 border-t border-crtBorder flex flex-wrap items-center justify-between gap-2">
        <button
          data-action="claim-cert"
          data-track-title="${track.title}"
          class="px-3 py-2 rounded bg-neonGreen/15 hover:bg-neonGreen text-neonGreen hover:text-black border border-neonGreen/50 font-bold text-xs transition-all flex items-center gap-1.5"
        >
          <span>🎓</span>
          <span>Certificado Gmail / PDF</span>
        </button>

        <button
          data-action="start-exam"
          data-track="${track.id}"
          class="px-3.5 py-2 rounded bg-neonAmber/15 hover:bg-neonAmber text-neonAmber hover:text-black border border-neonAmber font-bold text-xs transition-all flex items-center gap-1.5"
        >
          <span>⚡</span>
          <span>Examen Intensivo Arena</span>
        </button>
      </div>
    `;

    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-action="open-lesson"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trackId = btn.getAttribute('data-track');
      const lessonId = btn.getAttribute('data-lesson');
      if (callbacks?.onSelectLesson) callbacks.onSelectLesson(trackId, lessonId);
    });
  });

  grid.querySelectorAll('[data-action="start-exam"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trackId = btn.getAttribute('data-track');
      if (callbacks?.onStartExam) callbacks.onStartExam(trackId);
    });
  });

  grid.querySelectorAll('[data-action="unlock-pro"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (callbacks?.onOpenPricing) callbacks.onOpenPricing();
    });
  });

  grid.querySelectorAll('[data-action="claim-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trackTitle = btn.getAttribute('data-track-title');
      if (callbacks?.onClaimCertificate) callbacks.onClaimCertificate(trackTitle);
    });
  });
}

/**
 * Renderiza la vista de Misiones Extra (Daily Bounties) donde el usuario puede resolver
 * tareas adicionales y ganar XP extra.
 */
export function renderDailyBounties(callbacks) {
  const grid = document.getElementById('bounties-grid');
  const upgradeBtn = document.getElementById('btn-bounties-upgrade');
  if (!grid) return;

  const proUnlocked = hasProAccess();
  if (upgradeBtn) {
    upgradeBtn.classList.toggle('hidden', proUnlocked);
  }

  grid.innerHTML = '';

  DAILY_BOUNTIES.filter((b) => !b.proOnly || proUnlocked).forEach((bounty) => {
    const locked = bounty.proOnly && !proUnlocked;
    const completed = isBountyCompleted(bounty.id);

    const card = document.createElement('div');
    card.className = `bg-crtPanel border ${
      completed
        ? 'border-neonGreen/50'
        : locked
        ? 'border-neonAmber/40'
        : 'border-crtBorder'
    } rounded-lg p-5 flex flex-col justify-between gap-4 shadow-panel`;

    card.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            bounty.proOnly
              ? 'bg-neonAmber/20 text-neonAmber border border-neonAmber/40'
              : 'bg-neonCyan/15 text-neonCyan border border-neonCyan/40'
          }">
            ${bounty.proOnly ? '💎 CONTRATO PRO' : 'CONTRATO ESTÁNDAR'} • DIFICULTAD ${bounty.difficulty.toUpperCase()}
          </span>
          <span class="text-xs font-bold text-neonGreen">+${bounty.xpReward} XP</span>
        </div>

        <h3 class="text-base font-bold text-white">${bounty.title}</h3>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${bounty.description}</p>
        <p class="text-[11px] text-neonAmber">💡 Pista: ${bounty.hint}</p>
      </div>

      ${
        locked
          ? `<div class="pt-3 border-t border-crtBorder flex items-center justify-between">
               <span class="text-xs text-slate-400">Requiere licencia Pro Operator o Cyber Squad</span>
               <button data-bounty-unlock="true" class="px-3.5 py-2 rounded bg-neonAmber text-black font-bold text-xs hover:bg-neonAmber/90 transition-all">
                 🔒 Desbloquear con PRO
               </button>
             </div>`
          : completed
          ? `<div class="pt-3 border-t border-neonGreen/30 flex items-center justify-between text-xs">
               <span class="text-neonGreen font-bold">✅ Misión Completada (+${bounty.xpReward} XP acreditados)</span>
               <code class="px-2 py-1 rounded bg-black text-neonGreen border border-neonGreen/40">${bounty.validCommands[0]}</code>
             </div>`
          : `<form data-bounty-id="${bounty.id}" class="pt-3 border-t border-crtBorder space-y-2" autocomplete="off">
               <div class="flex items-center gap-2 bg-black border border-crtBorder rounded px-3 py-2">
                 <span class="text-neonGreen text-xs font-bold shrink-0">${bounty.prompt}</span>
                 <input
                   type="text"
                   required
                   placeholder="Escribe el comando de la misión..."
                   class="w-full bg-transparent text-white text-xs sm:text-sm font-mono focus:outline-none"
                 />
                 <button type="submit" class="px-3 py-1 rounded bg-neonGreen text-black font-bold text-xs hover:bg-neonGreen/90 shrink-0">
                   Enviar
                 </button>
               </div>
               <div class="bounty-feedback text-xs font-mono min-h-[1rem]"></div>
             </form>`
      }
    `;

    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-bounty-unlock]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (callbacks?.onOpenPricing) callbacks.onOpenPricing();
    });
  });

  grid.querySelectorAll('form[data-bounty-id]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bountyId = form.getAttribute('data-bounty-id');
      const bounty = DAILY_BOUNTIES.find((b) => b.id === bountyId);
      const input = form.querySelector('input');
      const feedback = form.querySelector('.bounty-feedback');
      if (!bounty || !input) return;

      if (validateCommand(input.value, bounty.validCommands)) {
        SoundFX.playLevelUp();
        completeDailyBounty(bounty.id, bounty.xpReward);
        updateHUD();
        renderDailyBounties(callbacks);
      } else {
        SoundFX.playError();
        if (feedback) {
          feedback.className = 'bounty-feedback text-xs font-mono text-neonRed';
          feedback.textContent = `✖ Comando incorrecto. Revisa la pista: ${bounty.hint}`;
        }
      }
    });
  });
}

/**
 * Renderiza las 3 tarjetas de Planes de Pago (Cadet, Pro Operator, Cyber Squad)
 * soportando cambio en tiempo real entre Pesos Colombianos (COP) / USD y Mensual / Anual (-20%).
 */
export function renderPricingPlans(callbacks = {}) {
  const grid = document.getElementById('pricing-cards-grid');
  if (!grid) return;

  const currency = callbacks.currency || 'COP';
  const billingCycle = callbacks.billingCycle || 'monthly';
  const currentPlan = getState().plan;
  grid.innerHTML = '';

  SUBSCRIPTION_PLANS.forEach((plan) => {
    const isCurrent = currentPlan === plan.id;
    const borderClass = plan.popular
      ? 'border-2 border-neonGreen shadow-neon-green'
      : 'border border-crtBorder';

    let displayPrice = 'Gratis / siempre';
    let billingSubtext = 'Sin tarjeta ni cobros';

    if (plan.priceMonthlyCOP > 0) {
      if (billingCycle === 'yearly') {
        const discountedMonthlyCOP = Math.round(plan.priceMonthlyCOP * 0.8);
        const totalYearlyCOP = discountedMonthlyCOP * 12;
        displayPrice = `${formatCurrency(discountedMonthlyCOP, currency)} / mes`;
        billingSubtext = `Facturado anualmente (${formatCurrency(totalYearlyCOP, currency)} / año - Ahorras 20%)`;
      } else {
        displayPrice = `${formatCurrency(plan.priceMonthlyCOP, currency)} / mes`;
        billingSubtext = 'Facturación mensual flexible • Cancela cuando quieras';
      }
    }

    const card = document.createElement('div');
    card.className = `bg-crtPanel ${borderClass} rounded-xl p-6 flex flex-col justify-between space-y-6 relative`;

    const featuresHTML = plan.features
      .map(
        (f) => `<li class="flex items-start gap-2 text-xs text-slate-200">
                  <span class="text-neonGreen font-bold">✔</span>
                  <span>${f}</span>
                </li>`
      )
      .join('');

    const limitationsHTML = (plan.limitations || [])
      .map(
        (l) => `<li class="flex items-start gap-2 text-xs text-slate-500">
                  <span>✖</span>
                  <span>${l}</span>
                </li>`
      )
      .join('');

    card.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded ${
            plan.popular
              ? 'bg-neonGreen text-black'
              : 'bg-black border border-crtBorder text-neonCyan'
          }">
            ${plan.badge}
          </span>
          ${
            isCurrent
              ? `<span class="text-xs font-bold text-neonGreen">● TU PLAN ACTUAL</span>`
              : ''
          }
        </div>

        <div>
          <h3 class="text-2xl font-bold text-white">${plan.name}</h3>
          <div class="text-2xl sm:text-3xl font-bold text-neonGreen mt-2">${displayPrice}</div>
          <p class="text-[11px] text-neonAmber mt-1 font-medium">${billingSubtext}</p>
          <p class="text-xs text-slate-400 mt-2 leading-relaxed">${plan.description}</p>
        </div>

        <ul class="space-y-2.5 pt-3 border-t border-crtBorder">
          ${featuresHTML}
          ${limitationsHTML}
        </ul>
      </div>

      <button
        data-select-plan="${plan.id}"
        ${isCurrent ? 'disabled' : ''}
        class="w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
          isCurrent
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : plan.popular
            ? 'bg-neonGreen text-black hover:bg-neonGreen/90 shadow-neon-green'
            : 'bg-neonCyan/15 hover:bg-neonCyan text-neonCyan hover:text-black border border-neonCyan'
        }"
      >
        ${
          isCurrent
            ? 'Plan Activo Actualmente'
            : plan.priceMonthlyCOP === 0
            ? 'Cambiar a Plan Básico'
            : `Pagar con Nequi / PSE / Tarjeta &rarr;`
        }
      </button>
    `;

    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-select-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const planId = btn.getAttribute('data-select-plan');
      if (callbacks?.onChoosePlan) callbacks.onChoosePlan(planId);
    });
  });
}

/**
 * Construye el índice del Diccionario Táctico.
 */
function buildDictionaryEntries() {
  const entries = [];
  const seen = new Set();
  const pushUnique = (entry) => {
    const key = `${entry.category}::${entry.command.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  getVisibleTracks().forEach((track) => {
    track.lessons.forEach((lesson) => {
      lesson.steps.forEach((step) => {
        pushUnique({
          category: track.id,
          categoryTitle: track.title,
          command: step.validCommands[0],
          equivalents: step.validCommands.slice(1),
          description: `${step.instruction} 💡 Tip: ${step.hint}`,
          context: lesson.title,
          anatomy: lesson.anatomy
        });
      });
    });

    track.examChallenges.forEach((challenge) => {
      pushUnique({
        category: track.id,
        categoryTitle: track.title,
        command: challenge.validCommands[0],
        equivalents: challenge.validCommands.slice(1),
        description: challenge.explanation.replace(/`/g, ''),
        context: 'Emergencia de Certificación',
        anatomy: []
      });
    });
  });

  return entries;
}

let flashcardIndex = 0;
let flashcardRevealed = false;

/**
 * Renderiza la guía de métodos de estudio y el entrenador de flashcards en el Diccionario.
 */
export function renderStudyTools() {
  const guideBox = document.getElementById('cheatsheet-study-guide');
  const cardBox = document.getElementById('cheatsheet-flashcard-box');

  if (guideBox) {
    guideBox.innerHTML = STUDY_METHODS_DATA.map(
      (m) => `
        <div class="bg-black/70 border border-crtBorder rounded-lg p-3.5 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-bold text-white">${m.icon} ${escapeHTML(m.title)}</span>
          </div>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neonGreen/15 text-neonGreen border border-neonGreen/30">${escapeHTML(m.badge)}</span>
          <p class="text-xs text-slate-300 leading-relaxed whitespace-pre-line">${escapeHTML(m.description)}</p>
        </div>
      `
    ).join('');
  }

  if (cardBox) {
    const card = STUDY_FLASHCARDS_DATA[flashcardIndex % STUDY_FLASHCARDS_DATA.length];
    cardBox.innerHTML = `
      <div class="text-[10px] text-slate-400 uppercase">Tarjeta ${(flashcardIndex % STUDY_FLASHCARDS_DATA.length) + 1} / ${STUDY_FLASHCARDS_DATA.length}</div>
      <p class="text-sm font-semibold text-white">${escapeHTML(card.question)}</p>
      ${
        flashcardRevealed
          ? `<div class="bg-neonGreen/10 border border-neonGreen/40 rounded p-3 space-y-1">
               <code class="text-neonGreen font-bold text-sm">${escapeHTML(card.answer)}</code>
               <p class="text-[11px] text-neonAmber">💡 ${escapeHTML(card.tip)}</p>
             </div>`
          : `<p class="text-xs text-slate-500 italic">Piensa tu respuesta y luego revélala...</p>`
      }
      <div class="flex gap-2">
        <button id="btn-flashcard-reveal" type="button" class="px-3 py-1.5 rounded bg-neonCyan text-black font-bold text-xs">
          ${flashcardRevealed ? 'Ocultar' : '👁️ Revelar Respuesta'}
        </button>
        <button id="btn-flashcard-next" type="button" class="px-3 py-1.5 rounded bg-black border border-crtBorder text-slate-200 font-bold text-xs hover:border-neonGreen">
          Siguiente &rarr;
        </button>
      </div>
    `;

    document.getElementById('btn-flashcard-reveal')?.addEventListener('click', () => {
      flashcardRevealed = !flashcardRevealed;
      renderStudyTools();
    });
    document.getElementById('btn-flashcard-next')?.addEventListener('click', () => {
      flashcardIndex += 1;
      flashcardRevealed = false;
      renderStudyTools();
    });
  }
}

export function renderCheatsheet(searchQuery = '', category = activeCategoryFilter) {
  activeCategoryFilter = category;
  const container = document.getElementById('cheatsheet-grid');
  if (!container) return;

  const ALL_DICTIONARY_ENTRIES = buildDictionaryEntries();
  const allowedCats = new Set(ALL_DICTIONARY_ENTRIES.map((e) => e.category));

  // Muestra solo los botones de categoría de sistemas disponibles en el plan actual
  document.querySelectorAll('#cheatsheet-category-filters [data-cat]').forEach((btn) => {
    const cat = btn.getAttribute('data-cat');
    btn.classList.toggle('hidden', cat !== 'all' && !allowedCats.has(cat));
  });
  if (category !== 'all' && !allowedCats.has(category)) {
    category = 'all';
  }

  const query = searchQuery.trim().toLowerCase();

  const filtered = ALL_DICTIONARY_ENTRIES.filter((item) => {
    const matchesCat = category === 'all' || item.category === category;
    if (!matchesCat) return false;
    if (!query) return true;

    const haystack = [
      item.command,
      ...item.equivalents,
      item.description,
      item.categoryTitle,
      item.context
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-crtPanel border border-crtBorder rounded-lg p-8 text-center text-slate-400">
        No se encontraron comandos que coincidan con <span class="text-neonCyan font-bold">"${searchQuery}"</span>.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((item) => {
      const equivalentsHTML =
        item.equivalents.length > 0
          ? `<div class="text-[11px] text-slate-400 mt-2">
               <span class="text-neonAmber">Equivalentes aceptados:</span>
               ${item.equivalents.map((eq) => `<code class="px-1.5 py-0.5 rounded bg-black border border-crtBorder text-slate-300 ml-1">${eq}</code>`).join('')}
             </div>`
          : '';

      const anatomyHTML =
        item.anatomy && item.anatomy.length > 0
          ? `<div class="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-crtBorder/60">
               ${item.anatomy
                 .map(
                   (part) => `
                   <span class="token-badge token-${part.type}">
                     <strong class="font-bold">[${part.token}]</strong>
                     <span class="text-[10px] opacity-85">${part.role}</span>
                   </span>
                 `
                 )
                 .join('')}
             </div>`
          : '';

      return `
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-4 flex flex-col justify-between shadow-panel">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-black border border-crtBorder text-neonCyan">
                ${item.categoryTitle}
              </span>
              <span class="text-[11px] text-slate-500">${item.context}</span>
            </div>

            <div class="bg-black border border-crtBorder rounded px-3 py-2 font-mono text-sm text-neonGreen font-bold">
              $ ${item.command}
            </div>

            <p class="text-xs text-slate-300 mt-2.5 leading-relaxed">
              ${item.description}
            </p>
            ${equivalentsHTML}
          </div>
          ${anatomyHTML}
        </div>
      `;
    })
    .join('');
}

/**
 * Renderiza la Tabla de Clasificación (Leaderboard Colombia & Global) combinando
 * los mejores operadores registrados y el estado en vivo del usuario actual.
 */
export function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  const myRankEl = document.getElementById('leaderboard-my-rank');
  if (!tbody) return;

  const state = getState();
  const entries = [];

  const currentUserEntry = {
    handle: state.user?.handle || 'operador_tu',
    name: state.user?.name || 'Tú (Operador Activo)',
    institution: state.user?.institution || 'ShellDojo Academy (Colombia)',
    xp: state.xp || 0,
    rank: calculateRank(state.xp || 0),
    plan: (state.plan || 'free').toUpperCase(),
    bossesDefeated: (state.defeatedBosses || []).length,
    isCurrentUser: true
  };

  if (isAuthenticated()) {
    entries.push(currentUserEntry);
  }
  entries.sort((a, b) => b.xp - a.xp);

  const userIndex = entries.findIndex((e) => e.isCurrentUser);
  if (myRankEl) {
    myRankEl.textContent =
      userIndex >= 0 ? `#${userIndex + 1} (${currentUserEntry.xp.toLocaleString()} XP)` : '#--';
  }

  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 px-4 text-center text-slate-400 text-sm">
          🏁 Aún no hay operadores en el ranking. ¡Crea tu cuenta y sé el primero en aparecer!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = entries
    .map((entry, idx) => {
      const pos = idx + 1;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
      const rowHighlight = entry.isCurrentUser
        ? 'bg-neonGreen/10 border-l-4 border-l-neonGreen'
        : 'hover:bg-black/40';

      return `
        <tr class="${rowHighlight} transition-colors">
          <td class="py-3.5 px-4 font-bold ${pos <= 3 ? 'text-neonAmber text-base' : 'text-slate-400'}">
            ${medal}
          </td>
          <td class="py-3.5 px-4">
            <div class="font-bold text-white flex items-center gap-2">
              <span>${entry.name}</span>
              ${
                entry.isCurrentUser
                  ? '<span class="text-[10px] px-2 py-0.5 rounded bg-neonGreen text-black font-extrabold">TÚ</span>'
                  : ''
              }
            </div>
            <div class="text-[11px] text-neonCyan font-mono">@${entry.handle}</div>
          </td>
          <td class="py-3.5 px-4 text-slate-300 text-xs">
            ${entry.institution}
          </td>
          <td class="py-3.5 px-4">
            <span class="text-xs font-bold text-neonGreen block">${entry.rank}</span>
            <span class="text-[10px] text-slate-400 uppercase">LICENCIA ${entry.plan}</span>
          </td>
          <td class="py-3.5 px-4 text-center font-bold text-neonRed">
            ${entry.bossesDefeated > 0 ? `👹 x${entry.bossesDefeated}` : '—'}
          </td>
          <td class="py-3.5 px-4 text-right font-mono font-bold text-neonAmber text-sm">
            ${entry.xp.toLocaleString()} XP
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Renderiza el Verificador Público de Certificados (#view-verify) para empresas y reclutadores.
 */
export function renderCertificateVerifier(initialCode = '') {
  const input = document.getElementById('verify-code-input');
  const quickCodesBox = document.getElementById('verify-quick-codes');
  const resultBox = document.getElementById('verify-result-box');
  if (!resultBox) return;

  const state = getState();
  const issuedList = state.issuedCertificates || [];

  if (quickCodesBox) {
    quickCodesBox.innerHTML = issuedList
      .slice(0, 4)
      .map(
        (c) => `
          <button
            type="button"
            data-quick-verify="${c.certificateId}"
            class="px-2.5 py-1 rounded bg-black hover:bg-neonCyan/20 text-neonCyan border border-neonCyan/40 font-mono text-xs transition-all"
          >
            ${c.certificateId}
          </button>
        `
      )
      .join('');

    quickCodesBox.querySelectorAll('[data-quick-verify]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-quick-verify');
        if (input) input.value = code;
        renderCertificateVerifier(code);
      });
    });
  }

  const codeToLookup = (initialCode || input?.value || '').trim().toUpperCase();
  if (input && initialCode) {
    input.value = codeToLookup;
  }

  if (!codeToLookup) {
    resultBox.innerHTML = `
      <div class="bg-black/40 border border-crtBorder rounded-xl p-6 text-center space-y-2">
        <div class="text-2xl">🔍</div>
        <h3 class="text-base font-bold text-slate-300">Consulta de Verificación en Vivo</h3>
        <p class="text-xs text-slate-500 max-w-md mx-auto">
          Ingresa el identificador único del certificado (por ejemplo <code class="text-neonCyan font-mono">SDJ-2026-XXXXXX</code>) para verificar su autenticidad y estado oficial en la plataforma.
        </p>
      </div>
    `;
    return;
  }

  const found = findCertificateById(codeToLookup);

  if (!found) {
    resultBox.innerHTML = `
      <div class="bg-neonRed/10 border-2 border-neonRed rounded-xl p-6 text-center space-y-2">
        <div class="text-2xl">❌</div>
        <h3 class="text-lg font-bold text-neonRed">CERTIFICADO NO ENCONTRADO</h3>
        <p class="text-xs text-slate-300 max-w-md mx-auto">
          No existe ningún certificado registrado bajo el código <code class="text-white font-bold">${escapeHTML(codeToLookup)}</code>. Verifica que esté bien escrito.
        </p>
      </div>
    `;
    return;
  }

  resultBox.innerHTML = `
    <div class="bg-black/80 border-2 border-neonGreen rounded-xl p-6 space-y-5 shadow-neon-green">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-crtBorder pb-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl">✅</span>
          <div>
            <span class="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded bg-neonGreen/20 text-neonGreen border border-neonGreen/40">
              CREDENCIAL OFICIAL AUTÉNTICA Y VERIFICADA
            </span>
            <h3 class="text-xl font-bold text-white mt-1">${found.recipientName}</h3>
          </div>
        </div>
        <div class="text-left sm:text-right font-mono">
          <span class="text-[10px] text-slate-400 block">ID DE REGISTRO</span>
          <span class="text-sm font-bold text-neonCyan">${found.certificateId}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-3">
          <span class="text-[10px] text-slate-400 uppercase block">DOCUMENTO DEL TITULAR</span>
          <span class="font-bold text-white text-sm">${escapeHTML(
            maskSensitivePII(found.recipientDoc || 'No especificado', 'doc', state.settings?.privacyMode)
          )}</span>
        </div>
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-3">
          <span class="text-[10px] text-slate-400 uppercase block">INSTITUCIÓN / EMPRESA</span>
          <span class="font-bold text-neonCyan text-sm">${escapeHTML(found.institution || 'Independiente')}</span>
        </div>
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-3">
          <span class="text-[10px] text-slate-400 uppercase block">ESPECIALIDAD / ROL</span>
          <span class="font-bold text-slate-200 text-sm">${escapeHTML(found.occupation || 'Operador CLI')} (${escapeHTML(found.country || 'Colombia')})</span>
        </div>
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-3 sm:col-span-2">
          <span class="text-[10px] text-slate-400 uppercase block">PROGRAMA / CERTIFICACIÓN APROBADA</span>
          <span class="font-bold text-neonGreen text-sm">"${escapeHTML(found.achievementTitle)}"</span>
        </div>
        <div class="bg-crtPanel border border-crtBorder rounded-lg p-3">
          <span class="text-[10px] text-slate-400 uppercase block">RANGO &amp; FECHA</span>
          <span class="font-bold text-neonAmber text-sm">${escapeHTML(found.rankTitle)} (${found.xpTotal} XP) • ${escapeHTML(found.dateFormatted)}</span>
        </div>
      </div>

      <div class="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-crtBorder">
        <span>Expedido exclusivamente por <strong>SHELLDOJO (Terminal Academy &amp; Panic Arena)</strong></span>
        <span class="text-neonGreen font-bold">● Firma Criptográfica Válida</span>
      </div>
    </div>
  `;
}

/**
 * Renderiza el Modo Jefe Final (#view-boss) con combate multi-fase de 5 etapas.
 */
export function renderBossArena(callbacks = {}) {
  const tabsContainer = document.getElementById('boss-selector-tabs');
  const arenaContainer = document.getElementById('boss-arena-container');
  if (!arenaContainer) return;

  const boss = BOSS_BATTLES.find((b) => b.id === activeBossId) || BOSS_BATTLES[0];
  const bossDisplayName = boss.bossName || boss.name;
  const bossMedal = boss.medalTitle || boss.badgeReward || 'Insignia Jefe Final';
  const defeated = isBossDefeated(boss.id);
  const totalPhases = boss.phases.length;
  const isCompletedNow = activeBossPhaseIndex >= totalPhases;
  const remainingHpPct = isCompletedNow
    ? 0
    : Math.max(0, Math.round(((totalPhases - activeBossPhaseIndex) / totalPhases) * 100));

  if (tabsContainer) {
    tabsContainer.innerHTML = BOSS_BATTLES.map((b) => {
      const isSelected = b.id === boss.id;
      const done = isBossDefeated(b.id);
      const bName = b.bossName || b.name;
      return `
        <button
          type="button"
          data-select-boss="${b.id}"
          class="px-3.5 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
            isSelected
              ? 'bg-neonRed text-white border-neonRed shadow-neon-red'
              : 'bg-black text-slate-300 border-crtBorder hover:border-neonRed/50'
          }"
        >
          <span>${done ? '🏆' : '👹'}</span>
          <span>${bName}</span>
        </button>
      `;
    }).join('');

    tabsContainer.querySelectorAll('[data-select-boss]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeBossId = btn.getAttribute('data-select-boss');
        activeBossPhaseIndex = 0;
        renderBossArena(callbacks);
      });
    });
  }

  if (isCompletedNow) {
    arenaContainer.innerHTML = `
      <div class="bg-crtPanel border-2 border-neonGreen rounded-2xl p-8 text-center space-y-5 shadow-neon-green">
        <div class="text-5xl">🏆</div>
        <span class="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-neonGreen/20 text-neonGreen border border-neonGreen/40">
          ¡AMENAZA NEUTRALIZADA CON ÉXITO!
        </span>
        <h3 class="text-2xl sm:text-3xl font-extrabold text-white">
          Has derrotado a ${bossDisplayName} (${boss.title})
        </h3>
        <p class="text-sm text-slate-300 max-w-xl mx-auto">
          Completaste las 5 fases críticas de respuesta a incidentes sin fallos. Se han acreditado <strong>+${boss.xpReward} XP</strong> y la insignia <strong>${bossMedal}</strong> en tu perfil.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            id="btn-boss-claim-cert"
            type="button"
            class="px-5 py-3 rounded-lg bg-neonAmber text-black font-bold text-xs uppercase tracking-wider hover:bg-neonAmber/90 transition-all"
          >
            🎓 Emitir Certificado de Victoria (${bossDisplayName})
          </button>
          <button
            id="btn-boss-replay"
            type="button"
            class="px-5 py-3 rounded-lg bg-black hover:bg-crtBorder text-slate-200 border border-crtBorder font-bold text-xs uppercase tracking-wider transition-all"
          >
            🔄 Volver a Enfrentar Jefe
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-boss-claim-cert')?.addEventListener('click', () => {
      if (callbacks?.onClaimCertificate) {
        callbacks.onClaimCertificate(`Operación Jefe Final: Victoria contra ${bossDisplayName} (${boss.title})`);
      }
    });

    document.getElementById('btn-boss-replay')?.addEventListener('click', () => {
      activeBossPhaseIndex = 0;
      renderBossArena(callbacks);
    });
    return;
  }

  const currentPhase = boss.phases[activeBossPhaseIndex];
  const scenarioText = currentPhase.instruction || currentPhase.scenario;
  const promptText = currentPhase.prompt || boss.prompt || 'root@prod-incident:~#';

  arenaContainer.innerHTML = `
    <div class="bg-crtPanel border border-crtBorder rounded-xl p-6 space-y-6 shadow-panel">
      <!-- Barra de Vida (HP) del Jefe -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-xs font-bold text-neonRed uppercase tracking-wider">
              👹 ${bossDisplayName} — ${boss.title}
            </span>
            <p class="text-xs text-slate-400 mt-0.5">${boss.lore}</p>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-neonAmber block">RECOMPENSA: +${boss.xpReward} XP</span>
            <span class="text-[11px] text-slate-400">${defeated ? '✓ Ya derrotado anteriormente' : 'Sin derrotar aún'}</span>
          </div>
        </div>

        <div class="flex justify-between text-xs font-bold pt-2">
          <span class="text-neonRed">INTEGRIDAD DEL JEFE (HP)</span>
          <span class="text-white">${remainingHpPct}% HP (Fase ${activeBossPhaseIndex + 1} de ${totalPhases})</span>
        </div>
        <div class="w-full h-4 bg-black rounded-full overflow-hidden border border-neonRed/50">
          <div class="h-full bg-gradient-to-r from-neonRed via-neonAmber to-neonRed transition-all duration-300" style="width: ${remainingHpPct}%"></div>
        </div>
      </div>

      <!-- Escenario de la Fase Actual -->
      <div class="bg-black border-2 border-neonRed/60 rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase px-2.5 py-1 rounded bg-neonRed/20 text-neonRed border border-neonRed/40">
            ⚡ ${currentPhase.phaseTitle}
          </span>
          <span class="text-xs font-mono text-slate-400">Daño por impacto: -20% HP</span>
        </div>

        <p class="text-base sm:text-lg font-semibold text-white leading-snug">
          ${scenarioText}
        </p>

        <p class="text-xs text-neonAmber">
          💡 Pista Táctica: ${currentPhase.hint}
        </p>

        <form id="boss-command-form" class="bg-crtPanel border border-crtBorder rounded-lg p-3.5 flex items-center gap-2" autocomplete="off">
          <span class="text-neonRed font-bold text-xs sm:text-sm shrink-0 select-none">
            ${promptText}
          </span>
          <input
            id="boss-command-input"
            type="text"
            required
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="Escribe el comando exacto para golpear al Jefe..."
            class="w-full bg-transparent text-white font-mono text-sm sm:text-base focus:outline-none placeholder:text-slate-600"
          />
          <button type="submit" class="px-4 py-2 rounded bg-neonRed text-white font-bold text-xs hover:bg-neonRed/90 transition-all shrink-0">
            ATACAR &crarr;
          </button>
        </form>

        <div id="boss-feedback-msg" class="text-xs font-mono min-h-[1.25rem]"></div>
      </div>
    </div>
  `;

  const form = document.getElementById('boss-command-form');
  const input = document.getElementById('boss-command-input');

  input?.focus();

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input) return;

    if (validateCommand(input.value, currentPhase.validCommands)) {
      activeBossPhaseIndex += 1;
      if (activeBossPhaseIndex >= totalPhases) {
        SoundFX.playLevelUp();
        recordBossVictory(boss.id, boss.xpReward);
        updateHUD();
        if (callbacks?.onBossDefeated) callbacks.onBossDefeated();
      } else {
        SoundFX.playSuccess();
      }
      renderBossArena(callbacks);
    } else {
      SoundFX.playError();
      activeBossPhaseIndex = 0; // El escudo del jefe se regenera si fallas
      renderBossArena(callbacks);
      const newFeedback = document.getElementById('boss-feedback-msg');
      if (newFeedback) {
        newFeedback.className = 'text-xs font-mono text-neonRed font-bold';
        newFeedback.textContent =
          '✖ ¡IMPACTO FALLIDO! El escudo del Jefe se ha regenerado al 100% HP. Revisa la pista e inténtalo de nuevo.';
      }
    }
  });
}

/**
 * MODO DUELO MULTIJUGADOR 1V1 (PVP HACKER DUEL) — 100% EN TIEMPO REAL ENTRE PERSONAS REALES
 * Sin bots ni simulaciones: requiere obligatoriamente al menos 2 personas reales conectadas a la misma sala.
 * Si solo hay 1 persona, el modo NO es funcional y permanece en espera de un oponente real.
 */
export function renderDuelArena(callbacks = {}) {
  const container = document.getElementById('duel-arena-container');
  const roomBadge = document.getElementById('duel-room-badge');
  if (!container) return;

  const playerId = getOrCreatePlayerId();
  const state = getState();

  if (roomBadge) {
    roomBadge.textContent = `SALA #${activeDuelRoomCode}`;
  }

  // Detener timer previo si existe
  if (duelHeartbeatTimer) {
    clearInterval(duelHeartbeatTimer);
    duelHeartbeatTimer = null;
  }

  // Función interna para sincronizar el estado del duelo con el servidor
  async function syncAndRender() {
    const payload = {
      playerId,
      name: state.user?.name || 'Operador Invitado',
      handle: state.user?.handle || 'operador',
      institution: state.user?.institution || 'Colombia',
      roomCode: activeDuelRoomCode
    };

    const res = await sendDuelHeartbeat(payload);

    if (!res || !res.ok) {
      // Si el servidor está offline o la sala está llena de otras 2 personas
      if (res && res.full) {
        renderRoomFullView(container, res.error, callbacks);
      } else {
        renderWaitingAloneView(container, {
          roomCode: activeDuelRoomCode,
          playerCount: 1,
          totalOnline: 1,
          isOffline: true
        }, callbacks);
      }
      return;
    }

    duelLastRoomState = res.room;
    const room = res.room;
    const totalOnline = res.totalOnline || 1;

    // CONDICIÓN CRÍTICA: Solo funciona si hay 2 o más personas reales conectadas en la sala
    if (room.playerCount < 2 || room.status === 'waiting') {
      renderWaitingAloneView(container, {
        roomCode: room.code,
        playerCount: room.playerCount,
        totalOnline
      }, callbacks);
      return;
    }

    // Hay 2 personas reales conectadas
    if (room.status === 'finished') {
      renderDuelFinishedView(container, room, playerId, callbacks);
    } else {
      renderActiveDuelMatchView(container, room, playerId, callbacks);
    }
  }

  // Primer sync inmediato
  syncAndRender();

  // Polling continuo de presencia y sincronización en vivo cada 2.5s mientras la vista siga activa
  duelHeartbeatTimer = setInterval(() => {
    const duelSection = document.getElementById('view-duel');
    if (!duelSection || duelSection.classList.contains('hidden')) {
      clearInterval(duelHeartbeatTimer);
      duelHeartbeatTimer = null;
      return;
    }
    syncAndRender();
  }, 2500);

  // Vincular botón de "Nueva Sala 1v1" en el encabezado
  const newRoomBtn = document.getElementById('btn-duel-new-room');
  if (newRoomBtn) {
    newRoomBtn.onclick = () => {
      leaveDuelRoom({ playerId, roomCode: activeDuelRoomCode });
      activeDuelRoomCode = String(Math.floor(1000 + Math.random() * 9000));
      SoundFX.playKey();
      renderDuelArena(callbacks);
    };
  }
}

/**
 * Vista cuando NO hay otra persona conectada: El modo Duelo NO es funcional.
 * Muestra el radar de espera y herramientas para invitar a otra persona real.
 */
function renderWaitingAloneView(container, data, callbacks) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?duel=${encodeURIComponent(data.roomCode)}`;

  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-crtPanel border-2 border-neonAmber/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-panel">
        <!-- Banner de Inactividad por falta de personas -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-crtBorder pb-5">
          <div class="flex items-center gap-3">
            <span class="relative flex h-4 w-4">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-neonAmber opacity-75"></span>
              <span class="relative inline-flex rounded-full h-4 w-4 bg-neonAmber"></span>
            </span>
            <div>
              <span class="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded bg-neonAmber/20 text-neonAmber border border-neonAmber/40">
                MODO INACTIVO // ESPERANDO CONTRINCANTE REAL
              </span>
              <h3 class="text-xl sm:text-2xl font-bold text-white mt-1">
                Sala #${data.roomCode} en Espera de un Segundo Jugador
              </h3>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs px-3 py-1.5 rounded-lg bg-black border border-crtBorder text-slate-300 font-mono">
              👥 Operadores en sala: <strong class="text-neonAmber">${data.playerCount} / 2</strong>
            </span>
            <span class="text-xs px-3 py-1.5 rounded-lg bg-black border border-crtBorder text-slate-300 font-mono">
              🌐 En línea en ShellDojo: <strong class="text-neonCyan">${data.totalOnline}</strong>
            </span>
          </div>
        </div>

        <!-- Explicación de NO simulación -->
        <div class="bg-black/70 border border-neonAmber/40 rounded-xl p-5 space-y-3">
          <div class="flex items-start gap-3">
            <span class="text-2xl">🔒</span>
            <div class="space-y-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p class="font-bold text-neonAmber">
                Competición 100% Auténtica: Sin bots ni rivales simulados.
              </p>
              <p class="text-slate-400">
                Para mantener la máxima transparencia técnica, el Duelo 1v1 no permite jugar contra la máquina ni genera tiempos ficticios. El combate se desbloqueará y comenzará <strong>automáticamente en el instante en que otra persona real ingrese a esta sala</strong>.
              </p>
            </div>
          </div>
        </div>

        <!-- Acciones para Conectar a Otra Persona -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <!-- Opción A: Compartir enlace de la sala -->
          <div class="bg-black/60 border border-crtBorder rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div class="space-y-1.5">
              <div class="text-xs font-bold text-neonCyan uppercase tracking-wider flex items-center gap-1.5">
                <span>🔗</span> Invitar a un Amigo o Compañero
              </div>
              <p class="text-xs text-slate-400">
                Copia este enlace y ábrelo en otra pestaña, en tu celular o compártelo con otro estudiante para batirse a duelo en tiempo real.
              </p>
              <div class="bg-black border border-crtBorder rounded p-2.5 font-mono text-xs text-slate-300 break-all select-all">
                ${escapeHTML(shareUrl)}
              </div>
            </div>

            <button
              id="btn-copy-duel-link"
              type="button"
              class="w-full py-2.5 rounded-lg bg-neonCyan text-black font-bold text-xs uppercase tracking-wider hover:bg-neonCyan/90 transition-all flex items-center justify-center gap-2"
            >
              <span>📋</span> Copiar Enlace Directo a Sala #${data.roomCode}
            </button>
            <div id="duel-copy-feedback" class="text-[11px] text-neonGreen font-bold text-center hidden">
              ✔ ¡Enlace copiado al portapapeles! Ábrelo en otra pestaña para probar el 1v1.
            </div>
          </div>

          <!-- Opción B: Unirse a otra sala existente -->
          <div class="bg-black/60 border border-crtBorder rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div class="space-y-1.5">
              <div class="text-xs font-bold text-neonGreen uppercase tracking-wider flex items-center gap-1.5">
                <span>🚪</span> Unirse a Sala de un Compañero
              </div>
              <p class="text-xs text-slate-400">
                Si un colega ya creó una sala, ingresa su código de 4 dígitos para retarlo directamente.
              </p>
            </div>

            <form id="form-join-duel-room" class="space-y-3" autocomplete="off">
              <div class="flex gap-2">
                <input
                  id="input-join-room-code"
                  type="text"
                  required
                  maxlength="6"
                  placeholder="Ej: 5821"
                  class="flex-1 bg-black border border-crtBorder focus:border-neonGreen rounded-lg px-3 py-2 text-sm text-white font-mono uppercase tracking-widest text-center focus:outline-none"
                />
                <button
                  type="submit"
                  class="px-5 py-2 rounded-lg bg-neonGreen text-black font-bold text-xs uppercase tracking-wider hover:bg-neonGreen/90 transition-all"
                >
                  Entrar &rarr;
                </button>
              </div>
              <button
                id="btn-generate-random-room"
                type="button"
                class="w-full text-center text-xs text-slate-400 hover:text-neonCyan underline transition-colors"
              >
                O generar un código aleatorio nuevo
              </button>
            </form>
          </div>
        </div>

        <!-- Radar animado de búsqueda -->
        <div class="text-center py-4 space-y-2">
          <div class="inline-flex items-center gap-2 text-xs text-slate-400">
            <span class="animate-spin inline-block h-3 w-3 border-2 border-neonAmber border-t-transparent rounded-full"></span>
            <span>Escaneando sala en vivo... Cuando tu contrincante ingrese, la terminal se habilitará al instante.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Copiar enlace de invitación
  document.getElementById('btn-copy-duel-link')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      SoundFX.playKey();
      const fb = document.getElementById('duel-copy-feedback');
      if (fb) {
        fb.classList.remove('hidden');
        setTimeout(() => fb.classList.add('hidden'), 3500);
      }
    });
  });

  // Unirse a sala con código
  const joinForm = document.getElementById('form-join-duel-room');
  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('input-join-room-code')?.value.trim().toUpperCase();
    if (val) {
      activeDuelRoomCode = val;
      SoundFX.playKey();
      renderDuelArena(callbacks);
    }
  });

  // Generar nueva sala
  document.getElementById('btn-generate-random-room')?.addEventListener('click', () => {
    activeDuelRoomCode = String(Math.floor(1000 + Math.random() * 9000));
    SoundFX.playKey();
    renderDuelArena(callbacks);
  });
}

/**
 * Vista de Sala Llena (más de 2 jugadores en el mismo código)
 */
function renderRoomFullView(container, errorMsg, callbacks) {
  container.innerHTML = `
    <div class="bg-crtPanel border-2 border-neonRed rounded-2xl p-8 text-center space-y-5 shadow-neon-red">
      <div class="text-4xl">⚠️</div>
      <h3 class="text-xl font-bold text-neonRed">SALA LLENA</h3>
      <p class="text-xs text-slate-300 max-w-md mx-auto">
        ${escapeHTML(errorMsg || 'Esta sala ya cuenta con 2 operadores combatiendo en vivo.')}
      </p>
      <div class="flex justify-center gap-3 pt-2">
        <button
          id="btn-duel-full-new-room"
          type="button"
          class="px-5 py-2.5 rounded-lg bg-neonGreen text-black font-bold text-xs uppercase tracking-wider"
        >
          Crear Otra Sala Libre &rarr;
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-duel-full-new-room')?.addEventListener('click', () => {
    activeDuelRoomCode = String(Math.floor(1000 + Math.random() * 9000));
    SoundFX.playKey();
    renderDuelArena(callbacks);
  });
}

/**
 * Vista del Combate 1v1 Activo: 2 personas reales conectadas.
 * Ambos operadores ven el comando objetivo y compiten en vivo.
 */
function renderActiveDuelMatchView(container, room, playerId, callbacks) {
  const state = getState();
  const me = room.players.find((p) => p.id === playerId) || { name: state.user?.name || 'Tú', handle: state.user?.handle || 'operador' };
  const rival = room.players.find((p) => p.id !== playerId) || { name: 'Contrincante', handle: 'rival', institution: 'Colombia' };

  const myScore = room.scores[playerId] || 0;
  const rivalScore = room.scores[rival.id] || 0;
  const currentRound = room.currentRound || {
    roundTitle: `Asalto ${(room.currentRoundIndex || 0) + 1}/5`,
    scenario: '¡Ejecuta el comando antes que tu oponente!',
    prompt: 'duel@arena:~$',
    hint: ''
  };

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Marcador Cara a Cara 1 vs 1 REAL -->
      <div class="bg-crtPanel border border-crtBorder rounded-xl p-5 space-y-5 shadow-panel">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <!-- Jugador 1 (Tú) -->
          <div class="bg-black/80 border border-neonGreen/50 rounded-lg p-3.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              ${getOperatorAvatarHTML('w-10 h-10 text-xl')}
              <div>
                <div class="text-xs font-bold text-white">${escapeHTML(me.name)} (TÚ)</div>
                <div class="text-[11px] text-neonGreen font-mono">@${escapeHTML(me.handle)}</div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 block">ASALTOS</span>
              <span class="text-2xl font-extrabold text-neonGreen">${myScore}</span>
            </div>
          </div>

          <!-- VS Central en Vivo -->
          <div class="text-center space-y-1">
            <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded bg-neonGreen/20 text-neonGreen border border-neonGreen/40">
              🟢 EN VIVO // ${escapeHTML(currentRound.roundTitle)}
            </span>
            <div class="text-xl font-extrabold text-white tracking-widest">⚡ 1 VS 1 ⚡</div>
            <div class="text-[10px] text-neonAmber font-mono">SALA #${room.code} • 2 PERSONAS EN TIEMPO REAL</div>
          </div>

          <!-- Jugador 2 (Rival Real Conectado) -->
          <div class="bg-black/80 border border-neonRed/50 rounded-lg p-3.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-full bg-neonRed/20 border border-neonRed flex items-center justify-center text-xl">👤</span>
              <div>
                <div class="text-xs font-bold text-white">${escapeHTML(rival.name)}</div>
                <div class="text-[11px] text-neonCyan font-mono">@${escapeHTML(rival.handle)} • ${escapeHTML(rival.institution || 'Colombia')}</div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 block">ASALTOS</span>
              <span class="text-2xl font-extrabold text-neonRed">${rivalScore}</span>
            </div>
          </div>
        </div>

        <!-- Terminal de Asalto 1v1 -->
        <div class="bg-black border-2 border-neonAmber/60 rounded-xl p-5 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-neonAmber uppercase tracking-wider">
              🚨 OBJETIVO DEL ASALTO ${(room.currentRoundIndex || 0) + 1} DE 5:
            </span>
            <span class="text-xs text-slate-400 font-mono">El primero en responder gana el asalto</span>
          </div>

          <p class="text-base sm:text-lg font-bold text-white">${escapeHTML(currentRound.scenario)}</p>
          ${
            currentRound.hint
              ? `<p class="text-xs text-neonAmber">💡 Pista Táctica: ${escapeHTML(currentRound.hint)}</p>`
              : ''
          }

          <form id="duel-command-form" class="bg-crtPanel border border-crtBorder rounded-lg p-3.5 flex items-center gap-2" autocomplete="off">
            <span class="text-neonGreen font-bold text-xs sm:text-sm shrink-0 select-none">${escapeHTML(currentRound.prompt)}</span>
            <input
              id="duel-command-input"
              type="text"
              required
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              placeholder="Escribe el comando exacto y presiona Enter..."
              class="w-full bg-transparent text-white font-mono text-sm sm:text-base focus:outline-none"
            />
            <button type="submit" class="px-5 py-2 rounded bg-neonGreen text-black font-bold text-xs hover:bg-neonGreen/90 shrink-0">
              DISPARAR &crarr;
            </button>
          </form>

          <div id="duel-feedback" class="text-xs font-mono min-h-[1.25rem]"></div>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('duel-command-form');
  const input = document.getElementById('duel-command-input');
  const feedback = document.getElementById('duel-feedback');

  input?.focus();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input || !input.value.trim()) return;

    const cmd = input.value.trim();
    const res = await submitDuelCommand({
      playerId,
      roomCode: room.code,
      command: cmd
    });

    if (res && res.correct) {
      SoundFX.playSuccess();
      if (feedback) {
        feedback.className = 'text-xs font-mono text-neonGreen font-bold';
        feedback.textContent = '✔ ¡ACIERTO RÁPIDO! Has ganado este asalto.';
      }
      setTimeout(() => {
        renderDuelArena(callbacks);
      }, 500);
    } else {
      SoundFX.playError();
      if (feedback) {
        feedback.className = 'text-xs font-mono text-neonRed font-bold';
        feedback.textContent = `✖ Comando incorrecto. ${currentRound.hint ? 'Pista: ' + currentRound.hint : 'Inténtalo de nuevo.'}`;
      }
    }
  });
}

/**
 * Vista de Duelo Finalizado: Un jugador real ganó 3 asaltos.
 */
function renderDuelFinishedView(container, room, playerId, callbacks) {
  const meWon = room.winnerId === playerId;
  const state = getState();
  const rival = room.players.find((p) => p.id !== playerId) || { name: 'Contrincante', handle: 'rival' };
  const myScore = room.scores[playerId] || 0;
  const rivalScore = room.scores[rival.id] || 0;

  if (meWon) {
    SoundFX.playLevelUp();
    recordDuelVictory(450);
    updateHUD();
  }

  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-crtPanel border-2 ${
        meWon ? 'border-neonGreen shadow-neon-green' : 'border-neonRed shadow-neon-red'
      } rounded-2xl p-8 text-center space-y-4">
        <div class="text-5xl">${meWon ? '🏆' : '⚡'}</div>
        <span class="text-xs font-bold uppercase px-3 py-1 rounded-full ${
          meWon ? 'bg-neonGreen/20 text-neonGreen' : 'bg-neonRed/20 text-neonRed'
        }">
          MARCADOR FINAL EN SALA #${room.code}: TÚ ${myScore} — ${rivalScore} @${escapeHTML(rival.handle)}
        </span>
        <h3 class="text-2xl sm:text-3xl font-extrabold text-white">
          ${meWon ? `¡Victoria Real en Duelo 1v1 contra @${rival.handle}!` : `Duelo Finalizado: @${rival.handle} fue más veloz`}
        </h3>
        <p class="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
          ${
            meWon
              ? `Dominaste la terminal en tiempo real frente a un oponente humano real y ganaste +450 XP acreditados a tu perfil.`
              : 'Buen intento. Ambos compitieron en vivo con los mismos desafíos. Puedes iniciar una revancha inmediata.'
          }
        </p>

        <div class="flex flex-wrap items-center justify-center gap-3 pt-3">
          ${
            meWon
              ? `<button id="btn-duel-claim-cert" type="button" class="px-5 py-3 rounded-lg bg-neonAmber text-black font-bold text-xs uppercase tracking-wider hover:bg-neonAmber/90 transition-all">
                   🎓 Reclamar Certificado Campeón 1v1 vs @${rival.handle}
                 </button>`
              : ''
          }
          <button id="btn-duel-real-rematch" type="button" class="px-5 py-3 rounded-lg bg-neonGreen text-black font-bold text-xs uppercase tracking-wider hover:bg-neonGreen/90 transition-all">
            🔄 Iniciar Revancha 1v1 con @${rival.handle}
          </button>
          <button id="btn-duel-change-room" type="button" class="px-5 py-3 rounded-lg bg-black hover:bg-crtBorder text-slate-300 border border-crtBorder font-bold text-xs uppercase tracking-wider transition-all">
            🚪 Salir a Otra Sala
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-duel-claim-cert')?.addEventListener('click', () => {
    if (callbacks?.onClaimCertificate) {
      callbacks.onClaimCertificate(`Campeón de Duelo Táctico 1v1 en Vivo (Sala #${room.code} vs @${rival.handle})`);
    }
  });

  document.getElementById('btn-duel-real-rematch')?.addEventListener('click', async () => {
    await resetDuelRoom({ roomCode: room.code });
    SoundFX.playKey();
    renderDuelArena(callbacks);
  });

  document.getElementById('btn-duel-change-room')?.addEventListener('click', () => {
    leaveDuelRoom({ playerId, roomCode: room.code });
    activeDuelRoomCode = String(Math.floor(1000 + Math.random() * 9000));
    SoundFX.playKey();
    renderDuelArena(callbacks);
  });
}

/**
 * IDEA #3: Renderiza el Portafolio Técnico & Generador Automático de CV (#view-portfolio).
 */
export function renderOperatorPortfolio(callbacks = {}) {
  const container = document.getElementById('portfolio-container');
  if (!container) return;

  const state = getState();
  const user = state.user || {
    name: 'Operador ShellDojo',
    handle: 'operador',
    email: 'contacto@shelldojo.io',
    docType: 'CC',
    docNumber: 'No registrado',
    phone: 'No registrado',
    country: 'Colombia',
    institution: 'Independiente',
    occupation: 'Ingeniero DevOps & Operaciones CLI'
  };

  const privacy = Boolean(state.settings?.privacyMode);
  const displayDoc = user.docNumber ? maskSensitivePII(`${user.docType || 'CC'} ${user.docNumber}`, 'doc', privacy) : 'No registrado';
  const displayEmail = maskSensitivePII(user.email, 'email', privacy);
  const displayPhone = user.phone ? maskSensitivePII(user.phone, 'phone', privacy) : 'No registrado';

  const skillsHTML = CURRICULUM_DATA.map((track) => {
    const total = track.lessons.length;
    const done = track.lessons.filter((l) => isLessonCompleted(l.id)).length;
    const pct = Math.max(15, Math.round((done / total) * 100));
    const highScore = state.arenaHighScores[track.id] || 0;

    return `
      <div class="bg-black/70 border border-crtBorder rounded-lg p-3.5 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-white">${track.title}</span>
          <span class="text-neonGreen font-mono font-bold">${done}/${total} Niveles (${pct}%)</span>
        </div>
        <div class="w-full h-2 bg-crtPanel rounded-full overflow-hidden border border-crtBorder">
          <div class="h-full bg-neonGreen" style="width: ${pct}%"></div>
        </div>
        <div class="flex justify-between text-[11px] text-slate-400">
          <span>${total * 15} ejercicios prácticos</span>
          <span class="text-neonAmber">Récord Arena: ${highScore} PTS</span>
        </div>
      </div>
    `;
  }).join('');

  const certsHTML = (state.issuedCertificates || [])
    .slice(0, 6)
    .map(
      (c) => `
        <div class="bg-black/70 border border-neonCyan/40 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-mono text-neonCyan font-bold block">ID: ${escapeHTML(c.certificateId)} • ${escapeHTML(c.dateFormatted)}</span>
            <div class="text-xs font-bold text-white mt-0.5">${escapeHTML(c.achievementTitle)}</div>
          </div>
          <button
            type="button"
            data-portfolio-verify="${escapeHTML(c.certificateId)}"
            class="px-3 py-1.5 rounded bg-neonCyan/15 hover:bg-neonCyan text-neonCyan hover:text-black border border-neonCyan/40 font-bold text-xs transition-all shrink-0"
          >
            🔎 Verificar Credencial
          </button>
        </div>
      `
    )
    .join('');

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Tarjeta Lateral de Identidad del Operador -->
      <div class="lg:col-span-4 bg-crtPanel border-2 border-neonGreen/70 rounded-2xl p-6 space-y-5 shadow-neon-green">
        <div class="flex flex-col items-center text-center space-y-3">
          ${getOperatorAvatarHTML('w-20 h-20 text-4xl')}
          <div>
            <span class="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded bg-neonGreen/20 text-neonGreen border border-neonGreen/40">
              ${calculateRank(state.xp)} • ${state.xp.toLocaleString()} XP
            </span>
            <h3 class="text-xl font-extrabold text-white mt-2">${escapeHTML(user.name)}</h3>
            <p class="text-xs text-neonCyan font-mono">@${escapeHTML(user.handle)}</p>
          </div>
        </div>

        <div class="space-y-2.5 pt-4 border-t border-crtBorder text-xs">
          <div class="flex justify-between">
            <span class="text-slate-400">Especialidad:</span>
            <span class="text-white font-bold text-right">${escapeHTML(user.occupation)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Institución / Empresa:</span>
            <span class="text-neonCyan font-bold text-right">${escapeHTML(user.institution)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Documento Identidad:</span>
            <span class="text-slate-200 font-mono">${escapeHTML(displayDoc)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Correo Contacto:</span>
            <span class="text-slate-200 font-mono">${escapeHTML(displayEmail)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">WhatsApp / Móvil:</span>
            <span class="text-slate-200 font-mono">${escapeHTML(displayPhone)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Ubicación:</span>
            <span class="text-neonAmber font-bold">${escapeHTML(user.country || 'Colombia')}</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 pt-3 border-t border-crtBorder text-center">
          <div class="bg-black border border-crtBorder rounded p-2">
            <span class="text-[10px] text-slate-400 block">NIVELES</span>
            <span class="text-sm font-bold text-neonGreen">${state.completedLessons.length}/42</span>
          </div>
          <div class="bg-black border border-crtBorder rounded p-2">
            <span class="text-[10px] text-slate-400 block">JEFES</span>
            <span class="text-sm font-bold text-neonRed">👹 ${(state.defeatedBosses || []).length}</span>
          </div>
          <div class="bg-black border border-crtBorder rounded p-2">
            <span class="text-[10px] text-slate-400 block">DUELOS 1V1</span>
            <span class="text-sm font-bold text-neonAmber">⚔️ ${state.duelWins || 0}</span>
          </div>
        </div>
      </div>

      <!-- Matriz de Competencias Técnicas & Certificaciones -->
      <div class="lg:col-span-8 space-y-6">
        <div class="bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-4 shadow-panel">
          <h4 class="text-sm font-bold uppercase tracking-wider text-neonGreen">
            📊 Matriz de Competencias Técnicas de Terminal (7 Rutas // 630 Retos)
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${skillsHTML}
          </div>
        </div>

        <div class="bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-4 shadow-panel">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-bold uppercase tracking-wider text-neonCyan">
              🎓 Certificaciones Oficiales Verificables (${(state.issuedCertificates || []).length})
            </h4>
            <button id="btn-portfolio-new-cert" type="button" class="text-xs font-bold text-neonAmber hover:underline">
              + Emitir Nuevo Diploma
            </button>
          </div>
          <div class="space-y-2.5">
            ${certsHTML}
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-portfolio-verify]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-portfolio-verify');
      renderCertificateVerifier(code);
      switchView('verify');
    });
  });

  document.getElementById('btn-portfolio-new-cert')?.addEventListener('click', () => {
    if (callbacks?.onClaimCertificate) {
      callbacks.onClaimCertificate(`Portafolio Integral DevOps, Linux, Docker, SQL & SecOps (${user.occupation})`);
    }
  });
}

/**
 * Abre una vista imprimible HD en PDF del CV Técnico del Operador.
 */
export function printTechnicalCV() {
  const state = getState();
  const user = state.user || {
    name: 'Operador ShellDojo',
    handle: 'operador',
    email: 'contacto@shelldojo.io',
    docType: 'CC',
    docNumber: 'No registrado',
    phone: 'No registrado',
    country: 'Colombia',
    institution: 'Independiente',
    occupation: 'Ingeniero DevOps & Operaciones CLI'
  };

  const certsList = (state.issuedCertificates || [])
    .map((c) => `<li><strong>${escapeHTML(c.achievementTitle)}</strong> — ID Verificación: <code>${escapeHTML(c.certificateId)}</code> (${escapeHTML(c.dateFormatted)})</li>`)
    .join('');

  const popup = window.open('', '_blank', 'width=980,height=780');
  if (!popup) return;

  popup.document.write(`<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>CV Técnico - ${escapeHTML(user.name)} | ShellDojo</title>
    <style>
      body { font-family: 'Segoe UI', Roboto, monospace; background: #070a0e; color: #e2e8f0; padding: 36px; }
      .sheet { max-width: 850px; margin: 0 auto; border: 2px solid #00ff66; border-radius: 14px; padding: 32px; background: #0d131a; }
      h1 { color: #00ff66; margin: 0 0 4px 0; font-size: 28px; text-transform: uppercase; }
      h2 { color: #00e5ff; font-size: 15px; border-bottom: 1px solid #1b2836; padding-bottom: 6px; margin-top: 24px; text-transform: uppercase; }
      .meta { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
      .box { background: #070a0e; border: 1px solid #1b2836; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
      ul { font-size: 13px; line-height: 1.7; }
      .btn { background: #00ff66; color: #000; border: none; padding: 10px 18px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-bottom: 16px; }
      @media print { .no-print { display: none; } body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="max-width:850px;margin:0 auto;">
      <button class="btn" onclick="window.print()">🖨️ Guardar como PDF / Imprimir Hoja de Vida Técnica</button>
    </div>
    <div class="sheet">
      <h1>${escapeHTML(user.name)} (@${escapeHTML(user.handle)})</h1>
      <div class="meta">
        <strong>Rol / Especialidad:</strong> ${escapeHTML(user.occupation)}<br/>
        <strong>Institución / Empresa:</strong> ${escapeHTML(user.institution)} (${escapeHTML(user.country)})<br/>
        <strong>Documento:</strong> ${escapeHTML(user.docType)} ${escapeHTML(user.docNumber)} • <strong>Correo:</strong> ${escapeHTML(user.email)} • <strong>Tel:</strong> ${escapeHTML(user.phone)}<br/>
        <strong>Rango Oficial ShellDojo:</strong> ${calculateRank(state.xp)} (${state.xp} XP) • <strong>Jefes Derrotados:</strong> ${(state.defeatedBosses || []).length} • <strong>Victorias 1v1:</strong> ${state.duelWins || 0}
      </div>

      <h2>Competencias Prácticas Evaluadas en Consola (ShellDojo CLI)</h2>
      <div class="grid">
        <div class="box"><strong>Git &amp; GitHub:</strong> Ramas, Merge, Reset, Stash, Cherry-Pick, Rebase</div>
        <div class="box"><strong>Linux &amp; Bash SysAdmin:</strong> Permisos chmod/chown, Procesos, Systemd, Redes</div>
        <div class="box"><strong>Docker &amp; Contenedores:</strong> Imágenes, Volúmenes, Redes, Docker Compose</div>
        <div class="box"><strong>Windows CMD &amp; NetOps:</strong> Diagnóstico TCP/IP, Puertos, Reglas Firewall</div>
        <div class="box"><strong>Bases de Datos SQL:</strong> DDL/DML, Joins, Índices, Backups pg_dump</div>
        <div class="box"><strong>Python, Node &amp; SecOps:</strong> Entornos venv, PM2, Auditoría SSH/UFW, Hashes SHA256</div>
      </div>

      <h2>Certificaciones Emitidas y Verificables</h2>
      <ul>${certsList}</ul>
    </div>
  </body>
  </html>`);
  popup.document.close();
}

/**
 * IDEA #5 + CONFIGURACIÓN COMPLETA + SEGURIDAD 2FA PRO (#view-settings):
 * - Selector de Foto de Perfil (8 Avatares programados + Subida de archivo/URL)
 * - Tienda XP de Temas Visuales Retro-Futuristas y Switches Mecánicos
 * - Ajustes de Sensibilidad Visual/Auditiva y Reloj de Arena
 * - Privacidad de Datos (Habeas Data) + Verificación 2FA para cuentas de pago + Auditoría Anti-Hackeo
 */
export function renderSettingsAndShop(callbacks = {}) {
  const container = document.getElementById('settings-container');
  const xpBalanceEl = document.getElementById('settings-xp-balance');
  if (!container) return;

  const state = getState();
  const settings = state.settings || {};
  const sec = state.proAccountSecurity || {};
  const isPro = hasProAccess();

  if (xpBalanceEl) {
    xpBalanceEl.textContent = `${state.xp.toLocaleString()} XP`;
  }

  // 1. Grilla de los 8 Avatares Programados
  const avatarsHTML = OPERATOR_AVATARS.map((av) => {
    const selected = !settings.customAvatarUrl && settings.avatarId === av.id;
    return `
      <button
        type="button"
        data-pick-avatar="${av.id}"
        class="p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
          selected
            ? 'bg-neonGreen/15 border-2 border-neonGreen shadow-neon-green'
            : 'bg-black/70 border-crtBorder hover:border-slate-500'
        }"
      >
        <span class="w-11 h-11 rounded-full bg-gradient-to-br ${av.bgClass} border flex items-center justify-center text-2xl shrink-0">
          ${av.emoji}
        </span>
        <div class="min-w-0">
          <div class="text-xs font-bold text-white truncate">${av.name}</div>
          <div class="text-[10px] text-slate-400 truncate">${av.role}</div>
          ${selected ? '<span class="text-[10px] text-neonGreen font-extrabold">● ACTIVO</span>' : ''}
        </div>
      </button>
    `;
  }).join('');

  // 2. Grilla de la Tienda de Temas Visuales (Canje con XP)
  const themesShopHTML = TERMINAL_THEMES_SHOP.map((theme) => {
    const unlocked = (settings.unlockedThemes || []).includes(theme.id);
    const isActive = settings.activeThemeId === theme.id;
    const swatches = theme.previewColors
      .map((hex) => `<span class="w-4 h-4 rounded-full border border-white/30 inline-block" style="background:${hex}"></span>`)
      .join('');

    return `
      <div class="bg-black/70 border ${
        isActive ? 'border-2 border-neonGreen shadow-neon-green' : 'border-crtBorder'
      } rounded-xl p-4 flex flex-col justify-between gap-3">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">${swatches}</div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${
              unlocked ? 'bg-neonGreen/20 text-neonGreen' : 'bg-neonAmber/20 text-neonAmber'
            }">
              ${unlocked ? '✓ DESBLOQUEADO' : `🔒 ${theme.costXP} XP`}
            </span>
          </div>
          <h4 class="text-sm font-bold text-white">${theme.name}</h4>
          <p class="text-xs text-slate-400">${theme.description}</p>
        </div>

        <button
          type="button"
          data-shop-theme="${theme.id}"
          data-shop-cost="${theme.costXP}"
          class="w-full py-2 rounded-lg font-bold text-xs uppercase transition-all ${
            isActive
              ? 'bg-neonGreen text-black'
              : unlocked
              ? 'bg-neonCyan/20 text-neonCyan border border-neonCyan/40 hover:bg-neonCyan hover:text-black'
              : 'bg-neonAmber text-black hover:bg-neonAmber/90'
          }"
        >
          ${isActive ? '● Tema Visual Activo' : unlocked ? 'Activar Tema' : `Canjear por ${theme.costXP} XP`}
        </button>
      </div>
    `;
  }).join('');

  // 3. Grilla de Switches Mecánicos de Sonido (Canje con XP)
  const soundProfilesHTML = KEYBOARD_SOUND_PROFILES.map((sp) => {
    const unlocked = (settings.unlockedSoundProfiles || []).includes(sp.id);
    const isActive = settings.keyboardProfileId === sp.id;

    return `
      <div class="bg-black/70 border ${
        isActive ? 'border-2 border-neonCyan shadow-neon-cyan' : 'border-crtBorder'
      } rounded-xl p-4 flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-white">⌨️ ${sp.name}</span>
            <span class="text-[10px] font-bold text-neonAmber">${unlocked ? '✓ LISTO' : `${sp.costXP} XP`}</span>
          </div>
          <p class="text-xs text-slate-400">${sp.description}</p>
        </div>
        <button
          type="button"
          data-shop-sound="${sp.id}"
          data-shop-cost="${sp.costXP}"
          class="w-full py-2 rounded-lg font-bold text-xs uppercase transition-all ${
            isActive
              ? 'bg-neonCyan text-black'
              : unlocked
              ? 'bg-black border border-neonCyan text-neonCyan hover:bg-neonCyan hover:text-black'
              : 'bg-neonAmber text-black hover:bg-neonAmber/90'
          }"
        >
          ${isActive ? '🔊 Switch Activo (Probar)' : unlocked ? 'Usar este Switch' : `Desbloquear (${sp.costXP} XP)`}
        </button>
      </div>
    `;
  }).join('');

  // 4. Bitácora de Auditoría de Ciberseguridad
  const auditLogsHTML = (state.securityAuditLog || [])
    .slice(0, 6)
    .map(
      (log) => `
        <div class="flex items-center justify-between text-xs font-mono py-1.5 border-b border-crtBorder/50">
          <span class="${
            log.level === 'WARN' ? 'text-neonRed' : log.level === 'SUCCESS' ? 'text-neonGreen' : 'text-neonCyan'
          }">[${escapeHTML(log.level)}] ${escapeHTML(log.event)}</span>
          <span class="text-slate-500 text-[11px] shrink-0 ml-2">${escapeHTML(log.timestamp)}</span>
        </div>
      `
    )
    .join('');

  container.innerHTML = `
    <div id="settings-feedback-toast" class="hidden bg-neonGreen/15 border border-neonGreen text-neonGreen text-xs font-bold px-4 py-3 rounded-xl"></div>

    <!-- SECCIÓN 1: FOTO DE PERFIL Y AVATARES PROGRAMADOS -->
    <div class="bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-5 shadow-panel">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-crtBorder pb-4">
        <div class="flex items-center gap-4">
          ${getOperatorAvatarHTML('w-16 h-16 text-3xl')}
          <div>
            <h3 class="text-lg font-bold text-white">1. Foto de Perfil &amp; Avatares Programados</h3>
            <p class="text-xs text-slate-400">
              Elige uno de los 8 avatares tácticos pre-programados o sube una foto desde tu computador.
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="cursor-pointer px-3.5 py-2 rounded-lg bg-neonCyan text-black font-bold text-xs hover:bg-neonCyan/90 transition-all">
            📷 Subir Foto desde mi PC
            <input id="settings-avatar-file" type="file" accept="image/*" class="hidden" />
          </label>
          ${
            settings.customAvatarUrl
              ? `<button id="btn-clear-custom-avatar" type="button" class="px-3 py-2 rounded-lg bg-neonRed/20 text-neonRed border border-neonRed/40 font-bold text-xs">
                   Restaurar Avatar Programado
                 </button>`
              : ''
          }
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        ${avatarsHTML}
      </div>
    </div>

    <!-- SECCIÓN 2: SENSIBILIDAD, DISEÑO DE PÁGINA Y ACCESIBILIDAD -->
    <div class="bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-5 shadow-panel">
      <div>
        <h3 class="text-lg font-bold text-white">2. Sensibilidad, Diseño Visual y Audio</h3>
        <p class="text-xs text-slate-400">
          Ajusta la intensidad de las líneas CRT, el tamaño de letra de la terminal, el volumen maestro y la sensibilidad del reloj en la Panic Arena.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Intensidad Monitor CRT -->
        <div class="bg-black/70 border border-crtBorder rounded-xl p-4 space-y-2">
          <label class="block text-xs font-bold text-neonGreen uppercase">Efecto Scanlines CRT</label>
          <select id="setting-crt-intensity" class="w-full bg-crtPanel border border-crtBorder rounded px-3 py-2 text-xs text-white focus:outline-none">
            <option value="high" ${settings.crtIntensity === 'high' ? 'selected' : ''}>Alta (Retro Cyberpunk 100%)</option>
            <option value="low" ${settings.crtIntensity === 'low' ? 'selected' : ''}>Suave (Descanso Visual 35%)</option>
            <option value="off" ${settings.crtIntensity === 'off' ? 'selected' : ''}>Apagado (Pantalla Limpia HD)</option>
          </select>
        </div>

        <!-- Tamaño de Fuente de Consola -->
        <div class="bg-black/70 border border-crtBorder rounded-xl p-4 space-y-2">
          <label class="block text-xs font-bold text-neonCyan uppercase">Tamaño Fuente Terminal</label>
          <select id="setting-font-size" class="w-full bg-crtPanel border border-crtBorder rounded px-3 py-2 text-xs text-white focus:outline-none">
            <option value="sm" ${settings.terminalFontSize === 'sm' ? 'selected' : ''}>Compacta (12px Hacker)</option>
            <option value="md" ${settings.terminalFontSize === 'md' ? 'selected' : ''}>Estándar (14px Equilibrada)</option>
            <option value="lg" ${settings.terminalFontSize === 'lg' ? 'selected' : ''}>Grande (16px Alta Lectura)</option>
          </select>
        </div>

        <!-- Sensibilidad del Temporizador en Arena -->
        <div class="bg-black/70 border border-crtBorder rounded-xl p-4 space-y-2">
          <label class="block text-xs font-bold text-neonAmber uppercase">Sensibilidad Reloj Arena</label>
          <select id="setting-timer-sens" class="w-full bg-crtPanel border border-crtBorder rounded px-3 py-2 text-xs text-white focus:outline-none">
            <option value="relaxed" ${settings.timerSensitivity === 'relaxed' ? 'selected' : ''}>Accesible (22 seg por reto)</option>
            <option value="normal" ${settings.timerSensitivity === 'normal' ? 'selected' : ''}>Oficial SLA (15 seg por reto)</option>
            <option value="hardcore" ${settings.timerSensitivity === 'hardcore' ? 'selected' : ''}>Hardcore Velocidad (10 seg)</option>
          </select>
        </div>

        <!-- Volumen Maestro de Efectos -->
        <div class="bg-black/70 border border-crtBorder rounded-xl p-4 space-y-2">
          <div class="flex justify-between text-xs font-bold">
            <span class="text-white uppercase">Volumen Acústico</span>
            <span id="setting-volume-label" class="text-neonGreen">${settings.audioVolume ?? 85}%</span>
          </div>
          <input
            id="setting-audio-volume"
            type="range"
            min="0"
            max="100"
            value="${settings.audioVolume ?? 85}"
            class="w-full accent-emerald-400 cursor-pointer"
          />
        </div>
      </div>
    </div>

    <!-- SECCIÓN 3: TIENDA DE TEMAS Y SWITCHES MECÁNICOS (CANJEANDO XP - IDEA #5) -->
    <div class="bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-5 shadow-panel">
      <div>
        <h3 class="text-lg font-bold text-white">3. Tienda de Personalización de Consola (Canjea tu XP)</h3>
        <p class="text-xs text-slate-400">
          Usa la experiencia ganada en las lecciones para desbloquear nuevos temas de color para toda la página y sonidos mecánicos de teclado.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        ${themesShopHTML}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        ${soundProfilesHTML}
      </div>
    </div>

    ${SHOW_SECURITY_PANEL_IN_SETTINGS ? `<!-- SECCIÓN 4 (DESACTIVADA PARA CLIENTES): la seguridad 2FA, privacidad y auditoría funcionan automáticamente -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Verificación 2FA para Cuenta con Plan de Pago -->
      <div class="lg:col-span-6 bg-crtPanel border-2 ${
        isPro ? 'border-neonGreen shadow-neon-green' : 'border-neonAmber/60'
      } rounded-2xl p-6 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded ${
            sec.verified
              ? 'bg-neonGreen/20 text-neonGreen border border-neonGreen/40'
              : 'bg-neonAmber/20 text-neonAmber border border-neonAmber/40'
          }">
            ${
              sec.verified
                ? '🛡️ CUENTA DE PAGO VERIFICADA CON 2FA & PIN'
                : isPro
                ? '⚠️ VERIFICACIÓN 2FA PENDIENTE DE ACTIVAR'
                : '🔒 EXCLUSIVO PARA CUENTAS CON PLAN DE PAGO'
            }
          </span>
          <span class="text-xs font-mono text-neonCyan">${escapeHTML(sec.licenseToken || 'SIN-LICENCIA-PRO')}</span>
        </div>

        <h3 class="text-lg font-bold text-white">
          4. Blindaje y Verificación 2FA de Cuenta de Pago
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          Para tu total tranquilidad al adquirir una licencia <strong>Pro Operator</strong> o <strong>Cyber Squad</strong>, vinculamos criptográficamente tu suscripción a tu documento y activamos un <strong>PIN de Seguridad de Operador + Código OTP 2FA</strong>.
        </p>

        ${
          !isPro
            ? `<div class="bg-black/70 border border-crtBorder rounded-xl p-4 flex items-center justify-between">
                 <span class="text-xs text-slate-400">Adquiere un plan PRO o SQUAD para recibir tu Token de Licencia firmado y activar 2FA.</span>
                 <button id="btn-settings-upgrade" type="button" class="px-4 py-2 rounded bg-neonAmber text-black font-bold text-xs shrink-0">
                   Ver Planes PRO &rarr;
                 </button>
               </div>`
            : `<form id="form-verify-pro-2fa" class="bg-black/70 border border-crtBorder rounded-xl p-4 space-y-3" autocomplete="off">
                 <div class="flex items-center justify-between text-xs">
                   <span class="text-slate-400">Tu Código OTP 2FA de Activación:</span>
                   <code class="px-2.5 py-1 rounded bg-neonCyan/15 text-neonCyan border border-neonCyan/40 font-bold text-sm tracking-widest">${escapeHTML(
                     sec.verificationOtp || '202600'
                   )}</code>
                 </div>
                 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div>
                     <label class="block text-[11px] text-slate-400 uppercase mb-1">Ingresa el Código OTP 2FA</label>
                     <input
                       id="input-pro-otp"
                       type="text"
                       required
                       value="${escapeHTML(sec.verificationOtp || '202600')}"
                       class="w-full bg-crtPanel border border-crtBorder focus:border-neonCyan rounded px-3 py-2 text-xs text-white font-mono tracking-widest focus:outline-none"
                     />
                   </div>
                   <div>
                     <label class="block text-[11px] text-slate-400 uppercase mb-1">Define tu PIN de Seguridad (4 a 6 dígitos)</label>
                     <input
                       id="input-pro-pin"
                       type="password"
                       required
                       maxlength="6"
                       placeholder="Ej: 849201"
                       class="w-full bg-crtPanel border border-crtBorder focus:border-neonGreen rounded px-3 py-2 text-xs text-white font-mono tracking-widest focus:outline-none"
                     />
                   </div>
                 </div>
                 <button type="submit" class="w-full py-2.5 rounded-lg bg-neonGreen text-black font-bold text-xs uppercase tracking-wider hover:bg-neonGreen/90 transition-all">
                   ${sec.verified ? '🔄 Actualizar PIN y Re-Verificar Licencia PRO' : '🛡️ Verificar Cuenta de Pago Ahora'}
                 </button>
                 <div id="pro-2fa-feedback" class="text-xs font-mono">
                   ${
                     sec.verified
                       ? `<span class="text-neonGreen font-bold">✔ Licencia ${escapeHTML(sec.licenseToken)} verificada el ${escapeHTML(sec.verifiedAt)}.</span>`
                       : ''
                   }
                 </div>
               </form>`
        }
      </div>

      <!-- Privacidad de Datos (Habeas Data) & Bitácora Anti-Hackeo -->
      <div class="lg:col-span-6 bg-crtPanel border border-crtBorder rounded-2xl p-6 space-y-4 shadow-panel">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-white">5. Escudo de Privacidad &amp; Auditoría Anti-Hackeo</h3>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded bg-neonGreen/15 text-neonGreen border border-neonGreen/40">
            🔒 SHA/HMAC + CSP ACTIVO
          </span>
        </div>

        <div class="bg-black/70 border border-crtBorder rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div class="text-xs font-bold text-white">Modo Escudo de Privacidad (Habeas Data Ley 1581)</div>
            <p class="text-[11px] text-slate-400 mt-0.5">
              Oculta parcialmente tu número de documento, teléfono y correo en pantalla (<code class="text-neonCyan">CC 10••••12</code>) para proteger tu identidad si compartes pantalla.
            </p>
          </div>
          <button
            id="btn-toggle-privacy"
            type="button"
            class="px-4 py-2 rounded-lg font-bold text-xs shrink-0 transition-all ${
              settings.privacyMode
                ? 'bg-neonGreen text-black shadow-neon-green'
                : 'bg-black border border-crtBorder text-slate-300 hover:border-neonGreen'
            }"
          >
            ${settings.privacyMode ? '🛡️ Enmascarado ACTIVO' : 'Activar Escudo PII'}
          </button>
        </div>

        <div class="bg-black/80 border border-crtBorder rounded-xl p-4 space-y-2">
          <div class="text-[11px] font-bold uppercase tracking-wider text-neonCyan">
            📡 Bitácora de Auditoría Criptográfica en Tiempo Real:
          </div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            ${auditLogsHTML}
          </div>
        </div>
      </div>
    </div>` : ''}
  `;

  // Eventos de selección de Avatar programado
  container.querySelectorAll('[data-pick-avatar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const avatarId = btn.getAttribute('data-pick-avatar');
      updateOperatorSettings({ avatarId, customAvatarUrl: '' });
      SoundFX.playSuccess();
      updateHUD();
      renderSettingsAndShop(callbacks);
    });
  });

  // Subida de foto de perfil desde el PC del usuario (FileReader Base64 seguro)
  const fileInput = document.getElementById('settings-avatar-file');
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      updateOperatorSettings({ customAvatarUrl: dataUrl });
      SoundFX.playLevelUp();
      updateHUD();
      renderSettingsAndShop(callbacks);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-clear-custom-avatar')?.addEventListener('click', () => {
    updateOperatorSettings({ customAvatarUrl: '' });
    SoundFX.playKey();
    updateHUD();
    renderSettingsAndShop(callbacks);
  });

  // Eventos de Sensibilidad y Diseño Visual
  document.getElementById('setting-crt-intensity')?.addEventListener('change', (e) => {
    updateOperatorSettings({ crtIntensity: e.target.value });
    applyVisualSettingsToDOM();
    SoundFX.playKey();
  });

  document.getElementById('setting-font-size')?.addEventListener('change', (e) => {
    updateOperatorSettings({ terminalFontSize: e.target.value });
    applyVisualSettingsToDOM();
    SoundFX.playKey();
  });

  document.getElementById('setting-timer-sens')?.addEventListener('change', (e) => {
    updateOperatorSettings({ timerSensitivity: e.target.value });
    SoundFX.playSuccess();
  });

  const volInput = document.getElementById('setting-audio-volume');
  const volLabel = document.getElementById('setting-volume-label');
  volInput?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if (volLabel) volLabel.textContent = `${val}%`;
    updateOperatorSettings({ audioVolume: val });
    SoundFX.playKey();
  });

  // Eventos de Tienda XP: Temas Visuales
  container.querySelectorAll('[data-shop-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-shop-theme');
      const costXP = Number(btn.getAttribute('data-shop-cost') || 0);
      const res = unlockShopItemWithXP({ itemType: 'theme', itemId, costXP });
      const toast = document.getElementById('settings-feedback-toast');

      if (!res.ok) {
        SoundFX.playError();
        if (toast) {
          toast.className = 'bg-neonRed/15 border border-neonRed text-neonRed text-xs font-bold px-4 py-3 rounded-xl';
          toast.textContent = `✖ ${res.error}`;
          toast.classList.remove('hidden');
        }
        return;
      }

      SoundFX.playLevelUp();
      updateHUD();
      renderSettingsAndShop(callbacks);
    });
  });

  // Eventos de Tienda XP: Switches de Sonido
  container.querySelectorAll('[data-shop-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-shop-sound');
      const costXP = Number(btn.getAttribute('data-shop-cost') || 0);
      const res = unlockShopItemWithXP({ itemType: 'sound', itemId, costXP });
      const toast = document.getElementById('settings-feedback-toast');

      if (!res.ok) {
        SoundFX.playError();
        if (toast) {
          toast.className = 'bg-neonRed/15 border border-neonRed text-neonRed text-xs font-bold px-4 py-3 rounded-xl';
          toast.textContent = `✖ ${res.error}`;
          toast.classList.remove('hidden');
        }
        return;
      }

      SoundFX.playKey();
      updateHUD();
      renderSettingsAndShop(callbacks);
    });
  });

  // Toggle Modo Privacidad Habeas Data
  document.getElementById('btn-toggle-privacy')?.addEventListener('click', () => {
    updateOperatorSettings({ privacyMode: !settings.privacyMode });
    SoundFX.playSuccess();
    renderSettingsAndShop(callbacks);
  });

  document.getElementById('btn-settings-upgrade')?.addEventListener('click', () => {
    if (callbacks?.onOpenPricing) callbacks.onOpenPricing();
  });

  // Formulario de Verificación 2FA para Cuentas de Pago
  const form2fa = document.getElementById('form-verify-pro-2fa');
  form2fa?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputOtp = document.getElementById('input-pro-otp')?.value;
    const newPin = document.getElementById('input-pro-pin')?.value;
    const fb = document.getElementById('pro-2fa-feedback');

    const res = verifyProAccountSecurity({ inputOtp, newPin });
    if (!res.ok) {
      SoundFX.playError();
      if (fb) {
        fb.innerHTML = `<span class="text-neonRed font-bold">✖ ${escapeHTML(res.error)}</span>`;
      }
      return;
    }

    SoundFX.playLevelUp();
    updateHUD();
    renderSettingsAndShop(callbacks);
  });
}

/**
 * Renderiza el Buzón de Opinión y Feedback de los Clientes (#view-feedback)
 * Permite calificar con estrellas, ingresar sugerencias, registrar en el backend y
 * abrir Gmail pre-llenado con destino al correo del administrador.
 */
export async function renderFeedbackView() {
  const state = getState();
  const nameInput = document.getElementById('feedback-input-name');
  const emailInput = document.getElementById('feedback-input-email');
  const targetEmailDisplay = document.getElementById('feedback-target-email-display');
  const starPicker = document.getElementById('feedback-star-picker');
  const ratingLabel = document.getElementById('feedback-rating-label');
  const ratingVal = document.getElementById('feedback-rating-val');
  const feedbackForm = document.getElementById('form-client-feedback');
  const btnGmail = document.getElementById('btn-feedback-gmail-direct');
  const successBanner = document.getElementById('feedback-success-banner');
  const communityList = document.getElementById('feedback-community-list');

  // Autocompletar datos del usuario si ha iniciado sesión
  if (state.user) {
    if (nameInput && !nameInput.value) nameInput.value = state.user.name || '';
    if (emailInput && !emailInput.value) emailInput.value = state.user.email || '';
  }

  // Cargar correo configurado del administrador
  try {
    const adminEmail = await getTargetAdminEmail();
    if (targetEmailDisplay) targetEmailDisplay.textContent = adminEmail;
  } catch (err) {
    console.error('Error cargando correo de admin:', err);
  }

  // Escala interactiva de 5 estrellas
  const ratingTexts = {
    1: '1 de 5 estrellas — Muy insatisfecho, requiere mejoras',
    2: '2 de 5 estrellas — Regular, faltan funciones',
    3: '3 de 5 estrellas — Buena plataforma, con potencial',
    4: '4 de 5 estrellas — Muy buena experiencia y contenido',
    5: '5 de 5 estrellas — ¡Excelente plataforma, la recomiendo!'
  };

  const updateStars = (val) => {
    if (ratingVal) ratingVal.value = val;
    if (ratingLabel) ratingLabel.textContent = ratingTexts[val] || `${val} de 5 estrellas`;
    if (starPicker) {
      starPicker.querySelectorAll('[data-star]').forEach((s) => {
        const starNum = Number(s.getAttribute('data-star'));
        if (starNum <= val) {
          s.classList.remove('text-slate-600');
          s.classList.add('text-neonAmber');
          s.textContent = '★';
        } else {
          s.classList.remove('text-neonAmber');
          s.classList.add('text-slate-600');
          s.textContent = '☆';
        }
      });
    }
  };

  if (starPicker && !starPicker.dataset.initialized) {
    starPicker.dataset.initialized = 'true';
    starPicker.querySelectorAll('[data-star]').forEach((starEl) => {
      starEl.addEventListener('click', () => {
        const num = Number(starEl.getAttribute('data-star') || 5);
        updateStars(num);
        SoundFX.playKey();
      });
    });
  }

  // Evento de Envío del Formulario
  if (feedbackForm && !feedbackForm.dataset.initialized) {
    feedbackForm.dataset.initialized = 'true';

    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-feedback-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳</span><span>Registrando y preparando envío...</span>`;
      }

      const name = nameInput?.value.trim() || 'Estudiante';
      const email = emailInput?.value.trim() || '';
      const rating = Number(ratingVal?.value || 5);
      const category = document.getElementById('feedback-input-category')?.value || 'Experiencia General';
      const message = document.getElementById('feedback-input-message')?.value.trim() || '';

      try {
        await processClientFeedback({
          name,
          email,
          rating,
          category,
          message,
          openEmailClient: true
        });

        SoundFX.playSuccess();
        if (successBanner) {
          successBanner.classList.remove('hidden');
          successBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        feedbackForm.reset();
        updateStars(5);
        if (state.user) {
          if (nameInput) nameInput.value = state.user.name || '';
          if (emailInput) emailInput.value = state.user.email || '';
        }
        await loadCommunityList();
      } catch (err) {
        SoundFX.playError();
        alert('Hubo un inconveniente al registrar la opinión. Se abrirá tu cliente de correo.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>📨</span><span>Enviar Opinión &amp; Notificar al Correo</span>`;
        }
      }
    });

    if (btnGmail) {
      btnGmail.addEventListener('click', () => {
        const name = nameInput?.value.trim() || 'Estudiante';
        const email = emailInput?.value.trim() || '';
        const rating = Number(ratingVal?.value || 5);
        const category = document.getElementById('feedback-input-category')?.value || 'Experiencia General';
        const message = document.getElementById('feedback-input-message')?.value.trim() || 'Hola Administrador de ShellDojo, quiero dejar la siguiente sugerencia...';

        const links = buildMailtoLinks({
          name,
          email,
          rating,
          category,
          message,
          adminEmail: targetEmailDisplay?.textContent || 'admin@shelldojo.io'
        });

        window.open(links.gmailWebUrl, '_blank');
      });
    }
  }

  // Carga y renderizado dinámico de opiniones públicas
  async function loadCommunityList() {
    if (!communityList) return;
    try {
      const list = await fetchPublicFeedback();
      if (!list || list.length === 0) {
        communityList.innerHTML = `
          <div class="col-span-full bg-black/40 border border-crtBorder/60 rounded-lg p-4 text-center text-slate-400">
            Aún no hay opiniones visibles. ¡Sé el primero en dejar tu reseña sobre la plataforma!
          </div>
        `;
        return;
      }

      communityList.innerHTML = list.map((item) => {
        const stars = '★'.repeat(item.rating || 5) + '☆'.repeat(5 - (item.rating || 5));
        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : 'Reciente';
        return `
          <div class="bg-black/60 border border-crtBorder rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-bold text-white text-xs">${escapeHTML(item.name || 'Estudiante')}</span>
                <span class="text-neonAmber font-mono text-sm">${stars}</span>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded bg-neonCyan/10 text-neonCyan border border-neonCyan/30 font-bold inline-block mb-1.5">
                ${escapeHTML(item.category || 'General')}
              </span>
              <p class="text-slate-300 text-xs italic leading-relaxed">
                "${escapeHTML(item.message || '')}"
              </p>
            </div>
            <div class="pt-2 border-t border-crtBorder/50 flex items-center justify-between text-[10px] text-slate-500">
              <span>Verificado ShellDojo</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Error cargando feedback de la comunidad:', err);
    }
  }

  await loadCommunityList();
}
