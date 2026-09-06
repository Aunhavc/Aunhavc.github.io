/* =============================================================
   ชิ้นส่วนหน้าจอที่ใช้ซ้ำหลายหน้า
   ============================================================= */
import { signOut } from './db.js';
import { esc, ROLE_LABEL } from './lib.js';

/** แถบบนสุด — เมนูโผล่ตามสิทธิ์ */
export function topbar(me, current) {
  const nav = [
    ['index.html', 'ใบขอจัดซื้อ'],
    ['edit.html', 'สร้างใบใหม่'],
    ...(me?.role === 'admin' ? [['members.html', 'จัดการผู้ใช้']] : [])
  ];
  return `
    <div class="topbar">
      <span class="logo">ใบขอจัดซื้อ</span>
      <nav>${nav.map(([h, t]) =>
        `<a href="${h}"${h === current ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>
      <span class="sp"></span>
      <span class="who">
        <b>${esc(me?.full_name || '—')}</b>
        ${esc(me?.department || '')} · ${esc(ROLE_LABEL[me?.role] || me?.role || '')}
      </span>
      <button class="btn ghost sm" data-signout>ออกจากระบบ</button>
    </div>`;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-signout]')) signOut();
});

/** ข้อความแจ้งเตือนแบบสั้น ๆ ด้านบนพื้นที่เนื้อหา */
export const note = (kind, html) => `<div class="note ${kind}">${html}</div>`;

/** แปลง error จาก Supabase/Postgres ให้เป็นภาษาคน */
export function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/JWT|not authenticated/i.test(m))              return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  if (/row-level security|permission denied/i.test(m)) return 'คุณไม่มีสิทธิ์ทำรายการนี้ (ใบอาจถูกล็อกหลังส่งอนุมัติแล้ว)';
  if (/duplicate key/i.test(m))                       return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  return m || 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
}
