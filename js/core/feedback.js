/**
 * SHELLDOJO - GESTOR DE OPINIONES Y ENVÍO A CORREO DEL ADMINISTRADOR
 * Permite a los clientes calificar la plataforma, sugerir lecciones y enviar
 * sus comentarios directamente al correo electrónico del creador/administrador.
 */

import { sendClientFeedback, fetchAdminEmail } from './sync.js';
import { getState } from './state.js';

let cachedAdminEmail = 'soporteshelldojo@gmail.com';

export async function getTargetAdminEmail() {
  try {
    cachedAdminEmail = await fetchAdminEmail();
  } catch {}
  return cachedAdminEmail || 'soporteshelldojo@gmail.com';
}

export function buildMailtoLinks({ name, email, rating, category, message, adminEmail }) {
  const targetEmail = adminEmail || cachedAdminEmail || 'soporteshelldojo@gmail.com';
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const subject = `[ShellDojo Feedback] ${rating}★ de ${name} - ${category}`;

  const bodyLines = [
    `============================================================`,
    `         >_ SHELLDOJO // NUEVA OPINIÓN DE CLIENTE          `,
    `============================================================`,
    ``,
    `👤 Nombre del Estudiante / Cliente: ${name}`,
    `📧 Correo del Cliente            : ${email || 'No proporcionado'}`,
    `⭐ Calificación Otorgada          : ${stars} (${rating} / 5)`,
    `🏷️ Categoría de Opinión           : ${category}`,
    `📅 Fecha de Envío                : ${new Date().toLocaleString('es-CO')}`,
    ``,
    `------------------------------------------------------------`,
    `💬 COMENTARIOS / SUGERENCIA DETALLADA:`,
    `------------------------------------------------------------`,
    message,
    ``,
    `============================================================`,
    `Enviado desde el Buzón Oficial de Opinión ShellDojo Academy`
  ];

  const bodyText = bodyLines.join('\n');

  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    targetEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  const mailtoUrl = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyText)}`;

  return { targetEmail, subject, bodyText, gmailWebUrl, mailtoUrl };
}

export async function processClientFeedback({
  name,
  email,
  rating,
  category,
  message,
  openEmailClient = true
}) {
  const state = getState();
  const userName = name || state.user?.name || 'Estudiante ShellDojo';
  const userEmail = email || state.user?.email || '';
  const numRating = Number(rating || 5);
  const userCat = category || 'Experiencia General';

  // 1. Obtener correo destino configurado
  const adminEmail = await getTargetAdminEmail();

  // 2. Guardar en backend (data/store.json)
  const apiRes = await sendClientFeedback({
    name: userName,
    email: userEmail,
    rating: numRating,
    category: userCat,
    message
  });

  const finalAdminEmail = apiRes?.adminEmail || adminEmail;

  // 3. Generar enlaces de correo para el cliente
  const emailData = buildMailtoLinks({
    name: userName,
    email: userEmail,
    rating: numRating,
    category: userCat,
    message,
    adminEmail: finalAdminEmail
  });

  // 4. Si se solicita abrir cliente de correo, abrir Gmail Web o mailto
  if (openEmailClient) {
    const newTab = window.open(emailData.gmailWebUrl, '_blank');
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = emailData.mailtoUrl;
    }
  }

  // 5. Guardar copia local de respaldo
  try {
    const raw = localStorage.getItem('shelldojo_feedback_history') || '[]';
    const list = JSON.parse(raw);
    list.unshift({
      name: userName,
      email: userEmail,
      rating: numRating,
      category: userCat,
      message,
      sentAt: new Date().toISOString()
    });
    localStorage.setItem('shelldojo_feedback_history', JSON.stringify(list.slice(0, 10)));
  } catch {}

  return {
    ok: true,
    adminEmail: finalAdminEmail,
    emailData
  };
}

