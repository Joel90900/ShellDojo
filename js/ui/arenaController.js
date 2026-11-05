/**
 * SHELLDOJO - CONTROLADOR DEL MODO ARENA (BATALLA CONTRARRELOJ 15s & POST-MORTEM)
 * Maneja las 3 vidas (nodos de servidor), el temporizador de 15s con pitidos en <5s,
 * los comodines de pista, el registro de errores y la tarjeta compartible estilo Wordle.
 */

import { CURRICULUM_DATA } from '../data/curriculum.js';
import { validateCommand } from '../core/validator.js';
import { addXP, recordArenaScore, getState } from '../core/state.js';
import { SoundFX } from '../core/audio.js';
import { updateHUD } from './renderer.js';

const MAX_LIVES = 3;
const QUESTION_TIME_LIMIT = 15.0;

function getQuestionTimeLimit() {
  const sens = getState().settings?.timerSensitivity || 'normal';
  if (sens === 'relaxed') return 22.0;
  if (sens === 'hardcore') return 10.0;
  return QUESTION_TIME_LIMIT;
}

let arenaState = {
  modeId: 'git',
  modeName: 'Examen Intensivo',
  challenges: [],
  currentIndex: 0,
  lives: MAX_LIVES,
  score: 0,
  combo: 1,
  maxCombo: 1,
  timeLeft: QUESTION_TIME_LIMIT,
  timerInterval: null,
  lastBeepSecond: null,
  hintUsedInCurrent: false,
  resultsEmoji: [],
  mistakesLog: []
};

let arenaCallbacks = null;

/**
 * Inicializa los eventos del Modo Arena.
 */
export function initArenaController(callbacks) {
  arenaCallbacks = callbacks;

  const form = document.getElementById('arena-command-form');
  const input = document.getElementById('arena-command-input');
  const hintBtn = document.getElementById('btn-arena-hint');
  const retryBtn = document.getElementById('btn-pm-retry');
  const academyBtn = document.getElementById('btn-pm-academy');
  const shareBtn = document.getElementById('btn-pm-share');
  const certBtn = document.getElementById('btn-pm-certificate');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleArenaSubmit();
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key.length === 1) {
        SoundFX.playKey();
      }
    });
  }

  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      useArenaHint();
      if (input) input.focus();
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      startArenaSession(arenaState.modeId);
    });
  }

  if (academyBtn) {
    academyBtn.addEventListener('click', () => {
      stopArenaTimer();
      if (arenaCallbacks?.onBackToAcademy) {
        arenaCallbacks.onBackToAcademy();
      }
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      copyWordleResultToClipboard();
    });
  }

  if (certBtn) {
    certBtn.addEventListener('click', () => {
      if (arenaCallbacks?.onClaimCertificate) {
        arenaCallbacks.onClaimCertificate(arenaState.modeName);
      }
    });
  }

  const startNowBtn = document.getElementById('btn-arena-start-now');
  if (startNowBtn) {
    startNowBtn.addEventListener('click', () => {
      SoundFX.playSuccess();
      const introBox = document.getElementById('arena-intro-box');
      const hudBox = document.getElementById('arena-hud-box');
      const battleBox = document.getElementById('arena-battle-box');
      const pmBox = document.getElementById('arena-postmortem-box');

      if (introBox) introBox.classList.add('hidden');
      if (pmBox) pmBox.classList.add('hidden');
      if (hudBox) hudBox.classList.remove('hidden');
      if (battleBox) battleBox.classList.remove('hidden');

      renderArenaHeader();
      loadCurrentArenaChallenge();
    });
  }
}

/**
 * Detiene el reloj de la Arena.
 */
export function stopArenaTimer() {
  if (arenaState.timerInterval) {
    clearInterval(arenaState.timerInterval);
    arenaState.timerInterval = null;
  }
}

/**
 * Prepara la partida en la Panic Arena mostrando primero el Anuncio de Reglas del Juego
 * sin iniciar el temporizador hasta que el jugador presione "¡Entendido, Empezar Partida Ahora!".
 */
