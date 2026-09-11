/* =============================================================
   ตั้งค่าระบบ — ผู้ใช้/สิทธิ์ · ฝ่าย · สาขา · หมวดสินค้า

   ทุกตารางแก้ในที่ กดออกจากช่องแล้วบันทึกทันที ไม่ต้องกดปุ่มบันทึกรวม
   ============================================================= */
import { sb, requireSession, me, can, appbar, esc } from './db.js';

const ROLES = [
  ['requester',        'ผู้ขอซื้อ'],
  ['manager',          'ผู้จัดการฝ่าย'],
  ['asset_admin',      'ธุรการสินทรัพย์'],
  ['asset_accountant', 'บัญชีสินทรัพย์'],
  ['it',               'ฝ่าย IT'],
  ['exec_assistant',   'ผู้ช่วยผู้บริหาร'],
  ['purchasing',       'จัดซื้อ'],
  ['executive',        'ผู้บริหาร (ดูอย่างเดียว)'],
  ['admin',            'แอดมิน']
];

await requireSession();
const profile = await me();
document.getElementById('bar').innerHTML = appbar(profile, 'admin.html');
const main = document.getElementById('main');

if (!can(profile, 'admin')) {
  main.innerHTML = '<div class="notebox">หน้านี้เปิดได้เฉพาะแอดมิน</div>';
} else {
  await render();
}

