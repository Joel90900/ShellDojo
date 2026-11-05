/**
 * SHELLDOJO - CONTROLADOR DEL MODO DOJO (ENTRENAMIENTO PASO A PASO SIN RELOJ)
 * Gestiona el Manual Táctico, la Anatomía Visual por colores, el Simulador de Terminal
 * Persistente y el Sistema Ghost Hint (anti-frustración con Tab).
 */

import { CURRICULUM_DATA } from '../data/curriculum.js';
import { validateCommand } from '../core/validator.js';
import { completeLesson, isTierAllowed } from '../core/state.js';
import { SoundFX } from '../core/audio.js';
import { updateHUD } from './renderer.js';

let currentTrack = CURRICULUM_DATA[0];
let currentLessonIndex = 0;
let currentStepIndex = 0;
let ghostHintActive = false;
let navigationCallbacks = null;

/**
 * Inicializa los listeners del Modo Dojo.
 * @param {object} callbacks - { onBackToAcademy, onStartTrackExam, onProgressUpdated }
 */
export function initDojoController(callbacks) {
  navigationCallbacks = callbacks;

  const form = document.getElementById('dojo-command-form');
  const input = document.getElementById('dojo-command-input');
  const ghostBtn = document.getElementById('btn-dojo-ghost-hint');
  const clearBtn = document.getElementById('btn-dojo-clear');
  const backBtn = document.getElementById('btn-dojo-back');
  const nextLessonBtn = document.getElementById('btn-dojo-next-lesson');
  const goExamBtn = document.getElementById('btn-dojo-go-exam');
  const certBtn = document.getElementById('btn-dojo-certificate');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleDojoCommandSubmit();
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        activateGhostHint();
      } else if (e.key.length === 1) {
        SoundFX.playKey();
      }
    });
  }

  if (ghostBtn) {
    ghostBtn.addEventListener('click', () => {
      activateGhostHint();
      if (input) input.focus();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearTerminalHistory();
      if (input) input.focus();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (navigationCallbacks?.onBackToAcademy) {
        navigationCallbacks.onBackToAcademy();
      }
    });
  }

  if (nextLessonBtn) {
    nextLessonBtn.addEventListener('click', () => {
      goToNextLesson();
    });
  }

  if (goExamBtn) {
    goExamBtn.addEventListener('click', () => {
      if (navigationCallbacks?.onStartTrackExam) {
        navigationCallbacks.onStartTrackExam(currentTrack.id);
      }
    });
  }

  if (certBtn) {
    certBtn.addEventListener('click', () => {
      const lesson = currentTrack.lessons[currentLessonIndex];
      if (navigationCallbacks?.onClaimCertificate) {
        navigationCallbacks.onClaimCertificate(`${currentTrack.title} — ${lesson.title}`);
      }
    });
  }
}

/**
 * Carga una lección específica en el Modo Dojo.
 */
export function loadDojoLesson(trackId, lessonId) {
  const foundTrack = CURRICULUM_DATA.find((t) => t.id === trackId) || CURRICULUM_DATA[0];
  currentTrack = foundTrack;

  const foundLessonIdx = currentTrack.lessons.findIndex((l) => l.id === lessonId);
  currentLessonIndex = foundLessonIdx >= 0 ? foundLessonIdx : 0;
  currentStepIndex = 0;
  ghostHintActive = false;

  renderDojoState(true);
}

/**
 * Renderiza toda la interfaz del Dojo para la lección y paso actual.
 * @param {boolean} resetTerminal - Si es true, reinicia el historial de consola al abrir una lección nueva.
 */
function renderDojoState(resetTerminal = false) {
  const lesson = currentTrack.lessons[currentLessonIndex];
  const step = lesson.steps[currentStepIndex];

  const badgeEl = document.getElementById('dojo-track-badge');
  const titleEl = document.getElementById('dojo-lesson-title');
  const stepCounterEl = document.getElementById('dojo-step-counter');
  const theoryEl = document.getElementById('dojo-theory-text');
  const promptEl = document.getElementById('dojo-prompt-label');
  const termTitleEl = document.getElementById('dojo-terminal-title');
  const activeInstructionEl = document.getElementById('dojo-active-instruction');
  const victoryBanner = document.getElementById('dojo-victory-banner');
  const input = document.getElementById('dojo-command-input');
  const ghostStatus = document.getElementById('dojo-ghost-status');

  if (badgeEl) badgeEl.textContent = currentTrack.title;
  if (titleEl) titleEl.textContent = lesson.title;
  if (stepCounterEl) {
    stepCounterEl.textContent = `PASO ${Math.min(currentStepIndex + 1, lesson.steps.length)} DE ${lesson.steps.length}`;
  }
  if (theoryEl) theoryEl.textContent = lesson.theory;
  if (promptEl) promptEl.textContent = currentTrack.prompt;
  if (termTitleEl) termTitleEl.textContent = `session — ${currentTrack.id}: ${currentTrack.prompt}`;

  if (step && activeInstructionEl) {
    activeInstructionEl.textContent = `[Paso ${currentStepIndex + 1}] ${step.instruction}`;
  }

  renderAnatomyBlocks(lesson.anatomy);
  renderStepsList(lesson.steps, currentStepIndex);

  if (victoryBanner) victoryBanner.classList.add('hidden');
  if (ghostStatus) ghostStatus.classList.add('hidden');

  if (input) {
    input.disabled = false;
    input.value = '';
    input.placeholder = 'Escribe el comando aquí... (Presiona Tab para Mostrar Guía)';
    input.focus();
  }

  if (resetTerminal) {
    clearTerminalHistory();
    appendTerminalSystemMessage(
      `Entorno virtual iniciado para [${lesson.title}]. Completa los ${lesson.steps.length} pasos en secuencia.`
    );
  }
}

