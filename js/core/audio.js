/**
 * SHELLDOJO - SINTETIZADOR DE EFECTOS DE SONIDO Y SWITCHES MECÁNICOS (WEB AUDIO API NATIVA)
 * Cero archivos MP3 externos. Soporta control de sensibilidad de volumen y perfiles acústicos
 * de teclado (CRT Clásico, Cherry MX Blue Clicky, Cherry MX Brown Táctil y Pulso Láser Sci-Fi).
 */

import { getState } from './state.js';

class RetroAudioSynth {
  constructor() {
    this.ctx = null;
  }

  /**
   * Inicializa o reanuda el AudioContext tras la primera interacción del usuario.
   */
  initContext() {
    const state = getState();
    if (state.audioMuted || (state.settings && state.settings.audioVolume === 0)) return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Genera un tono parametrizado escalado por el volumen de configuración del usuario.
   */
  playTone(freq, type = 'sine', duration = 0.08, startTimeOffset = 0, peakGain = 0.12) {
    const ctx = this.initContext();
    if (!ctx) return;

    const state = getState();
    const volumeScale = ((state.settings?.audioVolume ?? 85) / 100);
    const adjustedGain = Math.max(0.001, peakGain * volumeScale);

    const now = ctx.currentTime + startTimeOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(adjustedGain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  /**
   * Sonido de tecla según el switch mecánico elegido en Configuración / Tienda XP.
   */
  playKey() {
    const profile = getState().settings?.keyboardProfileId || 'crt-classic';

    if (profile === 'cherry-blue') {
      // Doble clic agudo característico de switch mecánico Cherry MX Blue
      this.playTone(1650, 'square', 0.014, 0, 0.055);
      this.playTone(920, 'triangle', 0.024, 0.01, 0.045);
    } else if (profile === 'cherry-brown') {
      // Golpe grave amortiguado ("Thock" táctil)
      this.playTone(260, 'sine', 0.032, 0, 0.075);
      this.playTone(420, 'triangle', 0.02, 0.005, 0.04);
    } else if (profile === 'laser-scifi') {
      // Pulso sintético futurista
      this.playTone(1240, 'sawtooth', 0.028, 0, 0.04);
    } else {
      // CRT Clásico
      this.playTone(780, 'triangle', 0.025, 0, 0.04);
    }
  }

  /**
   * Acorde ascendente cuando un comando es válido.
   */
  playSuccess() {
    this.playTone(523.25, 'sine', 0.09, 0, 0.12);     // C5
    this.playTone(659.25, 'sine', 0.12, 0.07, 0.14);  // E5
    this.playTone(783.99, 'triangle', 0.16, 0.14, 0.15); // G5
  }

  /**
   * Zumbido grave disonante cuando un comando es erróneo.
   */
  playError() {
    this.playTone(155, 'sawtooth', 0.14, 0, 0.15);
    this.playTone(115, 'sawtooth', 0.22, 0.1, 0.16);
  }

  /**
   * Pitido de tensión de alarma cuando quedan menos de 5 segundos en la Arena.
   */
  playTick() {
    this.playTone(980, 'square', 0.06, 0, 0.09);
  }

  /**
   * Fanfarria retro de victoria al completar una lección o subir de rango.
   */
  playLevelUp() {
    const notes = [440, 554.37, 659.25, 880]; // A4 - C#5 - E5 - A5
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.14, idx * 0.08, 0.16);
    });
  }
}

export const SoundFX = new RetroAudioSynth();