export function startArenaSession(trackIdOrGlobal = 'global') {
  stopArenaTimer();

  const currentPlan = getState().plan || 'free';
  let pool = [];
  let title = 'Modo Supervivencia Global';

  if (trackIdOrGlobal === 'global') {
    const allowedTracks = CURRICULUM_DATA.filter((track) => {
      if (currentPlan === 'free') return track.tier === 'free';
      if (currentPlan === 'pro') return track.tier === 'free' || track.tier === 'pro';
      return true;
    });
    allowedTracks.forEach((track) => {
      pool.push(...track.examChallenges);
    });
    pool = shuffleArray(pool).slice(0, 8);
  } else {
    const foundTrack = CURRICULUM_DATA.find((t) => t.id === trackIdOrGlobal) || CURRICULUM_DATA[0];
    pool = [...foundTrack.examChallenges];
    title = `Examen Intensivo // ${foundTrack.title}`;
  }

  const maxTime = getQuestionTimeLimit();

  arenaState = {
    modeId: trackIdOrGlobal,
    modeName: title,
    challenges: pool,
    currentIndex: 0,
    lives: MAX_LIVES,
    score: 0,
    combo: 1,
    maxCombo: 1,
    timeLeft: maxTime,
    timerInterval: null,
    lastBeepSecond: null,
    hintUsedInCurrent: false,
    resultsEmoji: [],
    mistakesLog: []
  };

  const introBox = document.getElementById('arena-intro-box');
  const introTitle = document.getElementById('arena-intro-title');
  const introTimeBadge = document.getElementById('arena-intro-time-badge');
  const hudBox = document.getElementById('arena-hud-box');
  const battleBox = document.getElementById('arena-battle-box');
  const pmBox = document.getElementById('arena-postmortem-box');
  const feedbackEl = document.getElementById('arena-last-feedback');

  if (introTitle) introTitle.textContent = `Reglas del Juego: ${title}`;
  if (introTimeBadge) introTimeBadge.textContent = `${maxTime.toFixed(1)}s`;

  if (introBox) introBox.classList.remove('hidden');
  if (hudBox) hudBox.classList.add('hidden');
  if (battleBox) battleBox.classList.add('hidden');
  if (pmBox) pmBox.classList.add('hidden');
  if (feedbackEl) feedbackEl.textContent = '';
}

/**
 * Carga la emergencia actual y arranca la cuenta regresiva de 15 segundos.
 */
function loadCurrentArenaChallenge() {
  const challenge = arenaState.challenges[arenaState.currentIndex];
  if (!challenge) {
    finishArenaSession();
    return;
  }

  arenaState.timeLeft = getQuestionTimeLimit();
  arenaState.lastBeepSecond = null;
  arenaState.hintUsedInCurrent = false;

  const trackNameEl = document.getElementById('arena-track-name');
  const progressEl = document.getElementById('arena-question-progress');
  const scenarioEl = document.getElementById('arena-scenario-prompt');
  const promptPrefixEl = document.getElementById('arena-prompt-prefix');
  const hintDisplayEl = document.getElementById('arena-hint-display');
  const input = document.getElementById('arena-command-input');

  if (trackNameEl) trackNameEl.textContent = arenaState.modeName;
  if (progressEl) {
    progressEl.textContent = `EMERGENCIA ${arenaState.currentIndex + 1} / ${arenaState.challenges.length}`;
  }
  if (scenarioEl) scenarioEl.textContent = challenge.scenario;
  if (promptPrefixEl) promptPrefixEl.textContent = challenge.prompt;
  if (hintDisplayEl) {
    hintDisplayEl.textContent = '';
    hintDisplayEl.classList.add('hidden');
  }
  if (input) {
    input.value = '';
    input.focus();
  }

  updateTimerUI();
  startCountdownLoop();
}

/**
 * Ejecuta el bucle de 100ms para actualizar la barra de tiempo de forma fluida.
 */
