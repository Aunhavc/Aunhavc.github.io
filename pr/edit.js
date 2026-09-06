/* =============================================================
   หน้าสร้าง / แก้ไข / อนุมัติ ใบขอจัดซื้อ

   กติกาสำคัญ:
   - แก้ได้เฉพาะใบของตัวเองที่ยัง "ร่าง" หรือ "ตีกลับ"
     (ฝั่งฐานข้อมูลบังคับด้วย RLS อีกชั้น หน้าเว็บแค่ซ่อนปุ่มให้ไม่งง)
   - ยอดเงินที่แสดงตอนกำลังพิมพ์เป็น "ตัวอย่าง" เท่านั้น
     ตัวเลขจริงมาจากฐานข้อมูลหลังบันทึก — ใบที่พิมพ์ใช้ของฐานข้อมูลเสมอ
   ============================================================= */
import {
  configured, requireSession, myMember, getRequest,
  createRequest, updateRequest, deleteRequest, saveItems,
  submitRequest, decideRequest, itOpinion, setSapRef, saveAssets
} from './db.js';
import { FORM } from './form-config.js';
import { topbar, note, friendlyError } from './ui.js';
import { esc, money, dateTH, stampTH, bahtText, STATUS } from './lib.js';

const bar = document.getElementById('bar');
const root = document.getElementById('root');

if (!configured) { root.innerHTML = `<div class="wrap">${note('bad','ยังไม่ได้ตั้งค่า pr/config.js')}</div>`; throw new Error('unconfigured'); }
if (!await requireSession()) throw new Error('no session');

const me = await myMember();
bar.innerHTML = topbar(me, 'edit.html');

const id = new URLSearchParams(location.search).get('id');

/* สถานะในหน้า — head/items ถูกเขียนทับทุกครั้งที่โหลดใหม่จากฐานข้อมูล */
let head, items, assets, logs;

if (id) {
  try {
    ({ head, items, assets, logs } = await getRequest(id));
  } catch (e) {
    root.innerHTML = `<div class="wrap">${note('bad', esc(friendlyError(e)))}</div>`;
    throw e;
  }
} else {
  // ใบใหม่ — เติมค่าตั้งต้นจากโปรไฟล์ผู้ใช้ ยังไม่บันทึกลงฐานข้อมูลจนกว่าจะกดบันทึก
  head = {
    id: null, doc_no: null, status: 'draft', version: 0,
    requester_name: me.full_name, requester_pos: me.position,
    department: me.department, dept_code: me.dept_code, cost_center: me.cost_center,
    vendor_suggest: '', reason: '',
    doc_date: new Date().toISOString().slice(0, 10),
    pay_no_supplier: false, pay_normal_cycle: false, refund_transfer: false, refund_bank: '',
    clear_advance: false, at_branch: false, install_wait: false, install_date: null,
    receiver_name: '', pay_by_period: false, period_no: '', clear_doc_no: '',
    subtotal: 0, vat_rate: 7, wht_rate: 0, vat_amount: 0, wht_amount: 0, grand_total: 0,
    it_opinion: null, it_note: '', it_name: '', sap_ref: '', decision_note: '', decided_name: ''
  };
  items = [];
  assets = [];
  logs = [];
}

render();

/* ---------------- ตัวช่วยสิทธิ์ ---------------- */
const canEdit    = () => head.requester_id ? (head.requester_id === me.user_id && ['draft','rejected'].includes(head.status)) : true;
const canDecide  = () => head.status === 'submitted' && ['approver','admin'].includes(me.role);
const canItSay   = () => ['submitted','approved'].includes(head.status) && ['it','admin'].includes(me.role);
/* ฝ่ายสินทรัพย์กับฝ่ายบัญชีกรอกตารางหน้า 2 ได้ หลังใบถูกส่งอนุมัติแล้ว */
const canEditAssets = () => ['submitted','approved'].includes(head.status)
                         && ['asset','account','admin'].includes(me.role);