/**
 * Renderiza el desglose de Anatomía Visual del Comando por colores.
 */
function renderAnatomyBlocks(anatomyArray = []) {
  const box = document.getElementById('dojo-anatomy-box');
  if (!box) return;

  const typeLabelMap = {
    executable: 'Ejecutable Base',
    subcommand: 'Subcomando / Acción',
    flag: 'Bandera / Opción',
    argument: 'Argumento / Ruta',
    operator: 'Operador / Pipe'
  };

  box.innerHTML = `
    <div class="flex flex-wrap gap-2">
      ${anatomyArray
        .map(
          (item) => `
          <div class="token-badge token-${item.type}">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-sm">[${item.token}]</span>
              <span class="text-[10px] uppercase opacity-75">(${typeLabelMap[item.type] || item.type})</span>
            </div>
            <span class="text-[11px] text-slate-200 mt-0.5">${item.role}</span>
          </div>
        `
        )
        .join('')}
    </div>
  `;
}

/**
 * Renderiza la lista de los 3 pasos resaltando el activo y su pista.
 */
function renderStepsList(steps, activeIdx) {
  const listEl = document.getElementById('dojo-steps-list');
  if (!listEl) return;

  listEl.className = 'space-y-2.5 max-h-80 overflow-y-auto pr-1';

  listEl.innerHTML = steps
    .map((step, idx) => {
      const isCompleted = idx < activeIdx;
      const isCurrent = idx === activeIdx;

      let borderClass = 'border-crtBorder bg-black/30 opacity-60';
      let badgeHTML = `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">EJERCICIO ${idx + 1} / ${steps.length}</span>`;

      if (isCompleted) {
        borderClass = 'border-neonGreen/40 bg-neonGreen/5';
        badgeHTML = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-neonGreen/20 text-neonGreen">✓ EJERCICIO ${idx + 1} SUPERADO</span>`;
      } else if (isCurrent) {
        borderClass = 'border-neonCyan bg-neonCyan/10 shadow-neon-cyan';
        badgeHTML = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-neonCyan text-black">▶ EJERCICIO ${idx + 1} DE ${steps.length} ACTIVO</span>`;
      }

      return `
        <div id="dojo-step-item-${idx}" class="p-3 rounded border ${borderClass} transition-all space-y-1.5">
          <div class="flex items-center justify-between">
            ${badgeHTML}
            ${isCompleted ? `<code class="text-xs text-neonGreen font-bold">${step.validCommands[0]}</code>` : ''}
          </div>
          <p class="text-xs sm:text-sm ${isCurrent ? 'text-white font-semibold' : 'text-slate-300'}">
            ${step.instruction}
          </p>
          ${
            isCurrent
              ? `<p class="text-[11px] text-neonAmber pt-1">💡 Pista: ${step.hint}</p>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  const activeItem = document.getElementById(`dojo-step-item-${activeIdx}`);
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Activa el Ghost Hint (coloca el comando exacto esperado como placeholder en el input).
 */
export function activateGhostHint() {
  const lesson = currentTrack.lessons[currentLessonIndex];
  const step = lesson?.steps[currentStepIndex];
  if (!step) return;

  const input = document.getElementById('dojo-command-input');
  const ghostStatus = document.getElementById('dojo-ghost-status');

  ghostHintActive = true;
  if (input) {
    input.value = '';
    input.placeholder = step.validCommands[0];
    input.focus();
  }
  if (ghostStatus) {
    ghostStatus.textContent = `Guía Fantasma: escribe "${step.validCommands[0]}"`;
    ghostStatus.classList.remove('hidden');
  }
}

/**
 * Procesa el envío de un comando en la terminal del Dojo.
 */
function handleDojoCommandSubmit() {
  const lesson = currentTrack.lessons[currentLessonIndex];
  const step = lesson.steps[currentStepIndex];
  const input = document.getElementById('dojo-command-input');
  const form = document.getElementById('dojo-command-form');

  if (!step || !input) return;

  const rawValue = input.value;
  if (!rawValue.trim()) return;

  const isValid = validateCommand(rawValue, step.validCommands);

  if (isValid) {
    SoundFX.playSuccess();
    appendTerminalStepOutput(currentTrack.prompt, rawValue, step.simulatedOutput, true);

    input.value = '';
    input.placeholder = 'Escribe el comando aquí... (Tab para Guía)';
    ghostHintActive = false;

    const ghostStatus = document.getElementById('dojo-ghost-status');
    if (ghostStatus) ghostStatus.classList.add('hidden');

    currentStepIndex += 1;

    if (currentStepIndex >= lesson.steps.length) {
      handleLessonVictory(lesson);
    } else {
      const nextStep = lesson.steps[currentStepIndex];
      const stepCounterEl = document.getElementById('dojo-step-counter');
      const activeInstructionEl = document.getElementById('dojo-active-instruction');

      if (stepCounterEl) {
        stepCounterEl.textContent = `PASO ${currentStepIndex + 1} DE ${lesson.steps.length}`;
      }
      if (activeInstructionEl) {
        activeInstructionEl.textContent = `[Paso ${currentStepIndex + 1}] ${nextStep.instruction}`;
      }
      renderStepsList(lesson.steps, currentStepIndex);
    }
  } else {
    SoundFX.playError();
    appendTerminalStepOutput(
      currentTrack.prompt,
      rawValue,
      `bash: comando o sintaxis no esperada para el Paso ${currentStepIndex + 1}. Revisa la pista o presiona [Tab] para ver la Guía Fantasma.`,
      false
    );

    if (form) {
      form.classList.remove('shake-error');
      void form.offsetWidth;
      form.classList.add('shake-error');
    }
  }
}

/**
 * Maneja la finalización exitosa de los 3 pasos de la lección actual.
 */
function handleLessonVictory(lesson) {
  SoundFX.playLevelUp();
  completeLesson(lesson.id);
  updateHUD();

  if (navigationCallbacks?.onProgressUpdated) {
    navigationCallbacks.onProgressUpdated();
  }

  renderStepsList(lesson.steps, lesson.steps.length);

  const activeInstructionEl = document.getElementById('dojo-active-instruction');
  const victoryBanner = document.getElementById('dojo-victory-banner');
  const input = document.getElementById('dojo-command-input');

  if (activeInstructionEl) {
    activeInstructionEl.textContent = '¡Secuencia completada! Todos los pasos han sido verificados.';
  }
  if (victoryBanner) {
    victoryBanner.classList.remove('hidden');
  }
  if (input) {
    input.disabled = true;
    input.placeholder = 'Lección completada (+150 XP)';
  }

  appendTerminalSystemMessage(
    `[VICTORIA] Lección "${lesson.title}" superada. +150 XP acreditados en tu perfil.`
  );
}

/**
 * Avanza a la siguiente lección de la ruta actual (o lanza el examen si era la última).
 */
function goToNextLesson() {
  let nextIdx = currentLessonIndex + 1;
  while (
    nextIdx < currentTrack.lessons.length &&
    !isTierAllowed(currentTrack.lessons[nextIdx].planTier || 'free')
  ) {
    nextIdx += 1;
  }

  if (nextIdx < currentTrack.lessons.length) {
    currentLessonIndex = nextIdx;
    currentStepIndex = 0;
    renderDojoState(true);
  } else {
    if (navigationCallbacks?.onStartTrackExam) {
      navigationCallbacks.onStartTrackExam(currentTrack.id);
    }
  }
}

function appendTerminalStepOutput(promptStr, commandStr, outputStr, isSuccess) {
  const outputBox = document.getElementById('dojo-terminal-output');
  if (!outputBox) return;

  const entry = document.createElement('div');
  entry.className = 'space-y-1 border-b border-crtBorder/40 pb-2';

  const escapedCmd = escapeHTML(commandStr);
  const escapedOut = escapeHTML(outputStr);

  entry.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-neonGreen font-bold text-xs">${escapeHTML(promptStr)}</span>
      <span class="text-white font-semibold">${escapedCmd}</span>
    </div>
    <pre class="text-xs whitespace-pre-wrap pl-3 border-l-2 ${
      isSuccess ? 'border-neonGreen/60 text-slate-300' : 'border-neonRed text-neonRed'
    }">${escapedOut}</pre>
  `;

  outputBox.appendChild(entry);
  outputBox.scrollTop = outputBox.scrollHeight;
}

function appendTerminalSystemMessage(message) {
  const outputBox = document.getElementById('dojo-terminal-output');
  if (!outputBox) return;

  const msg = document.createElement('div');
  msg.className = 'text-xs text-neonCyan bg-neonCyan/10 border border-neonCyan/30 px-3 py-1.5 rounded';
  msg.textContent = `:: ${message}`;

  outputBox.appendChild(msg);
  outputBox.scrollTop = outputBox.scrollHeight;
}

function clearTerminalHistory() {
  const outputBox = document.getElementById('dojo-terminal-output');
  if (outputBox) outputBox.innerHTML = '';
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

