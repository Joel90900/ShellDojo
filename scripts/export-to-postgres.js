/**
 * SHELLDOJO - EXPORTADOR DE DATOS JSON -> POSTGRESQL
 * Lee data/store.json y genera los INSERT SQL listos para pegar en pgAdmin
 * o los envía directamente a PostgreSQL si pg está configurado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, '..', 'data', 'store.json');
const outputPath = path.join(__dirname, '..', 'data', 'seed-postgres.sql');

try {
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const lines = [
    '-- ============================================================',
    '-- SHELLDOJO - DATOS IMPORTADOS DESDE STORE.JSON',
    '-- ============================================================',
    ''
  ];

  // Usuarios
  if (store.users && store.users.length) {
    lines.push('-- Insertar Usuarios');
    for (const u of store.users) {
      const email = (u.email || '').replace(/'/g, "''");
      const name = (u.name || 'Operador').replace(/'/g, "''");
      const handle = (u.handle || 'user').replace(/'/g, "''");
      const docType = (u.docType || 'CC').replace(/'/g, "''");
      const docNum = (u.docNumber || '').replace(/'/g, "''");
      const phone = (u.phone || '').replace(/'/g, "''");
      const country = (u.country || 'Colombia').replace(/'/g, "''");
      const inst = (u.institution || 'Independiente').replace(/'/g, "''");
      const occ = (u.occupation || 'DevOps').replace(/'/g, "''");
      const plan = u.plan || 'free';
      const xp = Number(u.xp || 0);

      lines.push(
        `INSERT INTO users (name, handle, email, doc_type, doc_number, phone, country, institution, occupation, plan, xp) ` +
        `VALUES ('${name}', '${handle}', '${email}', '${docType}', '${docNum}', '${phone}', '${country}', '${inst}', '${occ}', '${plan}', ${xp}) ` +
        `ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan, xp = EXCLUDED.xp;`
      );
    }
    lines.push('');
  }

  // Pagos
  if (store.payments && store.payments.length) {
    lines.push('-- Insertar Pagos');
    for (const p of store.payments) {
      const ref = (p.reference || '').replace(/'/g, "''");
      const cus = (p.cus || '').replace(/'/g, "''");
      const planName = (p.planName || 'Plan Pro Operator').replace(/'/g, "''");
      const planId = p.planId || 'pro';
      const method = (p.methodLabel || 'Nequi / PSE').replace(/'/g, "''");
      const amount = Number(p.amountCOP || 0);
      const buyerDoc = (p.buyerDoc || '').replace(/'/g, "''");
      const buyerEmail = p.buyerEmail ? `'${p.buyerEmail.replace(/'/g, "''")}'` : 'NULL';
      const status = p.status || 'approved';

      lines.push(
        `INSERT INTO payments (reference, cus, plan_name, plan_id, method_label, amount_cop, buyer_doc, buyer_email, status) ` +
        `VALUES ('${ref}', '${cus}', '${planName}', '${planId}', '${method}', ${amount}, '${buyerDoc}', ${buyerEmail}, '${status}') ` +
        `ON CONFLICT (reference) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // Certificados
  if (store.certificates && store.certificates.length) {
    lines.push('-- Insertar Certificados');
    for (const c of store.certificates) {
      const cid = (c.certificateId || '').replace(/'/g, "''");
      const name = (c.recipientName || '').replace(/'/g, "''");
      const doc = (c.recipientDoc || '').replace(/'/g, "''");
      const email = (c.recipientEmail || '').replace(/'/g, "''");
      const title = (c.achievementTitle || '').replace(/'/g, "''");
      const rank = (c.rankTitle || 'DevOps Ninja').replace(/'/g, "''");
      const xp = Number(c.xpTotal || 0);
      const date = (c.dateFormatted || '').replace(/'/g, "''");
      const revoked = Boolean(c.revoked);

      lines.push(
        `INSERT INTO certificates (certificate_id, recipient_name, recipient_doc, recipient_email, achievement_title, rank_title, xp_total, date_formatted, revoked) ` +
        `VALUES ('${cid}', '${name}', '${doc}', '${email}', '${title}', '${rank}', ${xp}, '${date}', ${revoked}) ` +
        `ON CONFLICT (certificate_id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`Script SQL generado con éxito en: ${outputPath}`);
} catch (err) {
  console.error('Error generando seed SQL:', err.message);
}

