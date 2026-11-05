/**
 * SHELLDOJO - GENERADOR DE CONFETI CIBERNÉTICO NEÓN
 * Crea un efecto visual de victoria/graduación sin dependencias externas.
 */

export function fireCyberConfetti(durationMs = 3500) {
  // Evitar duplicar canvas si ya hay una animación en curso
  let existingCanvas = document.getElementById('cyber-confetti-canvas');
  if (existingCanvas) existingCanvas.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'cyber-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = (canvas.width = window.innerWidth * dpr);
  const height = (canvas.height = window.innerHeight * dpr);
  ctx.scale(dpr, dpr);

  const colors = [
    '#00ff66', // Verde Neón Terminal
    '#00e5ff', // Cian Neón Cyber
    '#ffb000', // Ámbar CRT
    '#ff3333', // Rojo Alerta Panic
    '#c084fc', // Púrpura Netrunner
    '#ffffff'  // Blanco puro
  ];

  const particlesCount = 130;
  const particles = [];

  for (let i = 0; i < particlesCount; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * -window.innerHeight * 0.5,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 5,
      vy: Math.random() * 4 + 3,
      angle: Math.random() * 360,
      vAngle: (Math.random() - 0.5) * 10,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
      opacity: 1
    });
  }

  const startTime = Date.now();
  let animationFrameId;

  function loop() {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / durationMs;

    if (progress >= 1) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.vAngle;
      p.vy += 0.08; // Gravedad
      p.vx *= 0.99; // Fricción del aire

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.angle * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);
}

