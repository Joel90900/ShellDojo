/**
 * SHELLDOJO - GENERADOR DE CERTIFICADOS OFICIALES & VERIFICACIÓN PÚBLICA
 * Incluye los datos completos del estudiante (Nombre, Documento CC/CE/TI/Pasaporte,
 * Institución/Empresa, Cargo, País y Rango) — SIN dirección física y SIN respaldos de terceros.
 */

import { getState, calculateRank, registerIssuedCertificate } from './state.js';

/**
 * Construye y registra los metadatos completos de un certificado oficial de ShellDojo.
 */
export function buildCertificateData({
  achievementTitle,
  customRecipientName,
  customEmail,
  customDoc,
  customInstitution,
  customOccupation
}) {
  const state = getState();
  const user = state.user || {};

  const recipientName =
    customRecipientName?.trim() ||
    user.name ||
    'Operador Certificado ShellDojo';

  const recipientEmail =
    customEmail?.trim() ||
    user.email ||
    'tu-correo@gmail.com';

  const recipientDoc =
    customDoc?.trim() ||
    (user.docNumber ? `${user.docType || 'CC'} ${user.docNumber}` : 'Documento no registrado');

  const institution =
    customInstitution?.trim() ||
    user.institution ||
    'Academia ShellDojo';

  const occupation =
    customOccupation?.trim() ||
    user.occupation ||
    'Ingeniero DevOps & Operaciones CLI';

  const country = user.country || 'Colombia';

  const dateFormatted = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const serialHash = Math.random().toString(36).substring(2, 8).toUpperCase();
  const certificateId = `SDJ-${new Date().getFullYear()}-${serialHash}`;

  const certObj = {
    certificateId,
    recipientName,
    recipientDoc,
    recipientEmail,
    institution,
    occupation,
    country,
    achievementTitle: achievementTitle || 'Dominio Táctico de Terminal & Operaciones CLI',
    rankTitle: calculateRank(state.xp),
    xpTotal: state.xp,
    dateFormatted
  };

  registerIssuedCertificate(certObj);
  return certObj;
}

/**
 * Abre el compositor oficial de Gmail Web (`mail.google.com`) prellenado con todos los
 * datos profesionales del certificado y su enlace de verificación pública.
 */
