/* =============================================================
   หน้าพิมพ์ใบขอจัดซื้อ — ดึงข้อมูลจริงแล้วส่งให้ print-render.js วาด
   ============================================================= */
import { configured, requireSession, getRequest, ORG_NAME } from './db.js';
import { sheetsHtml } from './print-render.js';

const out  = document.getElementById('out');
const warn = document.getElementById('warn');

if (!configured) {
  out.innerHTML = `<p style="padding:24px;font-family:Sarabun">ยังไม่ได้ตั้งค่า <code>pr/config.js</code> — ดูวิธีใน <code>pr/README.md</code></p>`;
  throw new Error('unconfigured');
}
if (!await requireSession()) throw new Error('no session');

const id = new URLSearchParams(location.search).get('id');
if (!id) { out.innerHTML = '<p style="padding:24px">ไม่ได้ระบุเลขที่ใบขอจัดซื้อ</p>'; throw new Error('no id'); }

document.getElementById('backLink').href = `edit.html?id=${encodeURIComponent(id)}`;
document.getElementById('printBtn').addEventListener('click', () => window.print());

const { head, items } = await getRequest(id);
document.getElementById('barDoc').textContent = head.doc_no || '(ยังไม่ออกเลขเอกสาร)';

/* เตือนเมื่อพิมพ์ใบที่ยังไม่ผ่านสถานะอนุมัติ — กันเอาใบร่างไปให้ผู้บริหารเซ็น */
if (head.status !== 'approved') {
  warn.innerHTML = `<div class="warnbar noprint">
    <b>ใบนี้ยังไม่อยู่ในสถานะ "อนุมัติแล้ว" ในระบบ</b> —
    พิมพ์ได้เพื่อตรวจทาน แต่ก่อนนำเสนอผู้บริหาร ควรให้ผู้อนุมัติกดอนุมัติในระบบก่อน
    เพื่อให้ประวัติในระบบตรงกับกระดาษที่เซ็น</div>`;
}

out.innerHTML = sheetsHtml(head, items, ORG_NAME);
