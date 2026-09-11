/* =============================================================
   วาดใบขอจัดซื้อ A4 ตามฟอร์มกระดาษเดิม RE15072569 F-HR

   แยกจาก print.js เพื่อให้หน้าพิมพ์ หน้าพรีวิว และชุด export
   ใช้ตัววาดตัวเดียวกัน — ใบที่เห็นบนจอกับใบที่พิมพ์ออกมาจึงตรงกันเสมอ

   หลักที่ยึด: ช่องที่ระบบรู้ค่า ให้พิมพ์ค่าลงไป
               ช่องที่คนต้องเติมตอนเดินเอกสาร ให้เว้นเส้นไว้เขียนมือ
   ============================================================= */
import { cfg, money, esc, baht, thDate, KIND_LABEL, REASON_LABEL } from './util.js';

export const EXEC_TITLE = {
  ceo: 'ประธานเจ้าหน้าที่บริหาร',
  coo: 'ประธานเจ้าหน้าที่สายงานปฏิบัติการ'
};

// ทั้งสองตารางยาวตามของจริง แล้วเว้นบรรทัดว่างไว้เขียนเพิ่มด้วยมือตารางละ 3 บรรทัด
// ไม่ตรึงจำนวนแถวเหมือนฟอร์มกระดาษ — ใบที่มีรายการเดียวจะได้ไม่ลากตารางเปล่ายาวโดยเปล่าประโยชน์
const BLANK_ROWS = 3;

// สองตารางรวมกันได้ 16 แถวจึงจะยังจบในหน้าเดียว เกินจากนี้ตัดบรรทัดว่างทิ้งก่อนเสมอ
// (วัดจากของจริง: 18 แถวสูง 1,085px ขณะที่ A4 หลังหักขอบมี 1,070px)
const ROW_BUDGET = 16;

/** แบ่งโควตาบรรทัดว่างให้สองตาราง โดยตัดของตารางที่ว่างเยอะกว่าออกก่อน */
function blankRows(itemCount, assetCount) {
  let items = BLANK_ROWS, assets = BLANK_ROWS;
  while (itemCount + assetCount + items + assets > ROW_BUDGET && items + assets > 0) {
    if (assets >= items) assets--; else items--;
  }
  return { items, assets };
}

/* ---------------- ตัวช่วยวาด ---------------- */

const box = (on, text) => `<span class="cb"><i>${on ? 'X' : ''}</i>${esc(text)}</span>`;

/** ช่องลายเซ็น — ชื่อที่รู้ค่าจะพิมพ์ให้ ที่ไม่รู้เว้นจุดไว้เขียนมือ */
function slot({ name = '', pos = '', date = '', showDate = true }) {
  return `
    <div class="sigslot">
      <div class="ink"></div>
      <div class="nm">${name ? `<span class="fill">${esc(name)}</span>` : '&nbsp;'.repeat(18)}</div>
      <div class="pos">${esc(pos)}</div>
      ${showDate ? `<div class="dt">${date
        ? `<span class="fill">${esc(date)}</span>`
        : '........../........../..........'}</div>` : ''}
    </div>`;
}