/* ---------------- วาดหน้าจอ ---------------- */
function render() {
  const st = STATUS[head.status] || { label: head.status, cls: '' };
  const ed = canEdit();
  const dis = ed ? '' : ' disabled';

  const rows = [...items];
  while (rows.length < FORM.minItemRows) rows.push({ description:'', item_type:'', qty:'', unit_price:'', note:'' });

  root.innerHTML = `
  <div class="wrap narrow">

    <div class="pagehead">
      <h1>${esc(head.doc_no || 'ใบขอจัดซื้อ (ร่างใหม่)')}</h1>
      <span class="tag ${st.cls}">${esc(st.label)}</span>
      ${head.version ? `<span class="muted">ครั้งที่ ${head.version}</span>` : ''}
      <span style="flex:1"></span>
      <a class="btn ghost" href="index.html">รายการทั้งหมด</a>
      ${head.id ? `<a class="btn ghost" href="print.html?id=${encodeURIComponent(head.id)}" target="_blank">พิมพ์</a>` : ''}
    </div>

    <div id="msg"></div>

    ${head.status === 'rejected' ? note('bad',
      `<b>ถูกตีกลับโดย ${esc(head.decided_name)}</b> — ${esc(head.decision_note)}`) : ''}
    ${head.status === 'approved' ? note('ok',
      `<b>อนุมัติแล้วโดย ${esc(head.decided_name)}</b> เมื่อ ${esc(stampTH(head.decided_at))}
       ${head.decision_note ? '· ' + esc(head.decision_note) : ''}`) : ''}
    ${head.status === 'submitted' ? note('warn',
      `ส่งอนุมัติแล้วเมื่อ ${esc(stampTH(head.submitted_at))} — แก้ไขไม่ได้จนกว่าผู้อนุมัติจะตีกลับ`) : ''}

    <!-- ---------- ส่วนหัว ---------- -->
    <div class="card">
      <h2>ข้อมูลผู้ขอ</h2>
      <div class="grid g3">
        <div><label class="f">ผู้ขอซื้อ</label><input id="requester_name" type="text" value="${esc(head.requester_name)}"${dis}></div>
        <div><label class="f">แผนก/สาขา</label><input id="department" type="text" value="${esc(head.department)}"${dis}></div>
        <div><label class="f">วัน/เดือน/ปี</label><input id="doc_date" type="date" value="${esc(head.doc_date || '')}"${dis}></div>
        <div><label class="f">Division Cost Center</label><input id="cost_center" type="text" value="${esc(head.cost_center)}"${dis}></div>
        <div style="grid-column:span 2"><label class="f">ชื่อผู้ขายที่แนะนำ (ถ้ามี)</label><input id="vendor_suggest" type="text" value="${esc(head.vendor_suggest)}"${dis}></div>
        <div style="grid-column:1/-1"><label class="f">เหตุผลในการขอซื้อ</label><input id="reason" type="text" value="${esc(head.reason)}"${dis}></div>
      </div>
    </div>

    <!-- ---------- รายการ ---------- -->
    <div class="card">
      <h2>รายการที่ขอซื้อ</h2>
      <div class="scroll">
        <table class="lines" id="lines">
          <thead><tr>
            <th style="width:34px"></th>
            <th style="min-width:220px">ชื่อและรายละเอียดสิ่งที่ต้องการ</th>
            <th style="width:150px">ประเภท</th>
            <th style="width:80px">จำนวน</th>
            <th style="width:110px">ราคาต่อหน่วย</th>
            <th style="width:110px;text-align:end">จำนวนเงิน</th>
            <th style="width:130px">หมายเหตุ</th>
          </tr></thead>
          <tbody>${rows.map(lineRow).join('')}</tbody>
        </table>
      </div>
      ${ed ? '<button class="btn ghost sm" id="addLine" style="margin-top:10px">+ เพิ่มบรรทัด</button>' : ''}
    </div>

    <!-- ---------- รายละเอียดเพิ่มเติม + ยอดเงิน ---------- -->
    <div class="card">
      <h2>รายละเอียดเพิ่มเติม</h2>
      <div class="grid" style="gap:9px">
        ${chk('pay_no_supplier',  'ไม่ต้องทำจ่ายซัพ', dis)}
        ${chk('pay_normal_cycle', 'ทำจ่ายเงินให้กับซัพฯ ตามรอบปกติ', dis)}
        ${chk('clear_advance',    'เคลียร์เงินทดรองจ่าย', dis)}
        ${chk('at_branch',        'สินค้า / สินทรัพย์ / อุปกรณ์ / อื่นๆ ณ ปัจจุบันอยู่ที่สาขาแล้ว', dis)}
        <div class="grid g2" style="align-items:end">
          ${chk('refund_transfer', 'โอนเงินคืน', dis)}
          <div><label class="f">ธนาคาร</label><input id="refund_bank" type="text" value="${esc(head.refund_bank)}"${dis}></div>
        </div>
        <div class="grid g3" style="align-items:end">
          ${chk('install_wait', 'รอช่าง/เจ้าของงานมาติดตั้ง', dis)}
          <div><label class="f">วันที่ติดตั้ง</label><input id="install_date" type="date" value="${esc(head.install_date || '')}"${dis}></div>
          <div><label class="f">ชื่อผู้รับมอบงาน</label><input id="receiver_name" type="text" value="${esc(head.receiver_name)}"${dis}></div>
        </div>
        <div class="grid g3" style="align-items:end">
          ${chk('pay_by_period', 'ทำจ่ายตามรอบ', dis)}
          <div><label class="f">งวดที่</label><input id="period_no" type="text" value="${esc(head.period_no)}"${dis}></div>
          <div><label class="f">เลขที่ใบเคลียร์</label><input id="clear_doc_no" type="text" value="${esc(head.clear_doc_no)}"${dis}></div>
        </div>
      </div>

      <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">

      <div class="grid g2" style="align-items:end">
        <div class="grid g2">
          <div><label class="f">VAT (%)</label><input id="vat_rate" type="number" step="0.01" min="0" max="100" value="${esc(head.vat_rate)}"${dis}></div>
          <div><label class="f">หักภาษี ณ ที่จ่าย (%)</label>
            <select id="wht_rate"${dis}>
              ${FORM.whtRates.map(r => `<option value="${r}"${Number(head.wht_rate) === r ? ' selected' : ''}>${r} %</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="totals" id="totals"></div>
      </div>
      <p class="muted" id="bahtline" style="text-align:end;margin:8px 0 0"></p>
      <div id="limitWarn"></div>
    </div>

    <!-- ---------- ปุ่มดำเนินการ ---------- -->
    <div class="card">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ed ? '<button class="btn ghost" id="save">บันทึกร่าง</button>' : ''}
        ${ed ? '<button class="btn" id="submit">ส่งอนุมัติ</button>' : ''}
        ${head.id && head.status === 'draft' && !head.doc_no && head.requester_id === me.user_id
          ? '<button class="btn ghost" id="del" style="color:var(--bad)">ลบร่างนี้</button>' : ''}
        <span style="flex:1"></span>
        ${canDecide() ? '<button class="btn bad" id="reject">ตีกลับ</button><button class="btn ok" id="approve">อนุมัติ</button>' : ''}
      </div>
      ${ed ? '<p class="muted" style="margin:10px 0 0">กด “ส่งอนุมัติ” แล้วระบบจะออกเลขที่เอกสารและล็อกใบนี้ทันที แก้ต่อไม่ได้จนกว่าจะถูกตีกลับ</p>' : ''}
    </div>

    <!-- ---------- ความเห็นฝ่าย IT ---------- -->
    ${(head.it_opinion || canItSay()) ? `
    <div class="card">
      <h2>ความคิดเห็นจากฝ่าย IT</h2>
      ${head.it_opinion ? note(head.it_opinion === 'agree' ? 'ok' : 'bad',
        `<b>${head.it_opinion === 'agree' ? 'เห็นชอบ' : 'ไม่เห็นชอบ'}</b> โดย ${esc(head.it_name)}
         ${head.it_note ? '· ' + esc(head.it_note) : ''}`) : ''}
      ${canItSay() ? `
        <div class="grid g2" style="align-items:end">
          <div><label class="f">รายละเอียดเพิ่มเติม</label><input id="it_note" type="text" value="${esc(head.it_note)}"></div>
          <div style="display:flex;gap:8px">
            <button class="btn ok" id="itYes">เห็นชอบ</button>
            <button class="btn bad" id="itNo">ไม่เห็นชอบ</button>
          </div>
        </div>` : ''}
    </div>` : ''}

    <!-- ---------- ส่วนงานสินทรัพย์ (หน้า 2 ของใบ) ---------- -->
    ${(assets.length || canEditAssets()) ? `
    <div class="card">
      <h2>ส่วนงานสินทรัพย์</h2>
      <p class="muted" style="margin:-6px 0 12px">
        ฝ่ายสินทรัพย์ / ฝ่ายบัญชี กรอกหลังใบได้รับอนุมัติ — ทุกช่องพิมพ์แก้ได้
        ${FORM.assetSetThreshold ? `(ช่อง "ชุด" ระบบเดาให้ตอนพิมพ์มูลค่าครั้งแรก
        ตั้งแต่ ${money(FORM.assetSetThreshold)} บาทขึ้นไป = ชุดใหญ่ — กดเปลี่ยนทับได้)` : ''}
      </p>
      <div class="scroll">
        <table class="lines" id="assets">
          <thead><tr>
            <th style="width:34px"></th>
            <th style="width:150px">รหัสสินทรัพย์</th>
            <th style="min-width:220px">ชื่อสินทรัพย์</th>
            <th style="width:80px">จำนวน</th>
            <th style="width:120px">มูลค่า/หน่วย</th>
            <th style="width:110px;text-align:end">มูลค่ารวม</th>
            <th style="width:105px">ชุด</th>
          </tr></thead>
          <tbody>${assetRowsHtml()}</tbody>
        </table>
      </div>
      ${canEditAssets() ? `
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
          <button class="btn ghost sm" id="addAsset">+ เพิ่มบรรทัด</button>
          <span style="flex:1"></span>
          <div class="totals" id="assetTotals" style="margin:0"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn" id="saveAssets">บันทึกส่วนงานสินทรัพย์</button>
        </div>` : `<div class="totals" id="assetTotals" style="margin-top:12px"></div>`}
      ${assets.length && assets[0].updated_name ? `<p class="muted" style="margin:10px 0 0">
        แก้ไขล่าสุดโดย ${esc(assets[0].updated_name)} เมื่อ ${esc(stampTH(assets[0].updated_at))}</p>` : ''}
    </div>` : ''}

    <!-- ---------- เลขอ้างอิง SAP ---------- -->
    ${head.status === 'approved' && ['approver','admin'].includes(me.role) ? `
    <div class="card">
      <h2>เลขที่อ้างอิงใน SAP</h2>
      <div class="grid g2" style="align-items:end">
        <div><label class="f">เลข PR / PO ที่คีย์เข้า SAP แล้ว</label><input id="sap_ref" type="text" value="${esc(head.sap_ref)}"></div>
        <div><button class="btn ghost" id="saveSap">บันทึกเลขอ้างอิง</button></div>
      </div>
    </div>` : head.sap_ref ? `
    <div class="card"><h2>เลขที่อ้างอิงใน SAP</h2><p style="margin:0">${esc(head.sap_ref)}</p></div>` : ''}

    <!-- ---------- ประวัติ ---------- -->
    ${logs.length ? `
    <div class="card">
      <h2>ประวัติการดำเนินการ</h2>
      <ul class="timeline">
        ${logs.map(l => `<li>
          <time>${esc(stampTH(l.at))}</time>
          <span><b>${esc(ACTION[l.action] || l.action)}</b> · ${esc(l.actor_name)}${l.note ? ' — ' + esc(l.note) : ''}</span>
        </li>`).join('')}
      </ul>
    </div>` : ''}

  </div>`;

  wire();
  recalc();
}

const ACTION = {
  submitted: 'ส่งอนุมัติ', approved: 'อนุมัติ', rejected: 'ตีกลับ',
  it_agree: 'ฝ่าย IT เห็นชอบ', it_disagree: 'ฝ่าย IT ไม่เห็นชอบ',
  assets: 'บันทึกส่วนงานสินทรัพย์', sap_ref: 'บันทึกเลข SAP'
};

function chk(key, label, dis) {
  return `<label class="check"><input type="checkbox" id="${key}"${head[key] ? ' checked' : ''}${dis}> ${esc(label)}</label>`;
}

/** แถวในตารางส่วนงานสินทรัพย์ — อ่านอย่างเดียวเมื่อไม่มีสิทธิ์กรอก */
function assetRow(a, ro) {
  const d = ro ? ' disabled' : '';
  return `<tr>
    <td class="muted ctr" style="padding-top:13px"></td>
    <td><input class="as" data-k="asset_code" type="text" value="${esc(a.asset_code || '')}"${d}></td>
    <td><input class="as" data-k="asset_name" type="text" value="${esc(a.asset_name || '')}"${d}></td>
    <td><input class="as" data-k="qty"        type="number" step="0.001" min="0" value="${a.qty ?? ''}"${d}></td>
    <td><input class="as" data-k="unit_value" type="number" step="0.01"  min="0" value="${a.unit_value ?? ''}"${d}></td>
    <td class="amt" data-aamt></td>
    <td><select class="as" data-k="set_type"${d}>${FORM.assetSets.map(o =>
        `<option value="${o.value}"${(a.set_type || 'small') === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></td>
  </tr>`;
}

function assetRowsHtml() {
  const ro = !canEditAssets();
  const rows = [...assets];
  // เว้นบรรทัดว่างให้พิมพ์ต่อได้ เฉพาะตอนที่มีสิทธิ์กรอก
  if (!ro) while (rows.length < 3) rows.push({ asset_code:'', asset_name:'', qty:'', unit_value:'', set_type:'small' });
  return rows.map(a => assetRow(a, ro)).join('');
}

function lineRow(r) {
  return `<tr>
    <td class="muted ctr" style="padding-top:13px"></td>
    <td><input class="ln" data-k="description" type="text" value="${esc(r.description || '')}"></td>
    <td><select class="ln" data-k="item_type">${FORM.assetTypes.map(t =>
        `<option value="${t.value}"${(r.item_type || 'expense') === t.value ? ' selected' : ''}>${esc(t.labelShort)}</option>`).join('')}</select></td>
    <td><input class="ln" data-k="qty"         type="number" step="0.001" min="0" value="${r.qty ?? ''}"></td>
    <td><input class="ln" data-k="unit_price"  type="number" step="0.01"  min="0" value="${r.unit_price ?? ''}"></td>
    <td class="amt" data-amt>0.00</td>
    <td><input class="ln" data-k="note"        type="text" value="${esc(r.note || '')}"></td>
  </tr>`;
}

/* ---------------- อ่านค่าจากหน้าจอ ---------------- */
const val = id_ => document.getElementById(id_)?.value ?? '';
const chkVal = id_ => Boolean(document.getElementById(id_)?.checked);

function readLines() {
  return [...document.querySelectorAll('#lines tbody tr')].map(tr => {
    const o = {};
    tr.querySelectorAll('.ln').forEach(i => o[i.dataset.k] = i.value);
    return o;
  });
}

function readHead() {
  return {
    requester_name: val('requester_name'),
    requester_pos:  me.position || '',
    department:     val('department'),
    dept_code:      me.dept_code,
    cost_center:    val('cost_center'),
    vendor_suggest: val('vendor_suggest'),
    reason:         val('reason'),
    doc_date:       val('doc_date') || null,
    pay_no_supplier: chkVal('pay_no_supplier'),
    pay_normal_cycle: chkVal('pay_normal_cycle'),
    refund_transfer: chkVal('refund_transfer'),
    refund_bank:    val('refund_bank'),
    clear_advance:  chkVal('clear_advance'),
    at_branch:      chkVal('at_branch'),
    install_wait:   chkVal('install_wait'),
    install_date:   val('install_date') || null,
    receiver_name:  val('receiver_name'),
    pay_by_period:  chkVal('pay_by_period'),
    period_no:      val('period_no'),
    clear_doc_no:   val('clear_doc_no'),
    vat_rate:       Number(val('vat_rate')) || 0,
    wht_rate:       Number(val('wht_rate')) || 0
  };
}

/* ---------------- คำนวณตัวอย่างยอดเงิน (ของจริงคำนวณในฐานข้อมูล) ---------------- */
function recalc() {
  const trs = [...document.querySelectorAll('#lines tbody tr')];
  let sub = 0;
  trs.forEach((tr, i) => {
    const q = Number(tr.querySelector('[data-k=qty]')?.value) || 0;
    const p = Number(tr.querySelector('[data-k=unit_price]')?.value) || 0;
    const a = Math.round(q * p * 100) / 100;
    sub += a;
    tr.querySelector('[data-amt]').textContent = a ? money(a) : '';
    const desc = tr.querySelector('[data-k=description]')?.value.trim();
    tr.cells[0].textContent = desc ? (i + 1) : '';
  });

  const vr = Number(val('vat_rate')) || 0, wr = Number(val('wht_rate')) || 0;
  const vat = Math.round(sub * vr) / 100, wht = Math.round(sub * wr) / 100;
  const grand = sub + vat - wht;

  document.getElementById('totals').innerHTML = `
    <span class="k">รวมเป็นเงิน</span><span class="v">${money(sub)}</span>
    <span class="k">VAT ${vr} %</span><span class="v">${money(vat)}</span>
    <span class="k">หักภาษี ณ ที่จ่าย ${wr} %</span><span class="v">${money(wht)}</span>
    <span class="k grand">ยอดรวม</span><span class="v grand">${money(grand)}</span>`;
  document.getElementById('bahtline').textContent = `(${bahtText(grand)})`;

  recalcAssets();

  // เงื่อนไขข้อ 3 บนฟอร์ม — เกินวงเงินผู้จัดการฝ่าย ต้องขึ้นถึงประธานเจ้าหน้าที่สายงาน
  document.getElementById('limitWarn').innerHTML = grand > FORM.managerLimit
    ? note('warn', `ยอดรวมเกิน ${money(FORM.managerLimit)} บาท — ตามเงื่อนไขข้อ 3 ของฟอร์ม
        ต้องได้รับอนุมัติจาก<b>ประธานเจ้าหน้าที่สายงานของฝ่าย</b> ไม่ใช่ผู้จัดการฝ่าย`)
    : '';
}

/** ยอดรวมตารางสินทรัพย์ + ป้ายชุดใหญ่/ชุดเล็กต่อบรรทัด (คิดจากมูลค่าต่อหน่วย) */
function recalcAssets() {
  const box = document.getElementById('assetTotals');
  if (!box) return;

  let qtyAll = 0, valAll = 0, big = 0, small = 0;
  document.querySelectorAll('#assets tbody tr').forEach((tr, i) => {
    const q = Number(tr.querySelector('[data-k=qty]')?.value) || 0;
    const u = Number(tr.querySelector('[data-k=unit_value]')?.value) || 0;
    const a = Math.round(q * u * 100) / 100;
    const named = tr.querySelector('[data-k=asset_name]')?.value.trim()
               || tr.querySelector('[data-k=asset_code]')?.value.trim();

    tr.querySelector('[data-aamt]').textContent = a ? money(a) : '';
    tr.cells[0].textContent = named ? (i + 1) : '';

    if (named) {
      if (tr.querySelector('[data-k=set_type]')?.value === 'big') big += a; else small += a;
      qtyAll += q;
      valAll += a;
    }
  });

  box.innerHTML = `
    <span class="k">รวมชุดใหญ่</span><span class="v">${money(big)}</span>
    <span class="k">รวมชุดเล็ก</span><span class="v">${money(small)}</span>
    <span class="k">จำนวนสินทรัพย์รวม</span><span class="v">${qtyAll || ''}</span>
    <span class="k grand">มูลค่าสินทรัพย์รวม</span><span class="v grand">${money(valAll)}</span>`;
}

/* ---------------- ผูก event ---------------- */
function wire() {
  const msg = document.getElementById('msg');
  const show = (k, t) => { msg.innerHTML = note(k, esc(t)); msg.scrollIntoView({ block: 'nearest' }); };
  const busy = on => document.querySelectorAll('.card button').forEach(b => b.disabled = on);

  document.getElementById('lines')?.addEventListener('input',  recalc);
  document.getElementById('lines')?.addEventListener('change', recalc);
  document.getElementById('vat_rate')?.addEventListener('input', recalc);
  document.getElementById('wht_rate')?.addEventListener('change', recalc);

  /* เดาชุดให้จากมูลค่าต่อหน่วย เฉพาะบรรทัดที่ผู้ใช้ยังไม่เคยแตะช่อง "ชุด" เอง
     พอแตะแล้วจะไม่เดาทับอีก — คนที่รู้จริงคือฝ่ายสินทรัพย์ ไม่ใช่เกณฑ์ราคา */
  document.getElementById('assets')?.addEventListener('input', e => {
    const tr = e.target.closest('tr');
    if (tr && e.target.dataset.k === 'unit_value' && FORM.assetSetThreshold) {
      const sel = tr.querySelector('[data-k=set_type]');
      if (sel && !sel.dataset.touched) {
        sel.value = Number(e.target.value) >= FORM.assetSetThreshold ? 'big' : 'small';
      }
    }
    recalcAssets();
  });

  document.getElementById('assets')?.addEventListener('change', e => {
    if (e.target.dataset.k === 'set_type') e.target.dataset.touched = '1';
    recalcAssets();
  });

  document.getElementById('addAsset')?.addEventListener('click', () => {
    document.querySelector('#assets tbody').insertAdjacentHTML('beforeend',
      assetRow({ asset_code:'', asset_name:'', qty:'', unit_value:'', set_type:'small' }, false));
  });

  document.getElementById('saveAssets')?.addEventListener('click', async () => {
    busy(true);
    try {
      const rows = [...document.querySelectorAll('#assets tbody tr')].map(tr => {
        const o = {};
        tr.querySelectorAll('.as').forEach(i => o[i.dataset.k] = i.value);
        return o;
      });
      await saveAssets(head.id, rows);
      ({ head, items, assets, logs } = await getRequest(head.id));
      render();
      document.getElementById('msg').innerHTML = note('ok', 'บันทึกส่วนงานสินทรัพย์แล้ว');
    } catch (e) { show('bad', friendlyError(e)); busy(false); }
  });

  document.getElementById('addLine')?.addEventListener('click', () => {
    document.querySelector('#lines tbody').insertAdjacentHTML('beforeend',
      lineRow({ description:'', item_type:'', qty:'', unit_price:'', note:'' }));
  });

  /** บันทึกหัวใบ + รายการ แล้วโหลดของจริงกลับมาจากฐานข้อมูล */
  async function persist() {
    const patch = readHead();
    if (!head.id) {
      const created = await createRequest({ ...patch, requester_id: me.user_id, status: 'draft' });
      head.id = created.id;
      history.replaceState(null, '', `edit.html?id=${created.id}`);
    } else {
      await updateRequest(head.id, patch);
    }
    await saveItems(head.id, readLines());
    ({ head, items, assets, logs } = await getRequest(head.id));
  }

  document.getElementById('save')?.addEventListener('click', async () => {
    busy(true);
    try { await persist(); render(); document.getElementById('msg').innerHTML = note('ok','บันทึกแล้ว'); }
    catch (e) { show('bad', friendlyError(e)); busy(false); }
  });

  document.getElementById('submit')?.addEventListener('click', async () => {
    if (!confirm('ส่งอนุมัติแล้วจะแก้ไขใบนี้ไม่ได้อีก จนกว่าผู้อนุมัติจะตีกลับ — ยืนยันหรือไม่?')) return;
    busy(true);
    try {
      await persist();
      await submitRequest(head.id);
      ({ head, items, assets, logs } = await getRequest(head.id));
      render();
      document.getElementById('msg').innerHTML = note('ok', `ส่งอนุมัติแล้ว เลขที่เอกสาร <b>${esc(head.doc_no)}</b>`);
    } catch (e) { show('bad', friendlyError(e)); busy(false); }
  });

  document.getElementById('del')?.addEventListener('click', async () => {
    if (!confirm('ลบร่างนี้ถาวร?')) return;
    try { await deleteRequest(head.id); location.replace('index.html'); }
    catch (e) { show('bad', friendlyError(e)); }
  });

  const decide = async (d) => {
    const noteTxt = prompt(d === 'approved' ? 'บันทึกเพิ่มเติม (ไม่บังคับ)' : 'เหตุผลที่ตีกลับ (บังคับ)') ?? null;
    if (noteTxt === null) return;
    busy(true);
    try {
      await decideRequest(head.id, d, noteTxt);
      ({ head, items, assets, logs } = await getRequest(head.id));
      render();
    } catch (e) { show('bad', friendlyError(e)); busy(false); }
  };
  document.getElementById('approve')?.addEventListener('click', () => decide('approved'));
  document.getElementById('reject')?.addEventListener('click', () => decide('rejected'));

  const itSay = async (o) => {
    busy(true);
    try {
      await itOpinion(head.id, o, val('it_note'));
      ({ head, items, assets, logs } = await getRequest(head.id));
      render();
    } catch (e) { show('bad', friendlyError(e)); busy(false); }
  };
  document.getElementById('itYes')?.addEventListener('click', () => itSay('agree'));
  document.getElementById('itNo') ?.addEventListener('click', () => itSay('disagree'));

  document.getElementById('saveSap')?.addEventListener('click', async () => {
    busy(true);
    try {
      await setSapRef(head.id, val('sap_ref'));
      ({ head, items, assets, logs } = await getRequest(head.id));
      render();
    } catch (e) { show('bad', friendlyError(e)); busy(false); }
  });
}
