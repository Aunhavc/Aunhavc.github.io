/* =============================================================
   ตัวช่วยล้วน ๆ — ไม่แตะฐานข้อมูล ไม่มี dependency ภายนอก

   แยกออกมาเพื่อให้ตัววาดใบ (sheet.js) ทำงานได้โดยไม่ต้องโหลด Supabase
   ใบที่พิมพ์จึงวาดได้แม้ออฟไลน์ และทดสอบเลย์เอาต์ได้โดยไม่ต้องต่อฐานข้อมูล
   ============================================================= */

export const cfg = window.PR_CONFIG || {};

/* ---------------- คำนวณเงิน (ข้อ 19, 20) ---------------- */

export function money(pr, items) {
  const subtotal = (items || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const discount = Number(pr.discount) || 0;
  const net = subtotal - discount;                 // ยอดที่ใช้ตัดงบ
  const vat = net * (Number(pr.vat_rate) || 0) / 100;
  const wht = net * (Number(pr.wht_rate) || 0) / 100;
  return {
    subtotal: r2(subtotal), discount: r2(discount), net: r2(net),
    vat: r2(vat), wht: r2(wht), total: r2(net + vat - wht)
  };
}
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------------- ตัวช่วยแสดงผล ---------------- */

export const esc = v => String(v ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const baht = n => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่แบบไทย พ.ศ. — ฟอร์มกระดาษใช้แบบนี้ */
export function thDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

export const DOC_TYPE_LABEL = {
  asset_large: 'สินทรัพย์ชุดใหญ่',
  asset_small: 'สินทรัพย์ชุดเล็ก',
  expense:     'ค่าใช้จ่าย'
};

export const STATUS_LABEL = {
  draft:      { t: 'ร่าง',          c: 'st-draft' },
  submitted:  { t: 'ยื่นแล้ว',       c: 'st-open'  },
  printed:    { t: 'ปริ้นแล้ว (ล็อก)', c: 'st-lock'  },
  approved:   { t: 'อนุมัติแล้ว',     c: 'st-ok'    },
  cancelled:  { t: 'ยกเลิก',        c: 'st-bad'   },
  superseded: { t: 'ถูกแทนที่',      c: 'st-mute'  }
};

export const REASON_LABEL = {
  damaged: 'ชำรุด', lost: 'สูญหาย', out_of_stock: 'ขาดสต็อก',
  new_branch: 'เปิดสาขาใหม่', other: 'อื่น ๆ'
};

export const KIND_LABEL = { buy: 'ขอเสนอซื้อ', repair: 'ขอเสนอซ่อมแซม', make: 'ขอเสนอสั่งทำ' };

export const PAY_LABEL = {
  no_pay: 'ไม่ต้องทำจ่ายซัพ',
  normal_cycle: 'ทำจ่ายเงินให้กับซัพฯ ตามรอบปกติ',
  refund: 'โอนเงินคืน',
  clear_advance: 'เคลียร์เงินทดรองจ่าย'
};

export const isAsset = t => t === 'asset_small' || t === 'asset_large';

/** แถบนำทางบนสุด */
export function appbar(profile, current) {
  const nav = [['index.html', 'ใบขอจัดซื้อ']];
  if (can(profile, 'admin')) nav.push(['admin.html', 'ตั้งค่าระบบ']);
  return `
    <header class="appbar">
      <a class="brand" href="index.html"><b>PR</b> ใบขอจัดซื้อ</a>
      <nav>${nav.map(([h, t]) =>
        `<a href="${h}"${h === current ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>
      <span class="grow"></span>
      <span class="who"><b>${esc(profile?.full_name || '—')}</b><span>${esc(profile?.department?.name || 'ยังไม่ได้กำหนดฝ่าย')}</span></span>
      <button class="btn quiet" id="signout">ออกจากระบบ</button>
    </header>`;
}

document.addEventListener('click', e => {
  if (e.target.closest('#signout')) signOut();
});