export function sendCertificateViaGmail(certData) {
  registerIssuedCertificate(certData);

  const verifyUrl = `${window.location.origin}${window.location.pathname}?verify=${encodeURIComponent(
    certData.certificateId
  )}`;

  const subject = encodeURIComponent(
    `🎓 Certificado Oficial ShellDojo [${certData.certificateId}] - ${certData.recipientName}`
  );

  const bodyLines = [
    `============================================================`,
    `                 >_ SHELLDOJO ACADEMY                       `,
    `          CERTIFICADO OFICIAL DE FINALIZACIÓN               `,
    `============================================================`,
    ``,
    `SHELLDOJO certifica oficialmente que:`,
    `👉 ${certData.recipientName.toUpperCase()}`,
    `   Documento de Identidad : ${certData.recipientDoc}`,
    `   Institución / Empresa  : ${certData.institution}`,
    `   Rol / Especialidad     : ${certData.occupation} (${certData.country})`,
    ``,
    `Ha completado satisfactoriamente el entrenamiento práctico en:`,
    `🏆 "${certData.achievementTitle}"`,
    ``,
    `CREDENCIALES DE VERIFICACIÓN:`,
    `• ID Único de Certificado : ${certData.certificateId}`,
    `• Rango Operativo         : ${certData.rankTitle} (${certData.xpTotal} XP)`,
    `• Fecha de Expedición     : ${certData.dateFormatted}`,
    `• URL de Verificación     : ${verifyUrl}`,
    ``,
    `============================================================`,
    `★ Expedido exclusivamente por SHELLDOJO.`
  ].join('\n');

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    certData.recipientEmail
  )}&su=${subject}&body=${encodeURIComponent(bodyLines)}`;

  window.open(gmailUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Abre una ventana de impresión / guardado en PDF de alta resolución con el diseño
 * exclusivo de ShellDojo incluyendo Documento, Institución y Especialidad.
 */
export function downloadCertificatePrintable(certData) {
  registerIssuedCertificate(certData);

  const printWin = window.open('', '_blank', 'width=1120,height=820');
  if (!printWin) return;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Certificado_${certData.certificateId}_ShellDojo</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #070a0e;
          color: #f8fafc;
          font-family: 'JetBrains Mono', monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .cert-frame {
          width: 1020px;
          background: radial-gradient(circle at top, #101923 0%, #070a0e 100%);
          border: 3px solid #00ff66;
          border-radius: 16px;
          padding: 44px 52px;
          position: relative;
          box-shadow: 0 0 40px rgba(0, 255, 102, 0.25);
        }
        .inner-border {
          border: 1px solid rgba(0, 229, 255, 0.35);
          border-radius: 10px;
          padding: 36px;
          text-align: center;
        }
        .brand-row {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .logo-box {
          width: 52px;
          height: 52px;
          border: 2px solid #00ff66;
          background: #000;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00ff66;
          font-weight: 800;
          font-size: 24px;
        }
        .brand-name {
          font-family: 'Share Tech Mono', monospace;
          font-size: 34px;
          letter-spacing: 3px;
          color: #fff;
        }
        .brand-name span { color: #00ff66; }
        .cert-tag {
          display: inline-block;
          font-size: 11px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #00e5ff;
          background: rgba(0, 229, 255, 0.1);
          border: 1px solid rgba(0, 229, 255, 0.4);
          padding: 6px 16px;
          border-radius: 99px;
          margin-bottom: 18px;
        }
        .subtitle {
          font-size: 12px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .recipient {
          font-size: 34px;
          font-weight: 800;
          color: #00ff66;
          margin: 12px 0 6px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .identity-line {
          font-size: 13px;
          color: #cbd5e1;
          margin-bottom: 18px;
        }
        .course-title {
          font-size: 20px;
          font-weight: 700;
          color: #ffffff;
          margin: 12px auto 24px;
          max-width: 780px;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #1e293b;
          font-size: 11px;
        }
        .meta-box {
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid #1e293b;
          padding: 10px;
          border-radius: 8px;
        }
        .meta-label { color: #64748b; font-size: 9px; text-transform: uppercase; display: block; }
        .meta-val { color: #f8fafc; font-weight: 700; margin-top: 4px; display: block; }
        .seal {
          margin-top: 24px;
          font-size: 11px;
          color: #ffb800;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="cert-frame">
        <div class="inner-border">
          <div class="brand-row">
            <div class="logo-box">&gt;_</div>
            <div class="brand-name">SHELL<span>DOJO</span></div>
          </div>
          <div>
            <span class="cert-tag">CERTIFICADO OFICIAL DE EXCELENCIA TÉCNICA</span>
          </div>
          <p class="subtitle">SHELLDOJO CERTIFICA OFICIALMENTE QUE:</p>
          <div class="recipient">${certData.recipientName}</div>
          <div class="identity-line">
            Identificación: <strong>${certData.recipientDoc}</strong> &bull;
            Institución/Empresa: <strong>${certData.institution}</strong> &bull;
            Especialidad: <strong>${certData.occupation}</strong>
          </div>
          <p class="subtitle">HA COMPLETADO CON ÉXITO EL PROGRAMA PRÁCTICO DE TERMINAL:</p>
          <div class="course-title">"${certData.achievementTitle}"</div>

          <div class="meta-grid">
            <div class="meta-box">
              <span class="meta-label">CÓDIGO DE VERIFICACIÓN</span>
              <span class="meta-val">${certData.certificateId}</span>
            </div>
            <div class="meta-box">
              <span class="meta-label">DOCUMENTO TITULAR</span>
              <span class="meta-val">${certData.recipientDoc}</span>
            </div>
            <div class="meta-box">
              <span class="meta-label">RANGO &amp; EXPERIENCIA</span>
              <span class="meta-val">${certData.rankTitle} (${certData.xpTotal} XP)</span>
            </div>
            <div class="meta-box">
              <span class="meta-label">FECHA DE EXPEDICIÓN</span>
              <span class="meta-val">${certData.dateFormatted}</span>
            </div>
          </div>

          <div class="seal">
            ★ EXPEDIDO EXCLUSIVAMENTE POR SHELLDOJO ★
          </div>
        </div>
      </div>
      <script>
        window.onload = () => { setTimeout(() => window.print(), 400); };
      </script>
    </body>
    </html>
  `;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}