async function render() {
  const [users, depts, brs, cats] = await Promise.all([
    sb.from('profiles').select('*').order('created_at'),
    sb.from('departments').select('*').order('sort_order'),
    sb.from('branches').select('*').order('sort_order'),
    sb.from('item_categories').select('*').order('sort_order')
  ]);
  for (const r of [users, depts, brs, cats]) if (r.error) { main.innerHTML = `<div class="errbox">${esc(r.error.message)}</div>`; return; }

  main.innerHTML = `
    <div class="pagehead"><div>
      <h1>ตั้งค่าระบบ</h1>
      <p class="lead">แก้ในช่องแล้วคลิกที่อื่น ระบบบันทึกให้ทันที</p>
    </div></div>
    <div id="msg"></div>

    <section class="card">
      <h2>ผู้ใช้และสิทธิ์</h2>
      <div class="tablebox"><table>
        <thead><tr>
          <th>ชื่อ / อีเมล</th><th style="width:190px">ตำแหน่ง (พิมพ์ใต้ลายเซ็น)</th>
          <th style="width:170px">ฝ่าย</th><th>บทบาท</th><th style="width:70px">ใช้งาน</th>
        </tr></thead>
        <tbody>${users.data.map(u => `
          <tr data-user="${u.user_id}">
            <td><b>${esc(u.full_name || '—')}</b><br><span style="color:var(--ink-3);font-size:12px">${esc(u.email || '')}</span></td>
            <td><input class="u-pos" value="${esc(u.position_title || '')}" placeholder="เช่น ผู้จัดการฝ่าย IT"></td>
            <td><select class="u-dept">
              <option value="">— ยังไม่กำหนด —</option>
              ${depts.data.map(d => `<option value="${d.id}" ${u.department_id === d.id ? 'selected' : ''}>${esc(d.code)} ${esc(d.name)}</option>`).join('')}
            </select></td>
            <td><div class="radios" style="gap:8px 12px">${ROLES.map(([k, t]) => `
              <label style="font-size:12.5px"><input type="checkbox" class="u-role" value="${k}" ${
                (u.roles || []).includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></td>
            <td style="text-align:center"><input type="checkbox" class="u-active" ${u.active ? 'checked' : ''}></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </section>

    <section class="card">
      <h2>ฝ่าย / สายงาน</h2>
      <p class="lead" style="margin-bottom:12px">รหัสฝ่ายไปอยู่ในเลขเอกสาร · ผู้อนุมัติกำหนดว่าใบของฝ่ายนี้ขึ้นถึง CEO หรือ COO ·
        เลขเริ่มต้นใช้ตอนย้ายระบบ เพื่อให้รันต่อจากเล่มเดิมไม่ขาดช่วง</p>
      <div class="tablebox"><table>
        <thead><tr><th style="width:80px">รหัส</th><th>ชื่อฝ่าย</th>
          <th style="width:110px">ผู้อนุมัติ</th><th style="width:130px">Cost Center</th>
          <th class="num" style="width:110px">เลขเริ่มต้น</th><th style="width:70px">ใช้งาน</th></tr></thead>
        <tbody>${depts.data.map(d => `
          <tr data-dept="${d.id}">
            <td><input class="d-code" value="${esc(d.code)}" style="font-family:var(--mono)"></td>
            <td><input class="d-name" value="${esc(d.name)}"></td>
            <td><select class="d-appr">
              <option value="coo" ${d.approver === 'coo' ? 'selected' : ''}>COO</option>
              <option value="ceo" ${d.approver === 'ceo' ? 'selected' : ''}>CEO</option>
            </select></td>
            <td><input class="d-cc" value="${esc(d.cost_center || '')}"></td>
            <td><input class="d-seq" type="number" min="0" value="${d.seq_start}"></td>
            <td style="text-align:center"><input type="checkbox" class="d-active" ${d.active ? 'checked' : ''}></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="actions"><button class="btn quiet" id="adddept" type="button">+ เพิ่มฝ่าย</button></div>
    </section>

    <section class="card">
      <h2>สาขา / หน่วยงานที่ใช้ของ</h2>
      <p class="lead" style="margin-bottom:12px">รหัส 2 หลัก ไปอยู่ในเลขเอกสาร · <code>00</code> สงวนไว้สำหรับใบที่ซื้อให้หลายสาขาพร้อมกัน</p>
      <div class="tablebox"><table>
        <thead><tr><th style="width:80px">รหัส</th><th>ชื่อสาขา</th><th style="width:70px">ใช้งาน</th></tr></thead>
        <tbody>${brs.data.map(b => `
          <tr data-branch="${b.id}">
            <td><input class="b-code" value="${esc(b.code)}" maxlength="2" style="font-family:var(--mono)"></td>
            <td><input class="b-name" value="${esc(b.name)}"></td>
            <td style="text-align:center"><input type="checkbox" class="b-active" ${b.active ? 'checked' : ''}></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="actions"><button class="btn quiet" id="addbranch" type="button">+ เพิ่มสาขา</button></div>
    </section>

    <section class="card">
      <h2>หมวดสินค้า</h2>
      <p class="lead" style="margin-bottom:12px">หมวดที่ติ๊ก “เป็นของ IT” จะทำให้ใบติดธงต้องผ่านฝ่าย IT ให้อัตโนมัติ</p>
      <div class="tablebox"><table>
        <thead><tr><th>ชื่อหมวด</th><th style="width:110px">เป็นของ IT</th><th style="width:70px">ใช้งาน</th></tr></thead>
        <tbody>${cats.data.map(c => `
          <tr data-cat="${c.id}">
            <td><input class="c-name" value="${esc(c.name)}"></td>
            <td style="text-align:center"><input type="checkbox" class="c-it" ${c.is_it ? 'checked' : ''}></td>
            <td style="text-align:center"><input type="checkbox" class="c-active" ${c.active ? 'checked' : ''}></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="actions"><button class="btn quiet" id="addcat" type="button">+ เพิ่มหมวด</button></div>
    </section>`;

  wire();
}

/* ---------------- บันทึก ---------------- */

const msg = () => document.getElementById('msg');
const ok = t => { msg().innerHTML = `<div class="okbox">${esc(t)}</div>`; setTimeout(() => { msg().innerHTML = ''; }, 2200); };
const bad = e => { msg().innerHTML = `<div class="errbox">${esc(e.message || e)}</div>`; };

async function update(table, key, id, patch) {
  const { error } = await sb.from(table).update(patch).eq(key, id);
  if (error) bad(error); else ok('บันทึกแล้ว');
}

function wire() {
  // ผู้ใช้
  main.querySelectorAll('tr[data-user]').forEach(tr => {
    const uid = tr.dataset.user;
    const collectRoles = () => [...tr.querySelectorAll('.u-role:checked')].map(c => c.value);
    tr.querySelector('.u-pos').addEventListener('change', e => update('profiles', 'user_id', uid, { position_title: e.target.value || null }));
    tr.querySelector('.u-dept').addEventListener('change', e => update('profiles', 'user_id', uid, { department_id: e.target.value || null }));
    tr.querySelector('.u-active').addEventListener('change', e => update('profiles', 'user_id', uid, { active: e.target.checked }));
    tr.querySelectorAll('.u-role').forEach(c =>
      c.addEventListener('change', () => update('profiles', 'user_id', uid, { roles: collectRoles() })));
  });

  // ฝ่าย
  main.querySelectorAll('tr[data-dept]').forEach(tr => {
    const idv = tr.dataset.dept;
    const m = { '.d-code': 'code', '.d-name': 'name', '.d-appr': 'approver', '.d-cc': 'cost_center' };
    for (const [sel, col] of Object.entries(m))
      tr.querySelector(sel).addEventListener('change', e =>
        update('departments', 'id', idv, { [col]: e.target.value || null }));
    tr.querySelector('.d-seq').addEventListener('change', e =>
      update('departments', 'id', idv, { seq_start: Number(e.target.value) || 0 }));
    tr.querySelector('.d-active').addEventListener('change', e =>
      update('departments', 'id', idv, { active: e.target.checked }));
  });

  // สาขา
  main.querySelectorAll('tr[data-branch]').forEach(tr => {
    const idv = tr.dataset.branch;
    tr.querySelector('.b-code').addEventListener('change', e => update('branches', 'id', idv, { code: e.target.value }));
    tr.querySelector('.b-name').addEventListener('change', e => update('branches', 'id', idv, { name: e.target.value }));
    tr.querySelector('.b-active').addEventListener('change', e => update('branches', 'id', idv, { active: e.target.checked }));
  });

  // หมวดสินค้า
  main.querySelectorAll('tr[data-cat]').forEach(tr => {
    const idv = tr.dataset.cat;
    tr.querySelector('.c-name').addEventListener('change', e => update('item_categories', 'id', idv, { name: e.target.value }));
    tr.querySelector('.c-it').addEventListener('change', e => update('item_categories', 'id', idv, { is_it: e.target.checked }));
    tr.querySelector('.c-active').addEventListener('change', e => update('item_categories', 'id', idv, { active: e.target.checked }));
  });

  // เพิ่มแถว
  document.getElementById('adddept').addEventListener('click', () => add('departments',
    { code: prompt('รหัสฝ่าย (เช่น MK)')?.trim(), name: 'ฝ่ายใหม่', approver: 'coo', sort_order: 50 }));
  document.getElementById('addbranch').addEventListener('click', () => add('branches',
    { code: prompt('รหัสสาขา 2 หลัก (เช่น 07)')?.trim(), name: 'สาขาใหม่', sort_order: 50 }));
  document.getElementById('addcat').addEventListener('click', () => add('item_categories',
    { name: prompt('ชื่อหมวดสินค้า')?.trim(), is_it: false, sort_order: 50 }));
}

async function add(table, row) {
  const first = Object.values(row)[0];
  if (!first) return;
  const { error } = await sb.from(table).insert(row);
  if (error) return bad(error);
  await render();
}
