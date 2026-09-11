/* =============================================================
   รายการใบขอจัดซื้อ + กล่อง "รอคุณอยู่"

   กล่องบนสุดคือสิ่งที่ค้างอยู่ที่ตัวผู้ใช้เอง ตามบทบาทที่เขามี
   ถ้าไม่มีอะไรค้าง กล่องจะไม่ขึ้นเลย ไม่รบกวนสายตา
   ============================================================= */
import {
  sb, requireSession, me, can, appbar, listPR, esc, baht, thDate,
  DOC_TYPE_LABEL, STATUS_LABEL, isAsset
} from './db.js';

await requireSession();
const profile = await me();
document.getElementById('bar').innerHTML = appbar(profile, 'index.html');

const listEl  = document.getElementById('list');
const todoEl  = document.getElementById('todo');
const scopeEl = document.getElementById('scope');
const qEl     = document.getElementById('q');

if (!profile?.active || !profile?.department_id) {
  document.getElementById('newbtn').style.display = 'none';
  listEl.innerHTML = `<div class="notebox">
    บัญชีนี้ยังไม่ได้กำหนดฝ่ายหรือสิทธิ์ — แจ้งแอดมินให้ตั้งค่าให้ก่อน จึงจะเปิดใบขอจัดซื้อได้</div>`;
} else {
  if (!can(profile, 'requester')) document.getElementById('newbtn').style.display = 'none';
  scopeEl.textContent = describeScope(profile);
  await refresh();
  let t;
  qEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 250); });
}

function describeScope(p) {
  const wide = ['admin', 'executive', 'exec_assistant', 'purchasing', 'asset_accountant', 'asset_admin']
    .some(r => can(p, r));
  if (wide) return 'เห็นใบทั้งหมดทุกฝ่าย';
  if (can(p, 'manager')) return `เห็นใบทั้งหมดของ${p.department?.name || 'ฝ่ายตัวเอง'}`;
  return `ใบของ${p.department?.name || 'ฝ่ายคุณ'}`;
}

async function refresh() {
  const q = qEl.value.trim() || null;
  let rows;
  try {
    rows = await listPR({ q });
  } catch (e) {
    listEl.innerHTML = `<div class="errbox">อ่านข้อมูลไม่สำเร็จ: ${esc(e.message)}</div>`;
    return;
  }
  renderTodo(rows);
  renderList(rows);
}

/* ---------------- รอคุณอยู่ ---------------- */

function renderTodo(rows) {
  const jobs = [];

  if (can(profile, 'it')) {
    const n = rows.filter(r => r.needs_it && !r.it_opinion && r.status === 'submitted').length;
    if (n) jobs.push(`<b>${n}</b> ใบรอฝ่าย IT ให้ความเห็น`);
  }
  if (can(profile, 'asset_accountant')) {
    const n = rows.filter(r => r.doc_type !== 'expense' && r.status === 'submitted').length;
    if (n) jobs.push(`<b>${n}</b> ใบสินทรัพย์รอคีย์รหัสสินทรัพย์`);
  }
  const mine = rows.filter(r => r.status === 'draft').length;
  if (mine) jobs.push(`<b>${mine}</b> ใบยังเป็นร่าง ยังไม่ได้ยื่น`);

  todoEl.innerHTML = jobs.length
    ? `<div class="notebox">รอคุณอยู่ — ${jobs.join(' · ')}</div>`
    : '';
}

/* ---------------- ตาราง ---------------- */

function renderList(rows) {
  if (!rows.length) {
    listEl.innerHTML = '<div class="tablebox"><p class="empty">ยังไม่มีใบขอจัดซื้อ</p></div>';
    return;
  }
  listEl.innerHTML = `
    <div class="tablebox">
      <table>
        <thead>
          <tr>
            <th>เลขที่เอกสาร</th>
            <th>ประเภท</th>
            <th>ฝ่าย / สาขา</th>
            <th>วันที่</th>
            <th class="num">ยอดหลังส่วนลด</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const st = STATUS_LABEL[r.status] || { t: r.status, c: 'st-mute' };
            const net = (Number(r.subtotal) || 0) - (Number(r.discount) || 0);
            return `
            <tr class="clickable" data-id="${r.id}">
              <td class="mono">${esc(r.doc_no || '— ร่าง —')}${r.rev ? ` <b>Rev.${r.rev}</b>` : ''}</td>
              <td>${esc(DOC_TYPE_LABEL[r.doc_type] || r.doc_type)}
                  ${r.needs_it ? `<span class="pill tag-it">IT${r.it_opinion ? ' ✓' : ' รอ'}</span>` : ''}</td>
              <td>${esc(r.department?.code || '')} ${esc(r.branch?.name || '')}</td>
              <td class="mono">${thDate(r.doc_date)}</td>
              <td class="num">${baht(net)}</td>
              <td><span class="pill ${st.c}">${esc(st.t)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  listEl.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => { location.href = `form.html?id=${tr.dataset.id}`; });
  });
}
