/**
 * SHELLDOJO - CONTROL CENTER // ADMIN & DATABASE CRUD COMPLETO
 * Conexión bidireccional en vivo con data/store.json y auto-sincronización con el cliente.
 */

const IS_FILE_ORIGIN = window.location.protocol === 'file:';
const IS_REMOTE_ORIGIN = IS_FILE_ORIGIN || window.location.port !== '3000';
const BACKEND_BASE = IS_REMOTE_ORIGIN ? 'http://localhost:3000' : '';

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'shelldojo-admin'
};

const loginView = document.getElementById('login-view');
const panelView = document.getElementById('panel-view');
const content = document.getElementById('content');
const search = document.getElementById('search');
const toolbarActions = document.getElementById('toolbar-actions');
const toastEl = document.getElementById('toast');
const dbStatusPill = document.getElementById('db-status-pill');

// Modal CRUD
const crudModal = document.getElementById('crud-modal');
const modalTitle = document.getElementById('modal-title');
const modalFields = document.getElementById('modal-fields');
const crudForm = document.getElementById('crud-form');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

let currentTab = 'users';
let currentRows = [];
let currentCrudAction = null; // { type: 'user'|'payment'|'cert', mode: 'create'|'edit', id: string }
let cachedAdminEmailConfig = 'soporteshelldojo@gmail.com';

function getHeaders() {
  const h = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'shelldojo-admin'
  };
  const token = sessionStorage.getItem('sd_admin_token');
  if (token) {
    h['X-Admin-Token'] = token;
  }
  return h;
}

// Helpers de DOM
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const money = (n) => `$${Number(n || 0).toLocaleString('es-CO')} COP`;
const date = (d) => (d ? new Date(d).toLocaleString('es-CO') : '-');

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = `✔ ${msg}`;
  toastEl.hidden = false;
  setTimeout(() => {
    toastEl.hidden = true;
  }, 3500);
}

// Consumo de API
async function api(path, options = {}) {
  const fullUrl = `${BACKEND_BASE}${path}`;
  const fetchOpts = {
    headers: { ...getHeaders(), ...(options.headers || {}) },
    ...options
  };
  if (!IS_FILE_ORIGIN) {
    fetchOpts.credentials = 'include';
  }
  try {
    const res = await fetch(fullUrl, fetchOpts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/admin/login') {
      showLogin();
      throw new Error(data.error || 'Sesión requerida');
    }
    if (!res.ok) throw new Error(data.error || 'Error en el servidor');
    if (dbStatusPill) {
      dbStatusPill.className = 'status-pill status-live';
      dbStatusPill.textContent = '● Base de Datos Conectada (store.json)';
    }
    return data;
  } catch (err) {
    if (path === '/api/admin/login' || path === '/api/admin/me') throw err;
    return handleLocalFallback(path, options);
  }
}

// Sincronización automática de datos existentes en el navegador hacia la base de datos
async function syncLocalWithBackend() {
  try {
    const raw = localStorage.getItem('shelldojo_state_v6');
    if (!raw) return;
    const parsed = JSON.parse(raw);

    const usersMap = new Map();
    (parsed.registeredUsers || []).forEach((u) => {
      if (u && u.email) usersMap.set(String(u.email).toLowerCase(), u);
    });
    if (parsed.user && parsed.user.email) {
      const key = String(parsed.user.email).toLowerCase();
      usersMap.set(key, { ...parsed.user, ...(usersMap.get(key) || {}) });
    }
    const combinedUsers = Array.from(usersMap.values());

    const payload = {
      users: combinedUsers,
      payments: parsed.payments || [],
      certificates: parsed.issuedCertificates || []
    };

    if (payload.users.length || payload.payments.length || payload.certificates.length) {
      const res = await api('/api/admin/sync', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.ok) {
        showToast('Base de datos sincronizada con los usuarios de la plataforma');
      }
    }
  } catch (err) {
    console.warn('Auto-sincronización silenciosa no requerida:', err);
  }
}

// Respaldo local de emergencia
function getLocalStore() {
  try {
    const raw = localStorage.getItem('shelldojo_state_v6') || '{}';
    const p = JSON.parse(raw);
    return {
      users: p.registeredUsers || (p.user ? [p.user] : []),
      payments: p.payments || [],
      certificates: p.issuedCertificates || []
    };
  } catch {
    return { users: [], payments: [], certificates: [] };
  }
}

