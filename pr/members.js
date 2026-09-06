/* =============================================================
   หน้าจัดการผู้ใช้ — เฉพาะสิทธิ์ admin
   ตั้ง ชื่อ / ตำแหน่ง / แผนก / รหัสฝ่าย / สิทธิ์ ให้คนที่สมัครเข้ามา

   รหัสฝ่าย (dept_code) สำคัญ เพราะเลขที่เอกสารออกจากค่านี้: PR-2026-IT-0001
   ============================================================= */
import { configured, requireSession, myMember, listMembers, updateMember } from './db.js';
import { topbar, note, friendlyError } from './ui.js';
import { esc, ROLE_LABEL } from './lib.js';

const bar = document.getElementById('bar');
const root = document.getElementById('root');

if (!configured) { root.innerHTML = `<div class="wrap">${note('bad','ยังไม่ได้ตั้งค่า pr/config.js')}</div>`; throw new Error('unconfigured'); }
if (!await requireSession()) throw new Error('no session');

const me = await myMember();
bar.innerHTML = topbar(me, 'members.html');

if (me.role !== 'admin') {
  root.innerHTML = `<div class="wrap">${note('bad','หน้านี้สำหรับผู้ดูแลระบบเท่านั้น')}</div>`;
  throw new Error('forbidden');
}

const rows = await listMembers();

root.innerHTML = `
  <div class="wrap">
    <div class="pagehead"><h1>จัดการผู้ใช้</h1></div>
    <div id="msg"></div>
    ${note('info', 'แก้ค่าในช่องแล้วกด <b>บันทึก</b> ในแถวนั้น — <b>รหัสฝ่าย</b> คือตัวย่อที่ใช้ในเลขที่เอกสาร เช่น IT, HR, MKT')}
    <div class="card" style="padding:0"><div class="scroll">
      <table class="tbl">
        <thead><tr>
          <th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>แผนก/สาขา</th>
          <th>รหัสฝ่าย</th><th>Cost Center</th><th>สิทธิ์</th><th></th>
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div></div>
  </div>`;

function rowHtml(m) {
  const roles = ['staff','it','asset','account','approver','admin'];
  return `<tr data-uid="${esc(m.user_id)}">
    <td><input data-k="full_name"   type="text" value="${esc(m.full_name)}"   style="min-width:160px"></td>
    <td><input data-k="position"    type="text" value="${esc(m.position)}"    style="min-width:150px"></td>
    <td><input data-k="department"  type="text" value="${esc(m.department)}"  style="min-width:150px"></td>
    <td><input data-k="dept_code"   type="text" value="${esc(m.dept_code)}"   style="width:80px"></td>
    <td><input data-k="cost_center" type="text" value="${esc(m.cost_center)}" style="width:110px"></td>
    <td><select data-k="role">${roles.map(r =>
        `<option value="${r}"${m.role === r ? ' selected' : ''}>${esc(ROLE_LABEL[r])}</option>`).join('')}</select></td>
    <td><button class="btn ghost sm" data-save>บันทึก</button></td>
  </tr>`;
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-save]');
  if (!btn) return;
  const tr = btn.closest('tr');
  const patch = {};
  tr.querySelectorAll('[data-k]').forEach(i => patch[i.dataset.k] = i.value.trim());
  patch.dept_code = (patch.dept_code || 'GEN').toUpperCase();

  btn.disabled = true;
  const msg = document.getElementById('msg');
  try {
    await updateMember(tr.dataset.uid, patch);
    msg.innerHTML = note('ok', `บันทึก ${esc(patch.full_name)} แล้ว`);
  } catch (err) {
    msg.innerHTML = note('bad', esc(friendlyError(err)));
  }
  btn.disabled = false;
});