function startCountdownLoop() {
  stopArenaTimer();

  arenaState.timerInterval = setInterval(() => {
    arenaState.timeLeft = Math.max(0, +(arenaState.timeLeft - 0.1).toFixed(1));
    updateTimerUI();

    const ceilSec = Math.ceil(arenaState.timeLeft);
    if (ceilSec <= 5 && ceilSec > 0 && arenaState.lastBeepSecond !== ceilSec) {
      arenaState.lastBeepSecond = ceilSec;
      SoundFX.playTick();
    }

    if (arenaState.timeLeft <= 0) {
      stopArenaTimer();
      handleArenaTimeout();
    }
  }, 100);
}

/**
 * Actualiza visualmente la barra de tiempo cambiando de verde a ámbar y rojo.
 */
function updateTimerUI() {
  const bar = document.getElementById('arena-timer-bar');
  const text = document.getElementById('arena-timer-text');
  if (!bar || !text) return;

  const maxTime = getQuestionTimeLimit();
  const pct = Math.max(0, (arenaState.timeLeft / maxTime) * 100);
  bar.style.width = `${pct}%`;
  text.textContent = `${arenaState.timeLeft.toFixed(1)}s`;

  bar.classList.remove('bg-neonGreen', 'bg-neonAmber', 'bg-neonRed');
  text.classList.remove('text-neonGreen', 'text-neonAmber', 'text-neonRed');

  if (arenaState.timeLeft > 8) {
    bar.classList.add('bg-neonGreen');
    text.classList.add('text-neonGreen');
  } else if (arenaState.timeLeft > 4) {
    bar.classList.add('bg-neonAmber');
    text.classList.add('text-neonAmber');
  } else {
    bar.classList.add('bg-neonRed');
    text.classList.add('text-neonRed');
  }
}

/**
 * Renderiza los 3 nodos de servidor (vidas), el combo y el puntaje.
 */
function renderArenaHeader() {
  const livesBox = document.getElementById('arena-lives-container');
  const comboEl = document.getElementById('arena-combo');
  const scoreEl = document.getElementById('arena-score');

  if (livesBox) {
    let nodesHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      const alive = i < arenaState.lives;
      nodesHTML += `
        <span class="px-2 py-0.5 rounded text-xs font-bold border ${
          alive
            ? 'bg-neonGreen/20 text-neonGreen border-neonGreen shadow-neon-green'
            : 'bg-neonRed/10 text-neonRed/40 border-neonRed/30 line-through'
        }">
          SRV-0${i + 1}
        </span>
      `;
    }
    livesBox.innerHTML = nodesHTML;
  }

  if (comboEl) comboEl.textContent = `x${arenaState.combo}`;
  if (scoreEl) scoreEl.textContent = String(arenaState.score).padStart(4, '0');
}

/**
 * Muestra la pista táctica del reto actual restando puntos sin revelar la respuesta.
 */
function useArenaHint() {
  const challenge = arenaState.challenges[arenaState.currentIndex];
  if (!challenge || arenaState.hintUsedInCurrent) return;

  arenaState.hintUsedInCurrent = true;
  arenaState.score = Math.max(0, arenaState.score - 35);
  renderArenaHeader();

  const hintDisplayEl = document.getElementById('arena-hint-display');
  if (hintDisplayEl) {
    hintDisplayEl.textContent = `Pista Táctica: ${challenge.hint}`;
    hintDisplayEl.classList.remove('hidden');
  }
}

/**
 * Valida el comando ingresado por el jugador bajo presión.
 */