function handleLocalFallback(path, options) {
  const store = getLocalStore();

  if (path === '/api/admin/stats') {
    const byPlan = { free: 0, pro: 0, team: 0 };
    store.users.forEach((u) => {
      byPlan[u.plan || 'free'] = (byPlan[u.plan || 'free'] || 0) + 1;
    });
    return {
      totalUsers: store.users.length,
      newUsers7d: store.users.length,
      byPlan,
      totalPayments: store.payments.length,
      revenueCOP: store.payments.reduce((s, p) => s + Number(p.amountCOP || 0), 0),
      totalCertificates: store.certificates.filter((c) => !c.revoked).length
    };
  }

  if (path === '/api/admin/users') {
    if (options.method === 'POST') {
      const u = JSON.parse(options.body);
      store.users.unshift(u);
      saveLocalStore(store);
      return { ok: true, user: u };
    }
    if (options.method === 'PUT') {
      const u = JSON.parse(options.body);
      const idx = store.users.findIndex((x) => x.id === u.id || x.email === u.email);
      if (idx >= 0) store.users[idx] = { ...store.users[idx], ...u };
      saveLocalStore(store);
      return { ok: true, user: u };
    }
    if (options.method === 'DELETE') {
      const b = JSON.parse(options.body);
      store.users = store.users.filter((x) => x.id !== b.id && x.email !== b.email);
      saveLocalStore(store);
      return { ok: true };
    }
    return store.users;
  }

  if (path === '/api/admin/payments') return store.payments;
  if (path === '/api/admin/certificates') return store.certificates;

  if (path === '/api/admin/feedback') {
    if (options.method === 'PUT') {
      const b = JSON.parse(options.body || '{}');
      const list = JSON.parse(localStorage.getItem('shelldojo_feedback_list') || '[]');
      const item = list.find((x) => x.id === b.id);
      if (item && b.read !== undefined) item.read = b.read;
      localStorage.setItem('shelldojo_feedback_list', JSON.stringify(list));
      return { ok: true };
    }
    if (options.method === 'DELETE') {
      const b = JSON.parse(options.body || '{}');
      let list = JSON.parse(localStorage.getItem('shelldojo_feedback_list') || '[]');
      list = list.filter((x) => x.id !== b.id);
      localStorage.setItem('shelldojo_feedback_list', JSON.stringify(list));
      return { ok: true };
    }
    return JSON.parse(localStorage.getItem('shelldojo_feedback_list') || '[]');
  }

  if (path === '/api/admin/email-config') {
    if (options.method === 'POST') {
      const b = JSON.parse(options.body || '{}');
      localStorage.setItem('shelldojo_admin_email', b.adminEmail || 'admin@shelldojo.io');
      return { ok: true, adminEmail: b.adminEmail };
    }
    return { adminEmail: localStorage.getItem('shelldojo_admin_email') || 'admin@shelldojo.io' };
  }

  return [];
}

function saveLocalStore(store) {
  try {
    const raw = localStorage.getItem('shelldojo_state_v6');
    const p = raw ? JSON.parse(raw) : {};
    p.registeredUsers = store.users;
    p.payments = store.payments;
    p.issuedCertificates = store.certificates;
    localStorage.setItem('shelldojo_state_v6', JSON.stringify(p));
  } catch {}
}

function showLogin() {
  if (panelView) panelView.hidden = true;
  if (loginView) loginView.hidden = false;
}

function showPanel() {
  if (loginView) loginView.hidden = true;
  if (panelView) panelView.hidden = false;
  syncLocalWithBackend().finally(() => loadTab(currentTab || 'users'));
}

