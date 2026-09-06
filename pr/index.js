/* =============================================================
   หน้าแรก — ยังไม่ล็อกอินให้แสดงฟอร์มเข้าสู่ระบบ
              ล็อกอินแล้วให้แสดงรายการใบขอจัดซื้อ
   ============================================================= */
import { configured, getSession, signIn, signUp, myMember, listRequests } from './db.js';
import { topbar, note, friendlyError } from './ui.js';
import { esc, money, dateTH, STATUS } from './lib.js';

const bar  = document.getElementById('bar');
const root = document.getElementById('root');

if (!configured) {
  root.innerHTML = `<div class="wrap narrow">${note('bad',
    'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล — เปิดไฟล์ <code>pr/config.js</code> แล้วกรอก ' +
    '<code>SUPABASE_URL</code> กับ <code>SUPABASE_ANON_KEY</code> (ขั้นตอนเต็มอยู่ใน <code>pr/README.md</code>)')}</div>`;
  throw new Error('unconfigured');
}

const session = await getSession();
session ? renderList() : renderLogin();

/* ---------------- หน้าเข้าสู่ระบบ ---------------- */
function renderLogin() {
  root.innerHTML = `
    <div class="login">
      <div class="card">
        <h1>ใบขอจัดซื้อ</h1>
        <p class="muted" style="margin:0 0 18px">เข้าสู่ระบบด้วยอีเมลบริษัท</p>
        <div id="msg"></div>
        <form id="f" class="grid">
          <div><label class="f" for="em">อีเมล</label><input id="em" type="email" required autocomplete="username"></div>
          <div><label class="f" for="pw">รหัสผ่าน</label><input id="pw" type="password" required autocomplete="current-password" minlength="6"></div>
          <button class="btn" id="go">เข้าสู่ระบบ</button>
          <button class="btn ghost" id="reg" type="button">สมัครใช้งานครั้งแรก</button>
        </form>
      </div>
    </div>`;

  const msg = document.getElementById('msg');
  const em = document.getElementById('em'), pw = document.getElementById('pw');
  const show = (k, t) => msg.innerHTML = note(k, esc(t));

  document.getElementById('f').addEventListener('submit', async e => {
    e.preventDefault();
    show('info', 'กำลังเข้าสู่ระบบ…');
    const { error } = await signIn(em.value.trim(), pw.value);
    if (error) return show('bad', friendlyError(error));
    location.reload();
  });

  document.getElementById('reg').addEventListener('click', async () => {
    if (!em.value.trim() || pw.value.length < 6)
      return show('warn', 'กรอกอีเมล และรหัสผ่านอย่างน้อย 6 ตัวอักษร');
    show('info', 'กำลังสมัคร…');
    const { data, error } = await signUp(em.value.trim(), pw.value);
    if (error) return show('bad', friendlyError(error));
    if (data.session) return location.reload();
    show('ok', 'สมัครแล้ว — กรุณายืนยันอีเมลก่อนเข้าใช้งาน แล้วแจ้งผู้ดูแลระบบเพื่อตั้งแผนกและสิทธิ์ให้');
  });
}

/* ---------------- หน้ารายการ ---------------- */
async function renderList() {
  let me;
  try { me = await myMember(); }
  catch (e) {
    root.innerHTML = `<div class="wrap">${note('bad', esc(friendlyError(e)))}</div>`;
    return;
  }
  bar.innerHTML = topbar(me, 'index.html');

  const unset = me?.department === 'ยังไม่กำหนด';
  root.innerHTML = `
    <div class="wrap">
      ${unset ? note('warn',
        'บัญชีของคุณยังไม่ได้ตั้ง <b>แผนก/สาขา</b> และ <b>รหัสฝ่าย</b> — แจ้งผู้ดูแลระบบก่อนสร้างใบขอจัดซื้อ ' +
        'เพราะเลขที่เอกสารจะออกจากรหัสฝ่าย') : ''}
      <div class="pagehead">
        <h1>ใบขอจัดซื้อ</h1>
        <input id="q" type="text" placeholder="ค้นหา เลขที่ / ผู้ขอ / เหตุผล" style="width:250px">
        <select id="st" style="width:150px">
          <option value="all">ทุกสถานะ</option>
          <option value="draft">ร่าง</option>
          <option value="submitted">รออนุมัติ</option>
          <option value="approved">อนุมัติแล้ว</option>
          <option value="rejected">ตีกลับ</option>
        </select>
        <a class="btn" href="edit.html">+ สร้างใบใหม่</a>
      </div>
      <div class="card" style="padding:0"><div class="scroll" id="tbl"></div></div>
    </div>`;

  const q = document.getElementById('q'), st = document.getElementById('st');
  const tbl = document.getElementById('tbl');
  let timer;

  const load = async () => {
    tbl.innerHTML = '<p class="empty">กำลังโหลด…</p>';
    try {
      const rows = await listRequests({ status: st.value, q: q.value });
      tbl.innerHTML = rows.length ? table(rows) : '<p class="empty">ยังไม่มีใบขอจัดซื้อ</p>';
    } catch (e) {
      tbl.innerHTML = `<p class="empty">${esc(friendlyError(e))}</p>`;
    }
  };

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  st.addEventListener('change', load);
  load();
}

function table(rows) {
  return `<table class="tbl">
    <thead><tr>
      <th>เลขที่เอกสาร</th><th>วันที่</th><th>ผู้ขอ</th><th>แผนก/สาขา</th>
      <th>เหตุผล</th><th class="num">ยอดรวม</th><th>สถานะ</th><th></th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const s = STATUS[r.status] || { label: r.status, cls: '' };
      return `<tr>
        <td><a href="edit.html?id=${encodeURIComponent(r.id)}">${esc(r.doc_no || '(ร่าง)')}</a></td>
        <td>${esc(dateTH(r.doc_date))}</td>
        <td>${esc(r.requester_name)}</td>
        <td>${esc(r.department)}</td>
        <td>${esc((r.reason || '').slice(0, 42))}${(r.reason || '').length > 42 ? '…' : ''}</td>
        <td class="num">${money(r.grand_total)}</td>
        <td><span class="tag ${s.cls}">${esc(s.label)}</span></td>
        <td><a class="btn ghost sm" href="print.html?id=${encodeURIComponent(r.id)}">พิมพ์</a></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}