function handleArenaSubmit() {
  const challenge = arenaState.challenges[arenaState.currentIndex];
  const input = document.getElementById('arena-command-input');
  const battleBox = document.getElementById('arena-battle-box');
  const feedbackEl = document.getElementById('arena-last-feedback');

  if (!challenge || !input) return;
  const userTyped = input.value.trim();
  if (!userTyped) return;

  const isCorrect = validateCommand(userTyped, challenge.validCommands);

  if (isCorrect) {
    stopArenaTimer();
    SoundFX.playSuccess();

    const timeBonus = Math.round(arenaState.timeLeft * 10);
    const pointsEarned = (100 + timeBonus) * arenaState.combo;
    arenaState.score += pointsEarned;
    arenaState.combo += 1;
    arenaState.maxCombo = Math.max(arenaState.maxCombo, arenaState.combo);
    arenaState.resultsEmoji.push('🟢');

    if (feedbackEl) {
      feedbackEl.className = 'text-xs font-mono text-neonGreen font-bold';
      feedbackEl.textContent = `✔ INCIDENTE RESUELTO (+${pointsEarned} PTS) — Ejecutado: ${userTyped}`;
    }

    renderArenaHeader();
    advanceNextChallenge();
  } else {
    SoundFX.playError();
    arenaState.lives -= 1;
    arenaState.combo = 1;
    arenaState.resultsEmoji.push('🔴');

    arenaState.mistakesLog.push({
      scenario: challenge.scenario,
      userTyped,
      correctCommand: challenge.validCommands[0],
      explanation: challenge.explanation
    });

    if (battleBox) {
      battleBox.classList.remove('shake-error');
      void battleBox.offsetWidth;
      battleBox.classList.add('shake-error');
    }

    if (feedbackEl) {
      feedbackEl.className = 'text-xs font-mono text-neonRed font-bold';
      feedbackEl.textContent = `✖ COMANDO INVÁLIDO: "${userTyped}". Nodo perdido. Solución esperada: ${challenge.validCommands[0]}`;
    }

    renderArenaHeader();

    if (arenaState.lives <= 0) {
      stopArenaTimer();
      finishArenaSession();
    } else {
      stopArenaTimer();
      advanceNextChallenge();
    }
  }
}

/**
 * Se dispara cuando el reloj llega a 0.0s.
 */
function handleArenaTimeout() {
  const challenge = arenaState.challenges[arenaState.currentIndex];
  const feedbackEl = document.getElementById('arena-last-feedback');

  SoundFX.playError();
  arenaState.lives -= 1;
  arenaState.combo = 1;
  arenaState.resultsEmoji.push('🔴');

  if (challenge) {
    arenaState.mistakesLog.push({
      scenario: challenge.scenario,
      userTyped: '[TIEMPO AGOTADO - SLA EXPIRADO]',
      correctCommand: challenge.validCommands[0],
      explanation: challenge.explanation
    });
  }

  if (feedbackEl && challenge) {
    feedbackEl.className = 'text-xs font-mono text-neonRed font-bold';
    feedbackEl.textContent = `⏰ TIEMPO AGOTADO. Nodo caído. El comando de rescate era: ${challenge.validCommands[0]}`;
  }

  renderArenaHeader();

  if (arenaState.lives <= 0) {
    finishArenaSession();
  } else {
    advanceNextChallenge();
  }
}

function advanceNextChallenge() {
  arenaState.currentIndex += 1;
  if (arenaState.currentIndex >= arenaState.challenges.length) {
    finishArenaSession();
  } else {
    loadCurrentArenaChallenge();
  }
}

/**
 * Construye la Pantalla Post-Mortem al ganar o perder las 3 vidas.
 */