// Filtrado en vivo
function filterRows(rows) {
  const q = search.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

// Renderizado de Tablas
function table(columns, rows, emptyText) {
  if (!rows || !rows.length) return el('div', emptyText, 'empty');
  const wrap = el('div', undefined, 'overflow');
  const t = el('table');
  const head = el('tr');
  columns.forEach((c) => head.appendChild(el('th', c.label)));
  t.appendChild(head);

  rows.forEach((row) => {
    const tr = el('tr');
    columns.forEach((c) => {
      const td = el('td');
      const val = c.render ? c.render(row) : row[c.key];
      if (val instanceof Node) td.appendChild(val);
      else td.textContent = val ?? '-';
      tr.appendChild(td);
    });
    t.appendChild(tr);
  });

  wrap.appendChild(t);
  return wrap;
}

function renderTable() {
  const rows = filterRows(currentRows);
  content.replaceChildren();

  // 1. PESTAÑA USUARIOS (CRUD COMPLETO)
  if (currentTab === 'users') {
    if (dbStatusPill) {
      dbStatusPill.className = 'status-pill status-live';
      dbStatusPill.textContent = `● Base de Datos Conectada (${rows.length} usuarios en store.json)`;
    }
    content.appendChild(
      table(
        [
          { label: 'Nombre / Operador', render: (u) => `${u.name || 'Operador'} (@${u.handle || 'user'})` },
          { label: 'Correo', key: 'email' },
          { label: 'Documento', render: (u) => `${u.docType || 'CC'} ${u.docNumber || 'No registrado'}` },
          { label: 'Teléfono', key: 'phone' },
          { label: 'Institución / Cargo', render: (u) => `${u.institution || 'Independiente'} • ${u.occupation || 'DevOps'}` },
          { label: 'XP', render: (u) => `${Number(u.xp || 0).toLocaleString()} XP` },
          {
            label: 'Plan Activo',
            render: (u) => {
              const select = el('select');
              ['free', 'pro', 'team'].forEach((p) => {
                const opt = el('option', p === 'free' ? 'Cadet (Free)' : p === 'pro' ? 'Pro Operator' : 'Cyber Squad');
                opt.value = p;
                opt.selected = u.plan === p;
                select.appendChild(opt);
              });
              select.addEventListener('change', async () => {
                await api('/api/admin/users', {
                  method: 'PUT',
                  body: JSON.stringify({ id: u.id || u.email, plan: select.value })
                });
                u.plan = select.value;
                showToast(`Plan de ${u.email} cambiado a ${select.value.toUpperCase()}`);
              });
              return select;
            }
          },
          { label: 'Fecha Registro', render: (u) => date(u.createdAt) },
          {
            label: 'Acciones (CRUD)',
            render: (u) => {
              const cell = el('div', undefined, 'actions-cell');

              const editBtn = el('button', '✏️ Editar', 'btn-secondary btn-sm');
              editBtn.onclick = () => openEditUserModal(u);

              const delBtn = el('button', '🗑️', 'btn-danger btn-sm');
              delBtn.title = 'Eliminar usuario';
              delBtn.onclick = async () => {
                if (!window.confirm(`¿Estás seguro de eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return;
                await api('/api/admin/users', {
                  method: 'DELETE',
                  body: JSON.stringify({ id: u.id, email: u.email })
                });
                showToast(`Usuario ${u.email} eliminado`);
                loadTab('users');
              };

              cell.appendChild(editBtn);
              cell.appendChild(delBtn);
              return cell;
            }
          }
        ],
        rows,
        'No hay usuarios registrados todavía. ¡Haz clic en "➕ Nuevo Usuario" para crear el primero!'
      )
    );
  }

  // 2. PESTAÑA PAGOS (CRUD COMPLETO)
  else if (currentTab === 'payments') {
    content.appendChild(
      table(
        [
          { label: 'Fecha', render: (p) => date(p.createdAt) },
          { label: 'Usuario / Correo', render: (p) => p.buyerEmail || p.userEmail || 'No especificado' },
          { label: 'Doc. Pagador', key: 'buyerDoc' },
          { label: 'Plan Adquirido', render: (p) => p.planName || p.planId || 'Pro Operator' },
          { label: 'Método de Pago', render: (p) => p.methodLabel || p.method || 'Nequi / PSE' },
          { label: 'Referencia / CUS', render: (p) => `${p.reference} / ${p.cus || '-'}` },
          {
            label: 'Estado',
            render: (p) => {
              const badge = el('span', p.status === 'approved' ? 'Aprobado ✔' : p.status.toUpperCase(), `badge ${p.status === 'approved' ? 'badge-approved' : 'badge-revoked'}`);
              return badge;
            }
          },
          { label: 'Valor COP', render: (p) => money(p.amountCOP) },
          {
            label: 'Acciones',
            render: (p) => {
              const cell = el('div', undefined, 'actions-cell');

              const editBtn = el('button', '✏️ Editar', 'btn-secondary btn-sm');
              editBtn.onclick = () => openEditPaymentModal(p);

              const delBtn = el('button', '🗑️', 'btn-danger btn-sm');
              delBtn.title = 'Eliminar comprobante';
              delBtn.onclick = async () => {
                if (!window.confirm(`¿Eliminar pago de referencia ${p.reference}?`)) return;
                await api('/api/admin/payments', {
                  method: 'DELETE',
                  body: JSON.stringify({ id: p.id, reference: p.reference })
                });
                showToast(`Pago ${p.reference} eliminado`);
                loadTab('payments');
              };

              cell.appendChild(editBtn);
              cell.appendChild(delBtn);
              return cell;
            }
          }
        ],
        rows,
        'No hay pagos registrados todavía en la base de datos.'
      )
    );
  }

  // 3. PESTAÑA CERTIFICADOS (CRUD COMPLETO)
  else if (currentTab === 'certificates') {
    content.appendChild(
      table(
        [
          { label: 'Código Único', render: (c) => el('strong', c.certificateId, 'text-neonCyan') },
          { label: 'Titular / Estudiante', key: 'recipientName' },
          { label: 'Documento', key: 'recipientDoc' },
          { label: 'Correo', key: 'recipientEmail' },
          { label: 'Programa Aprobado', key: 'achievementTitle' },
          { label: 'Rango & XP', render: (c) => `${c.rankTitle || 'DevOps Ninja'} (${c.xpTotal || 0} XP)` },
          { label: 'Fecha Emisión', render: (c) => c.dateFormatted || date(c.issuedAt) },
          {
            label: 'Estado',
            render: (c) => {
              return el('span', c.revoked ? 'Revocado ✖' : 'Vigente ✔', `badge ${c.revoked ? 'badge-revoked' : 'badge-approved'}`);
            }
          },
          {
            label: 'Acciones',
            render: (c) => {
              const cell = el('div', undefined, 'actions-cell');

              const toggleBtn = el('button', c.revoked ? 'Restaurar' : 'Revocar', 'btn-outline btn-sm');
              toggleBtn.onclick = async () => {
                await api('/api/admin/certificates', {
                  method: 'PUT',
                  body: JSON.stringify({ certificateId: c.certificateId, revoked: !c.revoked })
                });
                c.revoked = !c.revoked;
                showToast(`Certificado ${c.certificateId} actualizado (revocado=${c.revoked})`);
                renderTable();
              };

              const editBtn = el('button', '✏️', 'btn-secondary btn-sm');
              editBtn.title = 'Editar datos';
              editBtn.onclick = () => openEditCertModal(c);

              const delBtn = el('button', '🗑️', 'btn-danger btn-sm');
              delBtn.title = 'Eliminar certificado';
              delBtn.onclick = async () => {
                if (!window.confirm(`¿Eliminar definitivamente el certificado ${c.certificateId}?`)) return;
                await api('/api/admin/certificates', {
                  method: 'DELETE',
                  body: JSON.stringify({ certificateId: c.certificateId })
                });
                showToast(`Certificado ${c.certificateId} eliminado`);
                loadTab('certificates');
              };

              cell.appendChild(toggleBtn);
              cell.appendChild(editBtn);
              cell.appendChild(delBtn);
              return cell;
            }
          }
        ],
        rows,
        'No hay certificados emitidos todavía. ¡Haz clic en "➕ Emitir Certificado"!'
      )
    );
  }

  // 4. PESTAÑA OPINIONES (FEEDBACK DE CLIENTES)
  else if (currentTab === 'feedback') {
    const emailCard = el('div', undefined, 'stat');
    emailCard.style.maxWidth = '100%';
    emailCard.style.marginBottom = '20px';
    emailCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h3 style="color:#00ff66; margin:0 0 4px 0; font-size:15px;">📬 Correo Receptor de Opiniones del Administrador</h3>
          <p style="font-size:12px; color:#94a3b8; margin:0;">
            Las opiniones, sugerencias y calificaciones enviadas por los estudiantes en la plataforma se remitirán a esta dirección.
          </p>
        </div>
        <form id="form-save-admin-email" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input
            id="admin-email-input"
            type="email"
            required
            value="${escapeHTML(cachedAdminEmailConfig || 'soporteshelldojo@gmail.com')}"
            style="background:#05080c; border:1px solid #1f2f45; border-radius:6px; color:#fff; padding:8px 12px; font-size:13px; min-width:260px;"
          />
          <button type="submit" class="btn-primary" style="padding:8px 16px; font-size:13px;">Guardar Correo</button>
        </form>
      </div>
    `;
    content.appendChild(emailCard);

    emailCard.querySelector('#form-save-admin-email')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = emailCard.querySelector('#admin-email-input')?.value.trim();
      if (!newEmail) return;
      await api('/api/admin/email-config', {
        method: 'POST',
        body: JSON.stringify({ adminEmail: newEmail })
      });
      cachedAdminEmailConfig = newEmail;
      showToast(`Correo de notificaciones guardado: ${newEmail}`);
    });

    content.appendChild(
      table(
        [
          { label: 'Fecha', render: (f) => date(f.createdAt) },
          {
            label: 'Calificación',
            render: (f) => {
              const stars = '★'.repeat(f.rating || 5) + '☆'.repeat(5 - (f.rating || 5));
              const span = el('span', `${stars} (${f.rating || 5}/5)`);
              span.style.color = '#ffb000';
              span.style.fontWeight = 'bold';
              return span;
            }
          },
          { label: 'Nombre / Estudiante', render: (f) => f.name || 'Anónimo' },
          { label: 'Correo', render: (f) => f.email || 'No proporcionado' },
          {
            label: 'Categoría',
            render: (f) => el('span', f.category || 'General', 'badge badge-approved')
          },
          {
            label: 'Mensaje / Opinión',
            render: (f) => {
              const p = el('p', f.message || '');
              p.style.maxWidth = '320px';
              p.style.fontSize = '12px';
              p.style.margin = '0';
              p.style.whiteSpace = 'pre-wrap';
              return p;
            }
          },
          {
            label: 'Estado',
            render: (f) => {
              return el('span', f.read ? 'Leído' : 'Nuevo ✨', `badge ${f.read ? '' : 'badge-approved'}`);
            }
          },
          {
            label: 'Acciones',
            render: (f) => {
              const cell = el('div', undefined, 'actions-cell');

              if (f.email) {
                const replyBtn = el('a', '✉️ Responder', 'btn-secondary btn-sm');
                replyBtn.href = `mailto:${encodeURIComponent(f.email)}?subject=${encodeURIComponent('Respuesta a tu opinión en ShellDojo')}`;
                replyBtn.target = '_blank';
                cell.appendChild(replyBtn);
              }

              const toggleBtn = el('button', f.read ? 'Marcar No Leído' : 'Marcar Leído', 'btn-secondary btn-sm');
              toggleBtn.onclick = async () => {
                await api('/api/admin/feedback', {
                  method: 'PUT',
                  body: JSON.stringify({ id: f.id, read: !f.read })
                });
                f.read = !f.read;
                showToast(`Opinión actualizada`);
                renderTable();
              };
              cell.appendChild(toggleBtn);

              const delBtn = el('button', '🗑️', 'btn-danger btn-sm');
              delBtn.title = 'Eliminar opinión';
              delBtn.onclick = async () => {
                if (!window.confirm(`¿Eliminar la opinión de "${f.name}"?`)) return;
                await api('/api/admin/feedback', {
                  method: 'DELETE',
                  body: JSON.stringify({ id: f.id })
                });
                showToast(`Opinión eliminada`);
                loadTab('feedback');
              };
              cell.appendChild(delBtn);

              return cell;
            }
          }
        ],
        rows,
        'No hay opiniones registradas todavía. Los comentarios dejados por los estudiantes en la plataforma aparecerán aquí.'
      )
    );
  }
}

// Carga de Pestañas
async function loadTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  search.value = '';
  toolbarActions.replaceChildren();
  content.replaceChildren();

  // Configuración de la barra de acciones según la pestaña
  if (tab === 'users') {
    search.hidden = false;
    search.placeholder = '🔍 Buscar usuario por nombre, correo o cédula...';
    const newBtn = el('button', '➕ Nuevo Usuario', 'btn-primary');
    newBtn.onclick = openCreateUserModal;
    toolbarActions.appendChild(newBtn);
  } else if (tab === 'payments') {
    search.hidden = false;
    search.placeholder = '🔍 Buscar pago por referencia, correo o método...';
    const newBtn = el('button', '➕ Registrar Pago', 'btn-primary');
    newBtn.onclick = openCreatePaymentModal;
    toolbarActions.appendChild(newBtn);
  } else if (tab === 'certificates') {
    search.hidden = false;
    search.placeholder = '🔍 Buscar certificado por código o titular...';
    const newBtn = el('button', '➕ Emitir Certificado', 'btn-primary');
    newBtn.onclick = openCreateCertModal;
    toolbarActions.appendChild(newBtn);
  } else if (tab === 'feedback') {
    search.hidden = false;
    search.placeholder = '🔍 Buscar opiniones por nombre, correo o mensaje...';
  } else {
    search.hidden = true;
  }

  try {
    // 1. Resumen / Stats
    if (tab === 'stats') {
      const s = await api('/api/admin/stats');
      const grid = el('div', undefined, 'stats');
      [
        ['Usuarios Totales', s.totalUsers || 0],
        ['Nuevos (Últimos 7 días)', s.newUsers7d || 0],
        ['Plan Cadet (Gratis)', s.byPlan?.free || 0],
        ['Plan Pro Operator', s.byPlan?.pro || 0],
        ['Plan Cyber Squad', s.byPlan?.team || 0],
        ['Pagos Aprobados', s.totalPayments || 0],
        ['Ingresos Totales COP', money(s.revenueCOP)],
        ['Certificados Válidos', s.totalCertificates || 0],
        ['Opiniones de Clientes', s.totalFeedback || 0],
        ['Calificación Promedio', s.averageRating ? `${s.averageRating} / 5 ⭐` : '5.0 / 5 ⭐']
      ].forEach(([label, value]) => {
        const box = el('div', undefined, 'stat');
        box.appendChild(el('span', label));
        box.appendChild(el('strong', String(value)));
        grid.appendChild(box);
      });
      content.appendChild(grid);

      const usersTitleBox = el('div');
      usersTitleBox.style.display = 'flex';
      usersTitleBox.style.justifyContent = 'space-between';
      usersTitleBox.style.alignItems = 'center';
      usersTitleBox.style.marginTop = '24px';
      usersTitleBox.style.marginBottom = '12px';

      const h3 = el('h3', '👥 Perfiles Registrados en la Base de Datos');
      h3.style.margin = '0';
      h3.style.color = '#00ff66';
      h3.style.fontSize = '16px';
      usersTitleBox.appendChild(h3);

      const viewUsersBtn = el('button', 'Gestionar Usuarios ➜', 'btn-primary btn-sm');
      viewUsersBtn.onclick = () => loadTab('users');
      usersTitleBox.appendChild(viewUsersBtn);

      content.appendChild(usersTitleBox);

      const usersList = await api('/api/admin/users').catch(() => []);
      content.appendChild(
        table(
          [
            { label: 'Nombre / Operador', render: (u) => `${u.name || 'Operador'} (@${u.handle || 'user'})` },
            { label: 'Correo', key: 'email' },
            { label: 'Documento', render: (u) => `${u.docType || 'CC'} ${u.docNumber || 'No registrado'}` },
            { label: 'Plan Activo', render: (u) => String(u.plan || 'free').toUpperCase() },
            { label: 'XP', render: (u) => `${Number(u.xp || 0).toLocaleString()} XP` },
            { label: 'Fecha Registro', render: (u) => date(u.createdAt) }
          ],
          usersList,
          'No hay usuarios registrados todavía.'
        )
      );
      return;
    }

    // 2. Opiniones y Buzón de Clientes
    if (tab === 'feedback') {
      const emailCfg = await api('/api/admin/email-config');
      cachedAdminEmailConfig = emailCfg?.adminEmail || 'admin@shelldojo.io';
      const list = await api('/api/admin/feedback');
      currentRows = Array.isArray(list) ? list : [];
      renderTable();
      return;
    }

    // 2. Base de Datos / Respaldo
    if (tab === 'settings') {
      const store = await api('/api/admin/backup');
      const box = el('div', undefined, 'stat');
      box.style.maxWidth = '800px';

      box.innerHTML = `
        <h3 style="color:#00ff66; margin-top:0;">⚙️ Mantenimiento de Base de Datos (store.json)</h3>
        <p style="font-size:13px; color:#cbd5e1;">
          Aquí puedes descargar una copia de seguridad íntegra de la base de datos o forzar una sincronización con los datos que hayan sido ingresados desde el navegador.
        </p>
        <div style="display:flex; gap:12px; margin:20px 0; flex-wrap:wrap;">
          <button id="btn-download-db" class="btn-primary">💾 Descargar store.json (Backup)</button>
          <button id="btn-resync-db" class="btn-outline">🔄 Sincronizar con Almacenamiento Local</button>
        </div>
        <label>Visualizador en vivo de la Base de Datos (JSON)</label>
        <pre style="background:#05080c; border:1px solid #1f2f45; border-radius:8px; padding:16px; font-size:12px; max-height:400px; overflow:auto; color:#00e5ff;">${JSON.stringify(store, null, 2)}</pre>
      `;

      content.appendChild(box);

      document.getElementById('btn-download-db')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shelldojo-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });

      document.getElementById('btn-resync-db')?.addEventListener('click', async () => {
        await syncLocalWithBackend();
        loadTab('settings');
      });
      return;
    }

    currentRows = await api(`/api/admin/${tab}`);
    renderTable();
  } catch (err) {
    content.appendChild(el('div', err.message, 'empty'));
  }
}

/* --------------------------- MODALES CRUD --------------------------- */

function openModal(title, fieldsHTML, onSubmit) {
  modalTitle.textContent = title;
  modalFields.innerHTML = fieldsHTML;
  crudModal.hidden = false;

  crudForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit();
      crudModal.hidden = true;
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };
}

modalCloseBtn.onclick = () => { crudModal.hidden = true; };
modalCancelBtn.onclick = () => { crudModal.hidden = true; };

// Modal: Crear Usuario
function openCreateUserModal() {
  const fields = `
    <div>
      <label>Nombre Completo *</label>
      <input id="f-user-name" type="text" required placeholder="Ej: Camilo Torres" />
    </div>
    <div>
      <label>Handle / Nickname *</label>
      <input id="f-user-handle" type="text" required placeholder="Ej: camilo_dev" />
    </div>
    <div class="full-width">
      <label>Correo Electrónico *</label>
      <input id="f-user-email" type="email" required placeholder="correo@ejemplo.com" />
    </div>
    <div>
      <label>Tipo de Documento</label>
      <select id="f-user-doctype">
        <option value="CC">Cédula de Ciudadanía (CC)</option>
        <option value="TI">Tarjeta de Identidad (TI)</option>
        <option value="CE">Cédula de Extranjería (CE)</option>
        <option value="PASAPORTE">Pasaporte</option>
      </select>
    </div>
    <div>
      <label>Número de Documento</label>
      <input id="f-user-docnum" type="text" placeholder="Ej: 1020845912" />
    </div>
    <div>
      <label>Teléfono / WhatsApp</label>
      <input id="f-user-phone" type="text" placeholder="Ej: 3001234567" />
    </div>
    <div>
      <label>País</label>
      <input id="f-user-country" type="text" value="Colombia" />
    </div>
    <div>
      <label>Universidad / Empresa</label>
      <input id="f-user-inst" type="text" placeholder="Ej: SENA / Universidad Nacional" />
    </div>
    <div>
      <label>Rol Profesional</label>
      <input id="f-user-occ" type="text" placeholder="Ej: Desarrollador Backend / DevOps" />
    </div>
    <div>
      <label>Plan Inicial</label>
      <select id="f-user-plan">
        <option value="free">Cadet (Gratis)</option>
        <option value="pro">Pro Operator ($29.900 COP)</option>
        <option value="team">Cyber Squad ($99.900 COP)</option>
      </select>
    </div>
    <div>
      <label>XP Inicial</label>
      <input id="f-user-xp" type="number" value="0" min="0" />
    </div>
  `;

  openModal('➕ Crear Nuevo Usuario en la Base de Datos', fields, async () => {
    const payload = {
      name: document.getElementById('f-user-name').value,
      handle: document.getElementById('f-user-handle').value,
      email: document.getElementById('f-user-email').value,
      docType: document.getElementById('f-user-doctype').value,
      docNumber: document.getElementById('f-user-docnum').value,
      phone: document.getElementById('f-user-phone').value,
      country: document.getElementById('f-user-country').value,
      institution: document.getElementById('f-user-inst').value,
      occupation: document.getElementById('f-user-occ').value,
      plan: document.getElementById('f-user-plan').value,
      xp: Number(document.getElementById('f-user-xp').value || 0)
    };

    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`Usuario ${payload.email} creado con éxito`);
    loadTab('users');
  });
}

// Modal: Editar Usuario
function openEditUserModal(u) {
  const fields = `
    <div>
      <label>Nombre Completo</label>
      <input id="f-user-name" type="text" value="${u.name || ''}" required />
    </div>
    <div>
      <label>Handle / Nickname</label>
      <input id="f-user-handle" type="text" value="${u.handle || ''}" required />
    </div>
    <div class="full-width">
      <label>Correo Electrónico</label>
      <input id="f-user-email" type="email" value="${u.email || ''}" required />
    </div>
    <div>
      <label>Tipo de Documento</label>
      <select id="f-user-doctype">
        <option value="CC" ${u.docType === 'CC' ? 'selected' : ''}>Cédula (CC)</option>
        <option value="TI" ${u.docType === 'TI' ? 'selected' : ''}>Tarjeta Identidad (TI)</option>
        <option value="CE" ${u.docType === 'CE' ? 'selected' : ''}>Cédula Extranjería (CE)</option>
        <option value="PASAPORTE" ${u.docType === 'PASAPORTE' ? 'selected' : ''}>Pasaporte</option>
      </select>
    </div>
    <div>
      <label>Número de Documento</label>
      <input id="f-user-docnum" type="text" value="${u.docNumber || ''}" />
    </div>
    <div>
      <label>Teléfono</label>
      <input id="f-user-phone" type="text" value="${u.phone || ''}" />
    </div>
    <div>
      <label>País</label>
      <input id="f-user-country" type="text" value="${u.country || 'Colombia'}" />
    </div>
    <div>
      <label>Universidad / Empresa</label>
      <input id="f-user-inst" type="text" value="${u.institution || ''}" />
    </div>
    <div>
      <label>Rol Profesional</label>
      <input id="f-user-occ" type="text" value="${u.occupation || ''}" />
    </div>
    <div>
      <label>Plan de Suscripción</label>
      <select id="f-user-plan">
        <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Cadet (Gratis)</option>
        <option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Pro Operator</option>
        <option value="team" ${u.plan === 'team' ? 'selected' : ''}>Cyber Squad</option>
      </select>
    </div>
    <div>
      <label>XP Acumulada</label>
      <input id="f-user-xp" type="number" value="${u.xp || 0}" min="0" />
    </div>
  `;

  openModal(`✏️ Editar Usuario: ${u.email}`, fields, async () => {
    const payload = {
      id: u.id,
      name: document.getElementById('f-user-name').value,
      handle: document.getElementById('f-user-handle').value,
      email: document.getElementById('f-user-email').value,
      docType: document.getElementById('f-user-doctype').value,
      docNumber: document.getElementById('f-user-docnum').value,
      phone: document.getElementById('f-user-phone').value,
      country: document.getElementById('f-user-country').value,
      institution: document.getElementById('f-user-inst').value,
      occupation: document.getElementById('f-user-occ').value,
      plan: document.getElementById('f-user-plan').value,
      xp: Number(document.getElementById('f-user-xp').value || 0)
    };

    await api('/api/admin/users', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast(`Usuario ${payload.email} actualizado`);
    loadTab('users');
  });
}

// Modal: Crear Pago
function openCreatePaymentModal() {
  const fields = `
    <div>
      <label>Referencia de Pago *</label>
      <input id="f-pay-ref" type="text" value="PAY-${Date.now().toString().slice(-6)}" required />
    </div>
    <div>
      <label>Código CUS / Autorización</label>
      <input id="f-pay-cus" type="text" value="CUS-${Math.floor(100000 + Math.random() * 900000)}" />
    </div>
    <div class="full-width">
      <label>Correo del Comprador</label>
      <input id="f-pay-email" type="email" placeholder="usuario@correo.com" />
    </div>
    <div>
      <label>Documento de Identidad</label>
      <input id="f-pay-doc" type="text" placeholder="CC 1020..." />
    </div>
    <div>
      <label>Método de Pago</label>
      <select id="f-pay-method">
        <option value="Nequi Push">Nequi</option>
        <option value="Débito PSE">PSE</option>
        <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
        <option value="Billetera DaviPlata">DaviPlata</option>
      </select>
    </div>
    <div>
      <label>Plan</label>
      <select id="f-pay-plan">
        <option value="pro">Pro Operator ($29.900 COP)</option>
        <option value="team">Cyber Squad ($99.900 COP)</option>
      </select>
    </div>
    <div>
      <label>Monto en COP ($)</label>
      <input id="f-pay-amount" type="number" value="29900" required />
    </div>
    <div class="full-width">
      <label>Estado de la Transacción</label>
      <select id="f-pay-status">
        <option value="approved">Aprobado (approved)</option>
        <option value="pending">Pendiente (pending)</option>
        <option value="rejected">Rechazado (rejected)</option>
      </select>
    </div>
  `;

  openModal('➕ Registrar Pago Manual en la Base de Datos', fields, async () => {
    const payload = {
      reference: document.getElementById('f-pay-ref').value,
      cus: document.getElementById('f-pay-cus').value,
      buyerEmail: document.getElementById('f-pay-email').value,
      buyerDoc: document.getElementById('f-pay-doc').value,
      methodLabel: document.getElementById('f-pay-method').value,
      planId: document.getElementById('f-pay-plan').value,
      planName: document.getElementById('f-pay-plan').value === 'pro' ? 'Pro Operator' : 'Cyber Squad',
      amountCOP: Number(document.getElementById('f-pay-amount').value || 0),
      status: document.getElementById('f-pay-status').value
    };

    await api('/api/admin/payments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`Pago ${payload.reference} registrado exitosamente`);
    loadTab('payments');
  });
}

// Modal: Editar Pago
function openEditPaymentModal(p) {
  const fields = `
    <div>
      <label>Referencia</label>
      <input id="f-pay-ref" type="text" value="${p.reference || ''}" readonly />
    </div>
    <div>
      <label>Estado</label>
      <select id="f-pay-status">
        <option value="approved" ${p.status === 'approved' ? 'selected' : ''}>Aprobado (approved)</option>
        <option value="pending" ${p.status === 'pending' ? 'selected' : ''}>Pendiente (pending)</option>
        <option value="rejected" ${p.status === 'rejected' ? 'selected' : ''}>Rechazado (rejected)</option>
        <option value="refunded" ${p.status === 'refunded' ? 'selected' : ''}>Reembolsado (refunded)</option>
      </select>
    </div>
    <div>
      <label>Valor en COP ($)</label>
      <input id="f-pay-amount" type="number" value="${p.amountCOP || 0}" />
    </div>
    <div>
      <label>Método de Pago</label>
      <input id="f-pay-method" type="text" value="${p.methodLabel || p.method || ''}" />
    </div>
    <div class="full-width">
      <label>Correo Comprador</label>
      <input id="f-pay-email" type="email" value="${p.buyerEmail || ''}" />
    </div>
  `;

  openModal(`✏️ Editar Transacción: ${p.reference}`, fields, async () => {
    const payload = {
      id: p.id,
      reference: p.reference,
      status: document.getElementById('f-pay-status').value,
      amountCOP: Number(document.getElementById('f-pay-amount').value || 0),
      methodLabel: document.getElementById('f-pay-method').value,
      buyerEmail: document.getElementById('f-pay-email').value
    };

    await api('/api/admin/payments', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast(`Pago ${p.reference} actualizado`);
    loadTab('payments');
  });
}

// Modal: Crear Certificado
function openCreateCertModal() {
  const certId = `SDJ-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const fields = `
    <div>
      <label>Código del Certificado</label>
      <input id="f-cert-id" type="text" value="${certId}" required />
    </div>
    <div>
      <label>Nombre del Titular *</label>
      <input id="f-cert-name" type="text" required placeholder="Nombre del graduado" />
    </div>
    <div>
      <label>Documento de Identidad</label>
      <input id="f-cert-doc" type="text" placeholder="CC 1020845912" />
    </div>
    <div>
      <label>Correo Electrónico</label>
      <input id="f-cert-email" type="email" placeholder="titular@correo.com" />
    </div>
    <div>
      <label>Institución / Empresa</label>
      <input id="f-cert-inst" type="text" value="Academia ShellDojo" />
    </div>
    <div>
      <label>Rango Obtenido</label>
      <input id="f-cert-rank" type="text" value="DevOps Ninja" />
    </div>
    <div class="full-width">
      <label>Programa / Certificación *</label>
      <input id="f-cert-title" type="text" value="Dominio Táctico de Terminal & Operaciones CLI" required />
    </div>
    <div>
      <label>XP Total</label>
      <input id="f-cert-xp" type="number" value="750" />
    </div>
    <div>
      <label>Estado</label>
      <select id="f-cert-revoked">
        <option value="false">Vigente (Válido)</option>
        <option value="true">Revocado (No Válido)</option>
      </select>
    </div>
  `;

  openModal('➕ Emitir Nuevo Diploma Oficial en la Base de Datos', fields, async () => {
    const payload = {
      certificateId: document.getElementById('f-cert-id').value,
      recipientName: document.getElementById('f-cert-name').value,
      recipientDoc: document.getElementById('f-cert-doc').value,
      recipientEmail: document.getElementById('f-cert-email').value,
      institution: document.getElementById('f-cert-inst').value,
      rankTitle: document.getElementById('f-cert-rank').value,
      achievementTitle: document.getElementById('f-cert-title').value,
      xpTotal: Number(document.getElementById('f-cert-xp').value || 0),
      revoked: document.getElementById('f-cert-revoked').value === 'true'
    };

    await api('/api/admin/certificates', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`Certificado ${payload.certificateId} emitido`);
    loadTab('certificates');
  });
}

// Modal: Editar Certificado
function openEditCertModal(c) {
  const fields = `
    <div>
      <label>Código</label>
      <input id="f-cert-id" type="text" value="${c.certificateId}" readonly />
    </div>
    <div>
      <label>Titular</label>
      <input id="f-cert-name" type="text" value="${c.recipientName || ''}" required />
    </div>
    <div>
      <label>Documento</label>
      <input id="f-cert-doc" type="text" value="${c.recipientDoc || ''}" />
    </div>
    <div>
      <label>Correo</label>
      <input id="f-cert-email" type="email" value="${c.recipientEmail || ''}" />
    </div>
    <div class="full-width">
      <label>Programa / Título</label>
      <input id="f-cert-title" type="text" value="${c.achievementTitle || ''}" required />
    </div>
    <div>
      <label>Institución</label>
      <input id="f-cert-inst" type="text" value="${c.institution || ''}" />
    </div>
    <div>
      <label>Estado</label>
      <select id="f-cert-revoked">
        <option value="false" ${!c.revoked ? 'selected' : ''}>Vigente (Válido)</option>
        <option value="true" ${c.revoked ? 'selected' : ''}>Revocado (No Válido)</option>
      </select>
    </div>
  `;

  openModal(`✏️ Editar Certificado: ${c.certificateId}`, fields, async () => {
    const payload = {
      certificateId: c.certificateId,
      recipientName: document.getElementById('f-cert-name').value,
      recipientDoc: document.getElementById('f-cert-doc').value,
      recipientEmail: document.getElementById('f-cert-email').value,
      achievementTitle: document.getElementById('f-cert-title').value,
      institution: document.getElementById('f-cert-inst').value,
      revoked: document.getElementById('f-cert-revoked').value === 'true'
    };

    await api('/api/admin/certificates', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast(`Certificado ${c.certificateId} actualizado`);
    loadTab('certificates');
  });
}

/* --------------------------- INICIALIZACIÓN --------------------------- */

// Formulario de Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('login-error');
  errorBox.hidden = true;

  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass })
    });
    if (res && res.token) {
      sessionStorage.setItem('sd_admin_token', res.token);
    }
    sessionStorage.setItem('sd_admin_session', 'active');
    document.getElementById('login-pass').value = '';
    showPanel();
  } catch (err) {
    errorBox.textContent = err.message || 'Usuario o contraseña incorrectos. Usa: admin / admin123';
    errorBox.hidden = false;
  }
});

// Pestañas
document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.dataset?.tab;
  if (tab) loadTab(tab);
});

// Botón Sincronizar en barra superior
document.getElementById('btn-sync-all')?.addEventListener('click', async () => {
  await syncLocalWithBackend();
  loadTab(currentTab);
});

// Función de inicio de sesión
async function doLogin(user, pass) {
  const errorBox = document.getElementById('login-error');
  if (errorBox) errorBox.hidden = true;
  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass })
    });
    if (res && res.token) {
      sessionStorage.setItem('sd_admin_token', res.token);
    }
    sessionStorage.setItem('sd_admin_session', 'active');
    showPanel();
    showToast('Bienvenido al Centro de Control de ShellDojo');
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message || 'Usuario o contraseña incorrectos. Verifica tus credenciales de acceso.';
      errorBox.hidden = false;
    }
  }
}

// Formulario de Login
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user')?.value.trim();
  const pass = document.getElementById('login-pass')?.value.trim();
  if (!user || !pass) {
    const errorBox = document.getElementById('login-error');
    if (errorBox) {
      errorBox.textContent = 'Por favor ingresa tu usuario y contraseña.';
      errorBox.hidden = false;
    }
    return;
  }
  await doLogin(user, pass);
});

// 3. Botón Cerrar Sesión
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  sessionStorage.removeItem('sd_admin_session');
  sessionStorage.removeItem('sd_admin_token');
  showLogin();
  showToast('Has cerrado la sesión del Centro de Control');
});

// Buscador
search.addEventListener('input', renderTable);

// 4. Verificación de sesión al iniciar
api('/api/admin/me')
  .then(showPanel)
  .catch(() => {
    sessionStorage.removeItem('sd_admin_session');
    sessionStorage.removeItem('sd_admin_token');
    showLogin();
  });

// Auto-refresco en vivo del Centro de Control cada 4 segundos o al volver a la pestaña
window.addEventListener('focus', () => {
  if (currentTab) loadTab(currentTab);
});

setInterval(() => {
  if (document.visibilityState === 'visible' && crudModal.hidden) {
    if (currentTab === 'users' || currentTab === 'stats' || currentTab === 'feedback' || currentTab === 'payments') {
      loadTab(currentTab);
    }
  }
}, 4000);
