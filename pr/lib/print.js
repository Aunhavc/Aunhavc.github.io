/* =============================================================
   หน้าพิมพ์ใบขอจัดซื้อ — โหลดใบ วาดลงกระดาษ แล้วล็อกใบเมื่อสั่งพิมพ์
   ตัววาดอยู่ใน sheet.js
   ============================================================= */
import { requireSession, getPR, markPrinted } from './db.js';
import { renderSheet } from './sheet.js';

await requireSession();

const id = new URLSearchParams(location.search).get('id');
const sheet = document.getElementById('sheet');

if (!id) {
  sheet.innerHTML = '<p style="color:#fff;padding:24px">ไม่ได้ระบุใบที่ต้องการพิมพ์</p>';
} else {
  const pr = await getPR(id);
  if (!pr) {
    sheet.innerHTML = '<p style="color:#fff;padding:24px">ไม่พบใบนี้ หรือคุณไม่มีสิทธิ์เปิดดู</p>';
  } else {
    sheet.innerHTML = renderSheet(pr);
    document.getElementById('tinfo').textContent =
      `${pr.doc_no || 'ยังไม่ได้ออกเลข'}${pr.rev ? ' Rev.' + pr.rev : ''}`;

    const warn = document.getElementById('twarn');
    if (pr.status === 'submitted') warn.textContent = 'กดพิมพ์แล้วใบนี้จะถูกล็อก แก้ไม่ได้อีก';
    if (pr.status === 'printed')   warn.textContent = 'ใบนี้ถูกล็อกแล้ว — แก้ได้ด้วยการออกฉบับแก้ไขเท่านั้น';

    document.getElementById('doprint').addEventListener('click', async () => {
      if (pr.status === 'submitted') {
        if (!confirm('พิมพ์แล้วใบนี้จะถูกล็อก แก้ไขไม่ได้อีก ต้องการพิมพ์ตอนนี้หรือไม่?')) return;
        try { await markPrinted(pr.id); } catch (e) { alert('บันทึกสถานะไม่สำเร็จ: ' + e.message); return; }
      }
      window.print();
    });
  }
}
