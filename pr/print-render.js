/* =============================================================
   วาดใบขอจัดซื้อ A4 2 หน้า — โมดูลบริสุทธิ์ (ไม่แตะฐานข้อมูล ไม่แตะ DOM)
   ต้นแบบ: Excel RE15072569 F-HR (ชีต "Form")

   แยกออกจาก print.js เพื่อให้ทดสอบเลย์เอาต์กระดาษได้ด้วยข้อมูลจำลอง
   โดยไม่ต้องล็อกอินหรือมีฐานข้อมูล (ดู preview.html)

   กติกาที่ห้ามเปลี่ยน:
   - ท้ายกระดาษต้องมี เลขที่เอกสาร + ครั้งที่ + เวลาที่พิมพ์เสมอ
     ไม่งั้นพิสูจน์ไม่ได้ว่าลายเซ็นบนกระดาษเป็นของเอกสารเวอร์ชันไหน
   ============================================================= */
import { FORM } from './form-config.js';
import { esc, money, qtyFmt, dateTH, stampTH, bahtText } from './lib.js';

/* ---------- ตัวช่วยเล็ก ๆ ---------- */
const cb   = (on, label) => `<span class="cb${on ? ' on' : ''}"><i></i>${esc(label)}</span>`;
const fld  = (label, val) => `<div class="fld"><b>${esc(label)}</b><span>${esc(val || '')}</span></div>`;
const blank = '<span class="blank"></span>';
const dateLine = `${blank}/${blank}/${blank}`;   // ช่องวันที่ใต้ลายเซ็น

/** ช่องลงนาม 1 ช่อง — ไม่มีชื่อ = เว้นวงเล็บให้เขียนมือ */
function signBox(s) {
  const name = s.name ? `(${esc(s.name)})` : `(${blank})`;
  const pos  = s.position ? esc(s.position) : '';
  return `<div class="sign">
      <div class="t">${esc(s.title)}</div>
      <div class="space"></div>
      <div class="nm">${name}</div>
      <small>${pos}</small>
      <div class="dots">${dateLine}</div>
    </div>`;
}

/**
 * คืน HTML ของกระดาษ 2 แผ่น
 * @param {object} h      หัวใบขอจัดซื้อ (แถวจาก pr_request)
 * @param {Array}  items  รายการที่ขอซื้อ (แถวจาก pr_item เรียงตาม line_no)
 * @param {Array}  assets ส่วนงานสินทรัพย์ (แถวจาก pr_asset เรียงตาม line_no)
 * @param {string} orgName ชื่อบริษัทที่พิมพ์ใต้หัวเอกสาร
 */
