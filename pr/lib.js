/* =============================================================
   ตัวช่วยที่ใช้ร่วมกันทุกหน้า — ไม่มี dependency ภายนอก
   ============================================================= */

/** กัน HTML injection ทุกจุดที่เอาข้อมูลผู้ใช้ไปต่อเป็น string */
export const esc = v => String(v ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/** ตัวเลขเงิน 1,234.50 — ช่องว่างเปล่าเมื่อไม่มีค่า (ใบพิมพ์ไม่ควรมี 0.00 เกลื่อน) */
export const money = (v, blankZero = false) => {
  const n = Number(v || 0);
  if (blankZero && n === 0) return '';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const qtyFmt = v => {
  const n = Number(v || 0);
  if (!n) return '';
  // ตัดศูนย์ท้ายทศนิยมทิ้ง 2.000 -> 2, 2.500 -> 2.5
  return String(parseFloat(n.toFixed(3)));
};

/** วันที่แบบไทย 06/09/2569 (พ.ศ.) — ใบขออนุมัติในไทยใช้ พ.ศ. */
export const dateTH = v => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
};

/** วันที่+เวลา ใช้ใน footer ของใบพิมพ์ เพื่อพิสูจน์ว่าเซ็นเอกสารฉบับไหน */
export const stampTH = v => {
  const d = v ? new Date(v) : new Date();
  return `${dateTH(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/* ---------- จำนวนเงินเป็นตัวอักษร ---------- */
const DIGIT = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const UNIT  = ['','สิบ','ร้อย','พัน','หมื่น','แสน'];

/** อ่านเลขไม่เกิน 6 หลัก (ต้องตัดศูนย์นำหน้าออกมาก่อน) */
function readGroup(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = +s[i], pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 1)                          out += (d === 1 ? '' : d === 2 ? 'ยี่' : DIGIT[d]) + 'สิบ';
    else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else                                    out += DIGIT[d] + UNIT[pos];
  }
  return out;
}

function readInt(s) {
  s = String(s).replace(/^0+/, '');
  if (!s) return 'ศูนย์';
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(-6).replace(/^0+/, '');
    return readInt(head) + 'ล้าน' + readGroup(tail);
  }
  return readGroup(s);
}

/** 1234.50 -> 'หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์' */
export function bahtText(value) {
  const n = Math.abs(Math.round(Number(value || 0) * 100)); // ทำงานบนหน่วยสตางค์ เลี่ยงปัญหาทศนิยมลอยตัว
  const sign = Number(value) < 0 ? 'ลบ' : '';
  const baht = Math.floor(n / 100), satang = n % 100;
  return sign + readInt(baht) + 'บาท' +
    (satang === 0 ? 'ถ้วน' : readInt(satang) + 'สตางค์');
}

/* ---------- ป้ายกำกับสถานะ ---------- */
export const STATUS = {
  draft:     { label: 'ร่าง',        cls: 'st-draft'  },
  submitted: { label: 'รออนุมัติ',   cls: 'st-wait'   },
  approved:  { label: 'อนุมัติแล้ว', cls: 'st-ok'     },
  rejected:  { label: 'ตีกลับ',      cls: 'st-bad'    }
};

export const ROLE_LABEL = {
  staff: 'ผู้ขอซื้อ', it: 'ฝ่าย IT', asset: 'ฝ่ายสินทรัพย์',
  account: 'ฝ่ายบัญชี', approver: 'ผู้อนุมัติ', admin: 'ผู้ดูแลระบบ'
};