export function renderSheet(pr) {
  const m = money(pr, pr.items);
  const dept = pr.department || {};
  const execTitle = EXEC_TITLE[dept.approver] || EXEC_TITLE.coo;
  const managerLimit = (cfg.MANAGER_LIMIT ?? 500).toLocaleString('th-TH');
  const assetSplit = (cfg.ASSET_SPLIT ?? 5000).toLocaleString('th-TH');
  const cancelled = pr.status === 'cancelled';
  const superseded = pr.status === 'superseded';

  /* ----- รายการสินค้า เติมแถวว่างให้ครบตามฟอร์มเดิม ----- */
  const itemRows = [];
  (pr.items || []).forEach((it, i) => {
    const amt = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    itemRows.push(`
      <tr>
        <td class="c-no">${i + 1}</td>
        <td><span class="fill">${esc(it.name)}</span>${
          it.detail ? `<div class="detail fill">${esc(it.detail)}</div>` : ''}</td>
        <td class="c-qty fill">${esc(it.qty)}</td>
        <td class="c-price num fill">${baht(it.unit_price)}</td>
        <td class="c-amt num fill">${baht(amt)}</td>
        <td class="c-note fill">${esc(it.note || '')}</td>
      </tr>`);
  });

  /* ----- บล็อกสินทรัพย์ ----- */
  const assetRows = [];
  (pr.assets || []).forEach((a, i) => {
    assetRows.push(`
      <tr>
        <td class="c-no">${i + 1}</td>
        <td class="c-code fill">${esc(a.asset_code)}</td>
        <td class="fill">${esc(a.asset_name)}</td>
        <td class="c-val num fill">${baht(a.asset_value)}</td>
      </tr>`);
  });
  const blanks = blankRows(itemRows.length, assetRows.length);
  for (let i = 0; i < blanks.items; i++) {
    itemRows.push('<tr><td class="c-no"></td><td></td><td class="c-qty"></td><td class="c-price"></td><td class="c-amt"></td><td class="c-note"></td></tr>');
  }
  for (let i = 0; i < blanks.assets; i++) {
    assetRows.push('<tr><td class="c-no"></td><td class="c-code"></td><td></td><td class="c-val"></td></tr>');
  }
  const assetTotal = (pr.assets || []).reduce((s, a) => s + (Number(a.asset_value) || 0), 0);

  return `
  <div class="sheet">
    ${cancelled ? '<div class="wm"><span>ยกเลิก</span></div>' : ''}
    ${superseded ? '<div class="wm"><span>ถูกแทนที่</span></div>' : ''}

    <!-- ============ หัวใบ ============ -->
    <div class="hd">
      <div>
        <div class="logo">สมใจ</div>
        <div class="co">${esc(cfg.COMPANY_NAME || '')}</div>
        <div class="vend">
          ชื่อผู้ขายที่แนะนำ (ถ้ามี)
          <div class="val">${esc(pr.suggested_vendor || '')}</div>
        </div>
      </div>
      <div class="ttl">
        <h1>ใบขอจัดซื้อ</h1>
        <h2>PURCHASE REQUEST</h2>
      </div>
      <div>
        <div class="docno">เลขที่เอกสาร <b>${esc(pr.doc_no || '— ยังไม่ได้ยื่น —')}</b>${
          pr.rev ? ` <b>Rev.${pr.rev}</b>` : ''}</div>
        <table class="typebox">
          <tr><td>${pr.doc_type === 'asset_large' ? 'X' : ''}</td>
              <td>สินทรัพย์ชุดใหญ่ <span class="xs">(มูลค่า ${assetSplit} บาทขึ้นไป)</span></td></tr>
          <tr><td>${pr.doc_type === 'asset_small' ? 'X' : ''}</td>
              <td>สินทรัพย์ชุดเล็ก <span class="xs">(มูลค่าต่ำกว่า ${assetSplit} บาท)</span></td></tr>
          <tr><td>${pr.doc_type === 'expense' ? 'X' : ''}</td>
              <td>ค่าใช้จ่าย <span class="xs">(ส่ง PU ดำเนินการต่อ)</span></td></tr>
        </table>
      </div>
    </div>

    <!-- ============ ประเภทคำขอ ============ -->
    <div class="kinds">
      ${Object.entries(KIND_LABEL).map(([k, t]) => box(pr.request_kind === k, t)).join('')}
    </div>

    <!-- ============ เหตุผล / cost center / วันที่ ============ -->
    <div class="reasons">
      <div class="cc">
        <div class="lbl">Division Cost Center</div>
        <div class="val">${esc(pr.cost_center || dept.cost_center || '')}</div>
      </div>
      <div class="mid">
        <div class="lbl">เหตุผลในการขอซื้อ :</div>
        <div class="opts">
          ${['damaged', 'lost', 'out_of_stock', 'new_branch'].map(k =>
            box(pr.reason === k, REASON_LABEL[k])).join('')}
          <span class="cb"><i>${pr.reason === 'other' ? 'X' : ''}</i><span class="fill">${
            esc(pr.reason_other || 'อื่น ๆ ....................')}</span></span>
        </div>
      </div>
      <div class="meta">
        <div><span>วัน/เดือน/ปี</span><span class="fill b">${thDate(pr.doc_date)}</span></div>
        <div><span>แผนก/สาขา</span><span class="fill">${
          esc(dept.name || '')}${pr.branch ? ' / ' + esc(pr.branch.name) : ''}</span></div>
      </div>
    </div>

    <!-- ============ รายการที่ขอซื้อ ============ -->
    <table class="items">
      <thead>
        <tr>
          <th class="c-no">ลำดับ</th>
          <th>ชื่อและรายละเอียดสิ่งที่ต้องการ</th>
          <th class="c-qty">จำนวน</th>
          <th class="c-price">ราคาต่อหน่วย</th>
          <th class="c-amt">จำนวนเงิน</th>
          <th class="c-note">หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>${itemRows.join('')}</tbody>
    </table>

    <!-- ============ วิธีจ่ายเงิน + ยอดรวม ============ -->
    <div class="payrow">
      <div class="pay">
        <div class="side">รายละเอียดเพิ่มเติม</div>
        <div class="opts">
          <div class="ln">
            ${box(pr.payment_method === 'no_pay', 'ไม่ต้องทำจ่ายซัพ')}
            ${box(pr.payment_method === 'normal_cycle', 'ทำจ่ายเงินให้กับซัพฯ ตามรอบปกติ')}
          </div>
          <div class="ln">
            ${box(pr.payment_method === 'refund', 'โอนเงินคืน')}
            <span class="dot">${esc(pr.refund_payee || '')}</span>
            <span>ธนาคาร</span><span class="dot">${esc(pr.refund_bank || '')}</span>
          </div>
          <div class="ln">
            ${box(pr.payment_method === 'clear_advance', 'เคลียร์เงินทดรองจ่าย')}
            <span class="dot">${esc(pr.advance_doc_no || '')}</span>
          </div>
          <div class="ln">
            ${box(pr.already_at_branch, 'สินค้า / สินทรัพย์ / อุปกรณ์ / อื่นๆ ณ ปัจจุบันอยู่ที่สาขาแล้ว')}
          </div>
          <div class="ln">
            ${box(Boolean(pr.install_date), 'รอช่าง/เจ้าของงานมาติดตั้งวันที่')}
            <span class="dot">${pr.install_date ? thDate(pr.install_date) : ''}</span>
            <span>ชื่อผู้รับมอบงาน</span><span class="dot">${esc(pr.receiver_name || '')}</span>
          </div>
        </div>
      </div>
      <table class="sums">
        <tr><td>รวมเป็นเงิน</td><td class="fill">${baht(m.subtotal)}</td><td>บาท</td></tr>
        <tr class="disc"><td>หักส่วนลด</td><td class="fill">${m.discount ? '-' + baht(m.discount) : '-'}</td><td>บาท</td></tr>
        <tr><td>ยอดหลังส่วนลด</td><td class="fill b">${baht(m.net)}</td><td>บาท</td></tr>
        <tr><td>VAT ${Number(pr.vat_rate)} %</td><td class="fill">${m.vat ? baht(m.vat) : '-'}</td><td>บาท</td></tr>
        <tr><td>หักภาษี ณ ที่จ่าย ${Number(pr.wht_rate)} %</td><td class="fill">${m.wht ? '-' + baht(m.wht) : '-'}</td><td>บาท</td></tr>
        <tr class="tot"><td>ยอดรวม</td><td class="fill">${baht(m.total)}</td><td>บาท</td></tr>
      </table>
    </div>

    <!-- ============ ลายเซ็นชุดที่ 1 ============ -->
    <div class="sigs sig6">
      <div>
        <div class="cap">เงื่อนไขเพิ่มเติม</div>
        <div class="body terms">
          <ol>
            <li>กรณีเป็นสินทรัพย์ Non Fixed Asset ทุกประเภท ต้องผ่านฝ่ายสินทรัพย์</li>
            <li>กรณีขอซื้ออุปกรณ์ IT หรือกึ่ง IT ทุกประเภท จะต้องได้รับความเห็นชอบจากฝ่าย IT ทุกครั้ง</li>
            <li>ระดับผู้จัดการฝ่าย สามารถอนุมัติ PR ได้ไม่เกินมูลค่า ${managerLimit} บาท หากเกินต้องได้รับอนุมัติจากประธานเจ้าหน้าที่สายงานของแต่ละฝ่าย</li>
          </ol>
        </div>
      </div>
      <div>
        <div class="cap">ความคิดเห็นจากฝ่าย IT</div>
        <div class="body itbox">
          ${pr.needs_it ? `
            ${box(pr.it_opinion === 'approve', 'เห็นชอบ')}
            ${box(pr.it_opinion === 'reject', 'ไม่เห็นชอบ')}
            <div>รายละเอียดเพิ่มเติม :</div>
            <div class="note">${esc(pr.it_note || '')}</div>
            ${slot({ pos: 'ลงชื่อ ฝ่ายไอที', date: pr.it_at ? thDate(pr.it_at) : '' })}
          ` : `
            ${box(false, 'เห็นชอบ')}
            ${box(false, 'ไม่เห็นชอบ')}
            <div class="xs" style="margin-top:2mm">ไม่ใช่รายการ IT / กึ่ง IT<br>— ไม่ต้องผ่านฝ่าย IT —</div>
          `}
        </div>
      </div>
      <div>
        <div class="cap">ขอซื้อโดย</div>
        <div class="body">${slot({
          name: pr.creator_name || '', pos: pr.creator_position || 'ผู้ขอซื้อ', date: thDate(pr.doc_date)
        })}</div>
      </div>
      <div>
        <div class="cap">ผู้รับผิดชอบสินทรัพย์</div>
        <div class="body">${slot({ pos: 'ผู้ดูแลสินทรัพย์' })}</div>
      </div>
      <div>
        <div class="cap">ตรวจสอบโดย</div>
        <div class="body">${slot({ pos: `ผู้จัดการ${esc(dept.name || 'ฝ่าย')}` })}</div>
      </div>
      <div>
        <div class="cap">อนุมัติโดย</div>
        <div class="body">${slot({ pos: execTitle })}</div>
      </div>
    </div>

    <!-- ============ ส่วนงานสินทรัพย์ ============ -->
    <div class="assethd">
      <div class="t">สำหรับส่วนงานสินทรัพย์</div>
      <div class="xs">(สินทรัพย์ชุดใหญ่ มูลค่า ${assetSplit} บาทขึ้นไป / สินทรัพย์ชุดเล็ก มูลค่าต่ำกว่า ${assetSplit} บาท)</div>
    </div>
    <table class="assets">
      <thead>
        <tr>
          <th class="c-no">ลำดับ</th>
          <th class="c-code">รหัสสินทรัพย์</th>
          <th>ชื่อสินทรัพย์</th>
          <th class="c-val">มูลค่าสินทรัพย์</th>
        </tr>
      </thead>
      <tbody>
        ${assetRows.join('')}
        <tr class="sumrow">
          <td colspan="2" class="rgt">จำนวนสินทรัพย์ทั้งหมด <span class="fill">${
            (pr.assets || []).length || ''}</span> รายการ</td>
          <td class="rgt">มูลค่าสินทรัพย์รวม</td>
          <td class="c-val num fill">${assetTotal ? baht(assetTotal) : ''}</td>
        </tr>
      </tbody>
    </table>

    <div class="sigs sig5">
      <div><div class="cap">ออกรหัสสินทรัพย์โดย</div>
        <div class="body">${slot({
          pos: 'เจ้าหน้าที่ฝ่ายบัญชี',
          date: pr.assets?.[0]?.coded_at ? thDate(pr.assets[0].coded_at) : ''
        })}</div></div>
      <div><div class="cap">ดำเนินการ / ตรวจสอบโดย</div>
        <div class="body">${slot({ pos: 'เจ้าหน้าที่ธุรการสินทรัพย์' })}</div></div>
      <div><div class="cap">ตรวจสอบโดย</div>
        <div class="body">${slot({ pos: `ผู้จัดการ${esc(dept.name || 'ฝ่าย')}` })}</div></div>
      <div><div class="cap">อนุมัติโดย</div>
        <div class="body">${slot({ pos: EXEC_TITLE.coo })}</div></div>
      <div><div class="cap">แผนกจัดซื้อรับเรื่อง</div>
        <div class="body">${slot({ pos: 'เจ้าหน้าที่จัดซื้อ' })}</div></div>
    </div>

    <!-- ============ กรณียกเลิก ============ -->
    <div class="cancelhd">กรณียกเลิกการสั่งซื้อ</div>
    <div class="sigs sig4">
      <div><div class="cap">รับทราบ - จัดซื้อ</div><div class="body">${slot({ pos: 'แผนกจัดซื้อ' })}</div></div>
      <div><div class="cap">รับทราบ - HR</div><div class="body">${slot({ pos: 'ฝ่ายทรัพยากรบุคคลและธุรการ' })}</div></div>
      <div><div class="cap">รับทราบ - ACC</div><div class="body">${slot({ pos: 'ฝ่ายบัญชี' })}</div></div>
      <div><div class="cap">ผู้ดำเนินการ - ผู้ขอซื้อ</div><div class="body">${slot({ pos: 'ผู้ขอซื้อ' })}</div></div>
    </div>

    <div class="foot">
      <span>${esc(cfg.FORM_CODE || '')}</span>
      <span>หมายเหตุ : ${esc(cfg.FORM_FOOTER || '')}</span>
    </div>
  </div>`;
}