function finishArenaSession() {
  stopArenaTimer();

  const survived = arenaState.lives > 0;
  if (survived) {
    SoundFX.playLevelUp();
  }

  const xpEarned = Math.max(25, Math.round(arenaState.score / 5));
  addXP(xpEarned);
  recordArenaScore(arenaState.modeId, arenaState.score);
  updateHUD();

  if (arenaCallbacks?.onArenaCompleted) {
    arenaCallbacks.onArenaCompleted();
  }

  const battleBox = document.getElementById('arena-battle-box');
  const pmBox = document.getElementById('arena-postmortem-box');
  if (battleBox) battleBox.classList.add('hidden');
  if (pmBox) pmBox.classList.remove('hidden');

  const badgeEl = document.getElementById('pm-status-badge');
  const titleEl = document.getElementById('pm-title');
  const subtitleEl = document.getElementById('pm-subtitle');
  const scoreEl = document.getElementById('pm-final-score');
  const comboEl = document.getElementById('pm-max-combo');
  const accEl = document.getElementById('pm-accuracy');
  const emojiStripEl = document.getElementById('pm-emoji-strip');
  const mistakesListEl = document.getElementById('pm-mistakes-list');

  const totalAttempted = arenaState.resultsEmoji.length;
  const greens = arenaState.resultsEmoji.filter((e) => e === '🟢').length;
  const accuracy = totalAttempted > 0 ? Math.round((greens / totalAttempted) * 100) : 0;

  if (badgeEl) {
    badgeEl.textContent = survived ? '✅ SISTEMA ESTABILIZADO (VICTORIA)' : '🚨 CAÍDA TOTAL DE NODOS (GAME OVER)';
    badgeEl.className = survived
      ? 'text-xs font-bold uppercase px-2.5 py-1 rounded bg-neonGreen/20 text-neonGreen border border-neonGreen/40'
      : 'text-xs font-bold uppercase px-2.5 py-1 rounded bg-neonRed/20 text-neonRed border border-neonRed/40';
  }

  if (titleEl) {
    titleEl.textContent = survived
      ? `¡Emergencia Controlada! (+${xpEarned} XP)`
      : `Colapso en Producción (+${xpEarned} XP de consolación)`;
  }

  if (subtitleEl) {
    subtitleEl.textContent = `${arenaState.modeName} • Nodos restantes: ${arenaState.lives}/${MAX_LIVES}`;
  }

  if (scoreEl) scoreEl.textContent = arenaState.score.toLocaleString();
  if (comboEl) comboEl.textContent = `x${arenaState.maxCombo}`;
  if (accEl) accEl.textContent = `${accuracy}%`;
  if (emojiStripEl) emojiStripEl.textContent = arenaState.resultsEmoji.join('');

  if (mistakesListEl) {
    if (arenaState.mistakesLog.length === 0) {
      mistakesListEl.innerHTML = `
        <div class="p-4 rounded bg-neonGreen/10 border border-neonGreen/40 text-neonGreen text-xs font-semibold">
          🏆 ¡Ejecución impecable! No cometiste ningún error sintáctico durante la emergencia.
        </div>
      `;
    } else {
      mistakesListEl.innerHTML = arenaState.mistakesLog
        .map(
          (item) => `
          <div class="p-4 rounded bg-black/70 border border-neonRed/40 space-y-2">
            <p class="text-xs font-bold text-white">${item.scenario}</p>
            <div class="flex flex-wrap gap-3 text-xs font-mono">
              <span class="text-neonRed">Tu entrada: <code>${escapeHTML(item.userTyped)}</code></span>
              <span class="text-neonGreen">Comando correcto: <code class="font-bold">${escapeHTML(item.correctCommand)}</code></span>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${item.explanation}</p>
          </div>
        `
        )
        .join('');
    }
  }
}

/**
 * Copia al portapapeles una tarjeta estilo Wordle con emojis y estadísticas.
 */
function copyWordleResultToClipboard() {
  const totalAttempted = arenaState.resultsEmoji.length;
  const greens = arenaState.resultsEmoji.filter((e) => e === '🟢').length;
  const accuracy = totalAttempted > 0 ? Math.round((greens / totalAttempted) * 100) : 0;

  const shareText = [
    `📟 ShellDojo // Panic Arena`,
    `Ruta: ${arenaState.modeName}`,
    `Resultado: ${arenaState.resultsEmoji.join('')}`,
    `Score: ${arenaState.score} PTS | Combo Máx: x${arenaState.maxCombo} | Precisión: ${accuracy}%`,
    `Nodos activos: ${arenaState.lives}/${MAX_LIVES}`
  ].join('\n');

  navigator.clipboard.writeText(shareText).then(() => {
    const feedback = document.getElementById('pm-share-feedback');
    if (feedback) {
      feedback.classList.remove('hidden');
      setTimeout(() => feedback.classList.add('hidden'), 2500);
    }
  });
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