export function sheetsHtml(h, items, assets = [], orgName = '') {
  /* ---------- หน้า 1 ---------- */
  const rows = [...items];
  while (rows.length < FORM.minItemRows) rows.push(null);

  /* ช่อง "ประเภทรายการ" บนหัวเอกสารไม่ได้ให้คนกาเองแล้ว
     แต่สรุปอัตโนมัติจากประเภทของแต่ละบรรทัด — ใบเดียวมีได้หลายประเภท จึงกาได้หลายช่อง */
  const typesUsed = new Set(items.map(r => r.item_type).filter(Boolean));

  const typeLabel = v => FORM.assetTypes.find(t => t.value === v)?.labelPrint || '';

  const itemRows = rows.map((r, i) => `
    <tr>
      <td class="ctr">${r ? i + 1 : ''}</td>
      <td>${esc(r?.description || '')}</td>
      <td class="ctr">${esc(typeLabel(r?.item_type))}</td>
      <td class="ctr">${qtyFmt(r?.qty)}</td>
      <td class="num">${money(r?.unit_price, true)}</td>
      <td class="num">${money(r?.amount, true)}</td>
      <td>${esc(r?.note || '')}</td>
    </tr>`).join('');

  /* ส่วนงานสินทรัพย์ — ที่ฝ่ายสินทรัพย์/บัญชีกรอกไว้ในระบบ
     เว้นบรรทัดว่างต่อท้ายให้ครบ FORM.assetRows เผื่อเขียนเพิ่มด้วยมือหน้างาน */
  const aRows = [...assets];
  while (aRows.length < FORM.assetRows) aRows.push(null);

  const assetRows = aRows.map((a, i) => `
    <tr>
      <td class="ctr">${a ? i + 1 : ''}</td>
      <td>${esc(a?.asset_code || '')}</td>
      <td>${esc(a?.asset_name || '')}</td>
      <td class="ctr">${qtyFmt(a?.qty)}</td>
      <td class="num">${money(a?.unit_value, true)}</td>
      <td class="num">${money(a?.amount, true)}</td>
    </tr>`).join('');

  const assetQty   = assets.reduce((n, a) => n + (Number(a.qty) || 0), 0);
  const assetValue = assets.reduce((n, a) => n + (Number(a.amount) || 0), 0);

  const sign1 = FORM.signRow1.map(s =>
    s.auto === 'requester'
      ? signBox({ title: s.title, name: h.requester_name, position: h.requester_pos })
      : signBox(s)).join('');

  const footer = (page) => `
    <div class="foot">
      <span class="code">${esc(FORM.formCode)}</span>
      <span class="note">${esc(FORM.footNote)}</span>
      <span class="stamp">${esc(h.doc_no || 'ยังไม่ออกเลข')} · ครั้งที่ ${h.version || '-'} · พิมพ์ ${stampTH()} · หน้า ${page}/2</span>
    </div>`;

  return `
  <section class="sheet">

    <div class="hd">
      <div>
        <h1>${esc(FORM.title)}</h1>
        <h2>${esc(FORM.titleEn)}</h2>
        ${orgName ? `<div style="text-align:center;font-size:8pt">${esc(orgName)}</div>` : ''}
      </div>
      <div>
        <div class="docno"><span>เลขที่เอกสาร</span><span class="v">${esc(h.doc_no || '')}</span></div>
        <div style="margin-top:1.5mm;display:grid;gap:.6mm">
          ${FORM.assetTypes.map(t => `<div>${cb(typesUsed.has(t.value), t.label)}</div>`).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top:1.5mm">${fld('ชื่อผู้ขายที่แนะนำ (ถ้ามี)', h.vendor_suggest)}</div>

    <div class="meta">
      <div style="display:grid;gap:1mm">
        ${fld('Division Cost Center', h.cost_center)}
        ${fld('เหตุผลในการขอซื้อ :', h.reason)}
      </div>
      <div class="right">
        ${fld('วัน/เดือน/ปี', dateTH(h.doc_date))}
        ${fld('แผนก/สาขา', h.department)}
      </div>
    </div>

    <table class="items">
      <colgroup>
        <col style="width:4.8%"><col style="width:32.7%"><col style="width:11.9%">
        <col style="width:6.4%"><col style="width:13.2%"><col style="width:11.8%"><col style="width:19.2%">
      </colgroup>
      <thead>
        <tr>
          <th>ลำดับ</th><th>ชื่อและรายละเอียดสิ่งที่ต้องการ</th><th>ประเภท</th>
          <th>จำนวน</th><th>ราคาต่อหน่วย<br>(ถ้าทราบ)</th><th>จำนวนเงิน</th><th>หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="mid">
      <div class="extra">
        <p><b>รายละเอียดเพิ่มเติม</b></p>
        <p>${cb(h.pay_no_supplier, 'ไม่ต้องทำจ่ายซัพ')}${cb(h.pay_normal_cycle, 'ทำจ่ายเงินให้กับซัพฯ ตามรอบปกติ')}</p>
        <p>${cb(h.refund_transfer, 'โอนเงินคืน')} ธนาคาร <u>${esc(h.refund_bank || ' '.repeat(18))}</u>
           ${cb(h.clear_advance, 'เคลียร์เงินทดรองจ่าย')}</p>
        <p>${cb(h.at_branch, 'สินค้า / สินทรัพย์ / อุปกรณ์ / อื่นๆ ณ ปัจจุบันอยู่ที่สาขาแล้ว')}</p>
        <p>${cb(h.install_wait, 'รอช่าง/เจ้าของงานมาติดตั้งวันที่')} <u>${esc(dateTH(h.install_date) || ' '.repeat(14))}</u>
           &nbsp; ชื่อผู้รับมอบงาน <u>${esc(h.receiver_name || ' '.repeat(20))}</u></p>
        <p>${cb(h.pay_by_period, 'ทำจ่ายตามรอบ — งวดที่')} <u>${esc(h.period_no || ' '.repeat(8))}</u>
           &nbsp; เลขที่ใบเคลียร์ <u>${esc(h.clear_doc_no || ' '.repeat(14))}</u></p>
      </div>
      <div>
        <div class="sums">
          <span class="k">รวมเป็นเงิน</span>        <span class="v">${money(h.subtotal)}</span>    <span>บาท</span>
          <span class="k">VAT ${money(h.vat_rate).replace('.00','')} %</span>
                                                    <span class="v">${money(h.vat_amount)}</span>  <span>บาท</span>
          <span class="k">หักภาษี ณ ที่จ่าย ${money(h.wht_rate).replace('.00','')} %</span>
                                                    <span class="v">${money(h.wht_amount)}</span>  <span>บาท</span>
          <span class="k grand">ยอดรวม</span>       <span class="v grand">${money(h.grand_total)}</span> <span>บาท</span>
          <div class="bahttext">(${esc(bahtText(h.grand_total))})</div>
        </div>
      </div>
    </div>

    <div class="row3">
      <div>
        <h4>เงื่อนไขเพิ่มเติม</h4>
        <ol class="cond">${FORM.conditions.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
      </div>
      <div>
        <h4>ความคิดเห็นจากฝ่าย IT</h4>
        <p style="margin:0 0 1mm">${cb(h.it_opinion === 'agree', 'เห็นชอบ')}${cb(h.it_opinion === 'disagree', 'ไม่เห็นชอบ')}</p>
        <p style="margin:0">รายละเอียดเพิ่มเติม : ${esc(h.it_note || '')}</p>
        <p style="margin:2mm 0 0">ลงชื่อ ${h.it_name ? esc(h.it_name) : '.'.repeat(26)}</p>
      </div>
    </div>

    <div class="signs n4">${sign1}</div>

    ${footer(1)}
  </section>

  <section class="sheet">

    <div class="band" style="border-top:var(--thin)">สำหรับส่วนงานสินทรัพย์</div>
    <div class="band" style="font-weight:400">
      (สินทรัพย์ชุดใหญ่ มูลค่า 5,000 บาทขึ้นไป / สินทรัพย์ชุดเล็ก มูลค่าต่ำกว่า 5,000 บาท)
    </div>

    <table class="assets" style="margin-top:2mm">
      <colgroup>
        <col style="width:6.8%"><col style="width:16.1%"><col style="width:46%">
        <col style="width:6.8%"><col style="width:12.9%"><col style="width:11.4%">
      </colgroup>
      <thead>
        <tr>
          <th>ลำดับ</th><th>รหัสสินทรัพย์</th><th>ชื่อสินทรัพย์</th>
          <th>จำนวน<br>สินทรัพย์</th><th>มูลค่าสินทรัพย์<br>/ หน่วย</th><th>มูลค่า<br>สินทรัพย์</th>
        </tr>
      </thead>
      <tbody>${assetRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="border:0"></td>
          <th style="text-align:end">จำนวนสินทรัพย์รวม</th><td class="ctr">${qtyFmt(assetQty)}</td>
          <th style="text-align:end">มูลค่าสินทรัพย์รวม</th><td class="num">${money(assetValue, true)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="signs n5" style="margin-top:3mm">
      ${FORM.signAsset.map(signBox).join('')}
    </div>

    <div class="band" style="margin-top:5mm;border-top:var(--thin)">กรณียกเลิกการสั่งซื้อ</div>
    <div class="signs n4">${FORM.signCancel.map(signBox).join('')}</div>

    ${footer(2)}
  </section>`;

}
