/* =============================================================
   กรอก / แก้ไข / ยื่น ใบขอจัดซื้อ

   หน้าจอแบ่งเป็นสองคอลัมน์
   · ซ้าย  — ฟอร์มกรอกข้อมูล เรียงตามลำดับที่คนกรอกจริง
   · ขวา   — ยอดที่ใช้ตัดงบ เส้นทางอนุมัติ และสิ่งที่ยังติดอยู่
              เพื่อให้รู้ตั้งแต่ต้นว่าทำไมใบนี้ยังปริ้นไม่ได้ ไม่ใช่รู้ตอนกดปุ่มแล้วเด้ง error

   กติกาที่บังคับในหน้านี้
   · ปริ้นแล้วล็อก — แก้ต่อไม่ได้ ต้องออกฉบับแก้ไข
   · ใบสินทรัพย์ต้องมีรหัสสินทรัพย์ครบก่อนจึงปริ้นได้
   · รายการที่เป็นหมวด IT จะติดธง "ต้องผ่านฝ่าย IT" ให้เอง
   ============================================================= */
import {
  cfg, requireSession, me, can, appbar, master, getPR, createDraft, savePR,
  saveItems, saveAssets, submitPR, revisePR, setITOpinion, money,
  esc, baht, isAsset, DOC_TYPE_LABEL, STATUS_LABEL, REASON_LABEL, KIND_LABEL, PAY_LABEL
} from './db.js';

const EXEC_TITLE = { ceo: 'ประธานเจ้าหน้าที่บริหาร', coo: 'ประธานเจ้าหน้าที่สายงานปฏิบัติการ' };

await requireSession();
const profile = await me();
document.getElementById('bar').innerHTML = appbar(profile, 'index.html');

const main = document.getElementById('main');
const id = new URLSearchParams(location.search).get('id');
const { departments, branches, categories } = await master();

if (!profile?.active || !profile?.department_id) {
  main.innerHTML = '<div class="notebox">บัญชีนี้ยังไม่ได้กำหนดฝ่ายหรือสิทธิ์ — แจ้งแอดมินก่อน</div>';
  throw new Error('no profile');
}

/* ---------------- สถานะในหน่วยความจำ ---------------- */

let pr, items, assets;

if (id) {
  pr = await getPR(id);
  if (!pr) { main.innerHTML = '<div class="errbox">ไม่พบใบนี้ หรือคุณไม่มีสิทธิ์เปิดดู</div>'; throw new Error('404'); }
  items = pr.items.length ? pr.items : [blankItem()];
  assets = pr.assets;
} else {
  const dept = departments.find(d => d.id === profile.department_id) || departments[0];
  pr = {
    doc_type: 'expense', request_kind: 'buy',
    department_id: dept?.id, branch_id: branches.find(b => b.code === '00')?.id,
    cost_center: dept?.cost_center || '',
    doc_date: new Date().toISOString().slice(0, 10),
    reason: 'out_of_stock', reason_other: '', suggested_vendor: '',
    needs_it: false, payment_method: 'normal_cycle',
    refund_bank: '', refund_payee: '', advance_doc_no: '',
    already_at_branch: false, install_date: '', receiver_name: '',
    discount: 0, vat_rate: cfg.DEFAULT_VAT ?? 7, wht_rate: cfg.DEFAULT_WHT ?? 0,
    status: 'draft', rev: 0
  };
  items = [blankItem()];
  assets = [];
}

const locked = ['printed', 'approved', 'cancelled', 'superseded'].includes(pr.status);
const isOwner = !id || pr.created_by === profile.user_id;
const canEdit = !locked && (isOwner || can(profile, 'admin'));
const canCode = !locked && (can(profile, 'asset_accountant') || can(profile, 'admin'));
const canIT   = !locked && (can(profile, 'it') || can(profile, 'admin'));

function blankItem() {
  return { name: '', detail: '', category_id: '', qty: 1, unit_price: 0, note: '' };
}

const dis = ok => ok ? '' : 'disabled';

/* ---------------- วาดหน้า ---------------- */

render();

function render() {
  const st = STATUS_LABEL[pr.status] || { t: pr.status, c: 'st-mute' };
  const asset = isAsset(pr.doc_type);

  main.innerHTML = `
    <div class="pagehead">
      <div>
        <div class="eyebrow">${pr.doc_no ? 'ใบขอจัดซื้อ' : 'ใบขอจัดซื้อใหม่'}</div>
        <h1 class="${pr.doc_no ? 'docno' : ''}">${
          pr.doc_no ? esc(pr.doc_no) : 'ยังไม่ได้ยื่น'}${
          pr.rev ? ` <span class="pill st-mute">Rev.${pr.rev}</span>` : ''}</h1>
        <p class="lead" style="margin-top:7px;display:flex;gap:9px;align-items:center;flex-wrap:wrap">
          <span class="pill ${st.c}">${esc(st.t)}</span>
          ${pr.doc_no ? '' : '<span>เลขที่เอกสารจะออกให้อัตโนมัติเมื่อกดยื่น</span>'}
        </p>
      </div>
      <span class="grow"></span>
      <a class="btn quiet" href="index.html">← กลับรายการ</a>
    </div>

    <div id="msg"></div>
    ${locked ? `<div class="notebox"><b>ใบนี้ถูกล็อกแล้ว (${esc(st.t)})</b> — แก้เนื้อหาไม่ได้
      ${isOwner || can(profile, 'admin') ? 'ถ้าต้องแก้ ให้กด “ออกฉบับแก้ไข” ที่แถบด้านล่าง' : ''}</div>` : ''}

    <div class="layout">
      <div class="col-main">

        <!-- ---------- 1. ข้อมูลใบ ---------- -->
        <section class="card">
          <header><span class="n">1</span><h2>ข้อมูลใบ</h2></header>
          <div class="body">
            <div class="grid g2">
              <label><span class="req">ประเภทเอกสาร</span>
                <select id="doc_type" ${dis(canEdit)}>
                  ${Object.entries(DOC_TYPE_LABEL).map(([k, t]) =>
                    `<option value="${k}" ${pr.doc_type === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select></label>
              <label><span>ลักษณะคำขอ</span>
                <select id="request_kind" ${dis(canEdit)}>
                  ${Object.entries(KIND_LABEL).map(([k, t]) =>
                    `<option value="${k}" ${pr.request_kind === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select></label>
              <label><span class="req">ฝ่ายผู้ขอ</span>
                <select id="department_id" ${dis(canEdit)}>
                  ${departments.map(d => `<option value="${d.id}" ${pr.department_id === d.id ? 'selected' : ''}>${
                    esc(d.code)} — ${esc(d.name)}</option>`).join('')}
                </select></label>
              <label><span class="req">สาขา/หน่วยงานที่ใช้ของ</span>
                <select id="branch_id" ${dis(canEdit)}>
                  ${branches.map(b => `<option value="${b.id}" ${pr.branch_id === b.id ? 'selected' : ''}>${
                    esc(b.code)} — ${esc(b.name)}</option>`).join('')}
                </select></label>
              <label><span>Division Cost Center</span>
                <input id="cost_center" value="${esc(pr.cost_center || '')}" ${dis(canEdit)}></label>
              <label><span class="req">วัน/เดือน/ปี</span>
                <input type="date" id="doc_date" value="${esc(pr.doc_date)}" ${dis(canEdit)}></label>
              <label><span>ชื่อผู้ขายที่แนะนำ (ถ้ามี)</span>
                <input id="suggested_vendor" value="${esc(pr.suggested_vendor || '')}" ${dis(canEdit)}></label>
              <label><span>เหตุผลในการขอซื้อ</span>
                <select id="reason" ${dis(canEdit)}>
                  ${Object.entries(REASON_LABEL).map(([k, t]) =>
                    `<option value="${k}" ${pr.reason === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select></label>
              <label id="reason_other_wrap" style="${pr.reason === 'other' ? '' : 'display:none'}">
                <span>ระบุเหตุผล</span>
                <input id="reason_other" value="${esc(pr.reason_other || '')}" ${dis(canEdit)}></label>
            </div>
          </div>
        </section>

        <!-- ---------- 2. รายการ ---------- -->
        <section class="card">
          <header><span class="n">2</span><h2>รายการที่ขอซื้อ</h2>
            <span class="hint">ราคาต่อหน่วยเป็นช่องบังคับ — ผู้บริหารต้องเซ็นยอดจริง</span></header>
          <div class="body tight">
            <div class="tablebox" style="margin-top:6px">
              <table class="items">
                <thead>
                  <tr>
                    <th style="width:34px">#</th>
                    <th>ชื่อและรายละเอียด</th>
                    <th style="width:152px">หมวด</th>
                    <th class="num" style="width:76px">จำนวน</th>
                    <th class="num" style="width:112px">ราคา/หน่วย</th>
                    <th class="num" style="width:112px">จำนวนเงิน</th>
                    <th style="width:118px">หมายเหตุ</th>
                    <th style="width:42px"></th>
                  </tr>
                </thead>
                <tbody id="itemrows"></tbody>
              </table>
            </div>
            ${canEdit ? '<div class="actions" style="margin-top:12px"><button class="btn quiet small" id="additem" type="button">+ เพิ่มรายการ</button></div>' : ''}

            <div class="grid g3" style="margin-top:18px;max-width:560px">
              <label><span>ส่วนลด (บาท)</span>
                <input type="number" step="0.01" min="0" id="discount" value="${Number(pr.discount) || 0}" ${dis(canEdit)}></label>
              <label><span>VAT (%)</span>
                <input type="number" step="0.01" min="0" id="vat_rate" value="${Number(pr.vat_rate)}" ${dis(canEdit)}></label>
              <label><span>หักภาษี ณ ที่จ่าย (%)</span>
                <input type="number" step="0.01" min="0" id="wht_rate" value="${Number(pr.wht_rate)}" ${dis(canEdit)}></label>
            </div>
          </div>
        </section>

        <!-- ---------- 3. ฝ่าย IT ---------- -->
        <section class="card">
          <header><span class="n">3</span><h2>ความเห็นจากฝ่าย IT</h2>
            <span class="hint">อุปกรณ์ IT และกึ่ง IT ต้องผ่านฝ่าย IT ทุกครั้ง</span></header>
          <div class="body">
            <div class="radios" style="margin-bottom:14px">
              <label><input type="checkbox" id="needs_it" ${pr.needs_it ? 'checked' : ''} ${dis(canEdit)}>
                รายการนี้เป็นอุปกรณ์ IT / กึ่ง IT</label>
            </div>
            <div id="itpanel"></div>
          </div>
        </section>

        <!-- ---------- 4. สินทรัพย์ ---------- -->
        <section class="card" id="assetcard" style="${asset ? '' : 'display:none'}">
          <header><span class="n">4</span><h2>ส่วนงานสินทรัพย์</h2>
            <span class="hint">${canCode ? 'รหัสมาจากทะเบียนใน SAP ห้ามซ้ำ' : 'รหัสกรอกได้เฉพาะเจ้าหน้าที่ฝ่ายบัญชี'}</span></header>
          <div class="body tight">
            <div class="tablebox" style="margin-top:6px">
              <table class="items">
                <thead>
                  <tr>
                    <th style="width:34px">#</th>
                    <th style="width:196px">รหัสสินทรัพย์ (จาก SAP)</th>
                    <th>ชื่อสินทรัพย์</th>
                    <th class="num" style="width:122px">มูลค่า</th>
                    <th style="width:42px"></th>
                  </tr>
                </thead>
                <tbody id="assetrows"></tbody>
              </table>
            </div>
            <div class="actions" style="margin-top:12px">
              ${canEdit || canCode ? '<button class="btn quiet small" id="addasset" type="button">+ เพิ่มสินทรัพย์</button>' : ''}
              ${canEdit ? '<button class="btn quiet small" id="fromitems" type="button">ดึงจากรายการที่ขอซื้อ</button>' : ''}
            </div>
          </div>
        </section>

        <!-- ---------- 5. การจ่ายเงิน ---------- -->
        <section class="card">
          <header><span class="n">5</span><h2>รายละเอียดการจ่ายเงิน</h2>
            <span class="hint">เก็บเป็นข้อมูลบนใบเท่านั้น</span></header>
          <div class="body">
            <div class="radios" style="margin-bottom:16px">
              ${Object.entries(PAY_LABEL).map(([k, t]) => `
                <label><input type="radio" name="pay" value="${k}" ${
                  pr.payment_method === k ? 'checked' : ''} ${dis(canEdit)}> ${esc(t)}</label>`).join('')}
            </div>
            <div class="grid g2">
              <label><span>ผู้รับเงินคืน</span>
                <input id="refund_payee" value="${esc(pr.refund_payee || '')}" ${dis(canEdit)}></label>
              <label><span>ธนาคาร / เลขบัญชี</span>
                <input id="refund_bank" value="${esc(pr.refund_bank || '')}" ${dis(canEdit)}></label>
              <label><span>เลขที่เอกสารเบิกทดรองจ่าย</span>
                <input id="advance_doc_no" value="${esc(pr.advance_doc_no || '')}" ${dis(canEdit)}></label>
              <label><span>รอช่างมาติดตั้งวันที่</span>
                <input type="date" id="install_date" value="${esc(pr.install_date || '')}" ${dis(canEdit)}></label>
              <label><span>ชื่อผู้รับมอบงาน</span>
                <input id="receiver_name" value="${esc(pr.receiver_name || '')}" ${dis(canEdit)}></label>
            </div>
            <div class="radios" style="margin-top:14px">
              <label><input type="checkbox" id="already_at_branch" ${pr.already_at_branch ? 'checked' : ''} ${dis(canEdit)}>
                สินค้า / สินทรัพย์ / อุปกรณ์ ณ ปัจจุบันอยู่ที่สาขาแล้ว</label>
            </div>
          </div>
        </section>
      </div>

      <aside class="rail" id="rail"></aside>
    </div>

    <div class="actionbar">
      <div class="inner">
        <span class="sum" id="barsum"></span>
        ${canEdit ? '<button class="btn quiet" id="save" type="button">บันทึกร่าง</button>' : ''}
        ${canEdit && !pr.doc_no ? '<button class="btn" id="submit" type="button">ยื่น — ออกเลขที่เอกสาร</button>' : ''}
        ${pr.doc_no && !locked ? '<button class="btn" id="print" type="button">ตรวจและพิมพ์ใบ</button>' : ''}
        ${pr.status === 'printed' ? `<a class="btn quiet" href="print.html?id=${pr.id}">ดูใบที่พิมพ์</a>` : ''}
        ${locked && (isOwner || can(profile, 'admin')) && pr.status === 'printed'
          ? '<button class="btn danger" id="revise" type="button">ออกฉบับแก้ไข</button>' : ''}
      </div>
    </div>`;

  drawItems();
  drawAssets();
  drawIT();
  recalc();
  wire();
}

/* ---------------- ตารางรายการ ---------------- */

function drawItems() {
  document.getElementById('itemrows').innerHTML = items.map((it, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td>
        <input class="f-name" value="${esc(it.name)}" placeholder="ชื่อสิ่งที่ต้องการ" ${dis(canEdit)}>
        <input class="f-detail" value="${esc(it.detail || '')}" placeholder="รายละเอียด / สเปก (ไม่บังคับ)"
               style="margin-top:4px;font-size:12.5px" ${dis(canEdit)}>
      </td>
      <td><select class="f-cat" ${dis(canEdit)}>
        <option value="">— ไม่ระบุ —</option>
        ${categories.map(c => `<option value="${c.id}" ${it.category_id === c.id ? 'selected' : ''}>${
          esc(c.name)}${c.is_it ? ' · IT' : ''}</option>`).join('')}
      </select></td>
      <td><input class="f-qty" type="number" step="0.01" min="0" value="${Number(it.qty) || 0}" ${dis(canEdit)}></td>
      <td><input class="f-price" type="number" step="0.01" min="0" value="${Number(it.unit_price) || 0}" ${dis(canEdit)}></td>
      <td class="num f-amt">${baht((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
      <td><input class="f-note" value="${esc(it.note || '')}" ${dis(canEdit)}></td>
      <td>${canEdit && items.length > 1
        ? '<button class="btn quiet small f-del" type="button" title="ลบแถวนี้" aria-label="ลบแถวนี้">✕</button>' : ''}</td>
    </tr>`).join('');
}

function drawAssets() {
  const tb = document.getElementById('assetrows');
  if (!tb) return;
  if (!assets.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty" style="padding:26px">ยังไม่มีรายการสินทรัพย์</td></tr>';
    return;
  }
  tb.innerHTML = assets.map((a, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td><input class="a-code" value="${esc(a.asset_code || '')}" placeholder="เช่น CO1026090088"
                 style="font-family:var(--mono)" ${dis(canCode)}></td>
      <td><input class="a-name" value="${esc(a.asset_name || '')}" ${dis(canEdit || canCode)}></td>
      <td><input class="a-val" type="number" step="0.01" min="0" value="${Number(a.asset_value) || 0}" ${dis(canEdit || canCode)}></td>
      <td>${canEdit || canCode
        ? '<button class="btn quiet small a-del" type="button" title="ลบแถวนี้" aria-label="ลบแถวนี้">✕</button>' : ''}</td>
    </tr>`).join('');
}

function drawIT() {
  const el = document.getElementById('itpanel');
  if (!pr.needs_it) { el.innerHTML = '<p class="lead">ใบนี้ไม่ต้องผ่านฝ่าย IT</p>'; return; }
  if (pr.it_opinion) {
    const ok = pr.it_opinion === 'approve';
    el.innerHTML = `<div class="${ok ? 'okbox' : 'errbox'}" style="margin-bottom:0">
      ฝ่าย IT <b>${ok ? 'เห็นชอบ' : 'ไม่เห็นชอบ'}</b>${pr.it_note ? ` — ${esc(pr.it_note)}` : ''}</div>`;
    if (canIT) el.innerHTML += '<div class="actions" style="margin-top:12px"><button class="btn quiet small" id="itredo" type="button">แก้ความเห็น</button></div>';
    return;
  }
  if (!canIT) {
    el.innerHTML = '<div class="notebox" style="margin-bottom:0">รอฝ่าย IT ให้ความเห็น — ใบนี้ยังพิมพ์ไม่ได้จนกว่าฝ่าย IT จะตอบ</div>';
    return;
  }
  el.innerHTML = `
    <div class="grid">
      <label><span>รายละเอียดเพิ่มเติมจากฝ่าย IT</span>
        <textarea id="it_note">${esc(pr.it_note || '')}</textarea></label>
      <div class="actions">
        <button class="btn" id="itok" type="button">เห็นชอบ</button>
        <button class="btn danger" id="itno" type="button">ไม่เห็นชอบ</button>
      </div>
    </div>`;
}

/* ---------------- แถบสรุปด้านขวา ---------------- */

/** สิ่งที่ต้องครบก่อนจึงจะพิมพ์ใบได้ — บอกล่วงหน้า ไม่ใช่รอให้กดปุ่มแล้วเด้ง error */
function blockers() {
  const good = items.filter(i => i.name.trim());
  const list = [
    { ok: good.length > 0, t: 'มีรายการที่ขอซื้ออย่างน้อย 1 รายการ' },
    { ok: good.length > 0 && good.every(i => Number(i.unit_price) > 0), t: 'กรอกราคาต่อหน่วยครบทุกรายการ' },
    { ok: Boolean(pr.branch_id), t: 'ระบุสาขา/หน่วยงานที่ใช้ของ' }
  ];
  if (pr.needs_it) list.push({ ok: Boolean(pr.it_opinion), t: 'ฝ่าย IT ให้ความเห็นแล้ว' });
  if (isAsset(pr.doc_type)) {
    const rows = assets.filter(a => a.asset_name?.trim());
    list.push({ ok: rows.length > 0, t: 'มีรายการในส่วนงานสินทรัพย์' });
    list.push({ ok: rows.length > 0 && rows.every(a => a.asset_code?.trim()), t: 'กรอกรหัสสินทรัพย์จาก SAP ครบทุกรายการ' });
  }
  return list;
}

function drawRail(m) {
  const dept = departments.find(d => d.id === pr.department_id);
  const execRole = dept?.approver || 'coo';
  const checks = blockers();
  const left = checks.filter(c => !c.ok).length;

  // เส้นทางอนุมัติ — ขั้นที่ทำในแอปกับขั้นที่เซ็นบนกระดาษ ต่างกันชัดเจน
  const route = [{ who: 'ผู้ขอซื้อ', sub: profile.full_name, done: true, paper: 'เซ็น' }];
  if (isAsset(pr.doc_type)) route.push({ who: 'ผู้ดูแลสินทรัพย์', sub: '', paper: 'แอป + เซ็น' });
  route.push({ who: 'ผู้จัดการฝ่าย', sub: dept?.name || '', paper: 'เซ็น' });
  if (isAsset(pr.doc_type)) {
    route.push({
      who: 'บัญชี — ออกรหัสสินทรัพย์', sub: '', paper: 'แอป + เซ็น',
      done: assets.length > 0 && assets.every(a => a.asset_code?.trim())
    });
  }
  route.push({ who: execRole.toUpperCase(), sub: EXEC_TITLE[execRole], paper: 'เซ็น' });
  if (isAsset(pr.doc_type)) route.push({ who: 'COO — ส่วนสินทรัพย์', sub: EXEC_TITLE.coo, paper: 'เซ็น' });
  route.push({ who: 'จัดซื้อเปิด PO', sub: '', paper: '' });

  const firstOpen = route.findIndex(r => !r.done);

  document.getElementById('rail').innerHTML = `
    <div class="card"><div class="body">
      <h3>ยอดที่ใช้ตัดงบ</h3>
      <div class="bignum">
        <b>${baht(m.net)}</b>
        <small>บาท — ยอดหลังส่วนลด ก่อน VAT ไม่หักภาษี ณ ที่จ่าย</small>
      </div>
      <div class="minitotals">
        <span>รวมเป็นเงิน</span><span>${baht(m.subtotal)}</span>
        <span>หักส่วนลด</span><span>${m.discount ? '−' + baht(m.discount) : '—'}</span>
        <span>VAT ${Number(pr.vat_rate)}%</span><span>${baht(m.vat)}</span>
        <span>หักภาษี ณ ที่จ่าย ${Number(pr.wht_rate)}%</span><span>${m.wht ? '−' + baht(m.wht) : '—'}</span>
        <span style="font-weight:600;color:var(--ink)">ยอดรวม</span>
        <span style="font-weight:600">${baht(m.total)}</span>
      </div>
    </div></div>

    <div class="card"><div class="body">
      <h3>ก่อนพิมพ์ใบ ${left ? `— เหลือ ${left} ข้อ` : '— ครบแล้ว'}</h3>
      <ul class="checks">
        ${checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}"><i>${c.ok ? '✓' : '✕'}</i><span>${esc(c.t)}</span></li>`).join('')}
      </ul>
    </div></div>

    <div class="card"><div class="body">
      <h3>เส้นทางอนุมัติ</h3>
      <ol class="route">
        ${route.map((r, i) => `
          <li class="${r.done ? 'done' : i === firstOpen ? 'now' : ''}">
            <span class="dot">${r.done ? '✓' : i + 1}</span>
            <span class="who">${esc(r.who)}
              ${r.sub ? `<small>${esc(r.sub)}</small>` : ''}
              ${r.paper ? `<span class="paper">${esc(r.paper)}</span>` : ''}</span>
          </li>`).join('')}
      </ol>
    </div></div>`;
}

/* ---------------- คำนวณยอด ---------------- */

function recalc() {
  const m = money(pr, items);
  const threshold = cfg.PR_THRESHOLD ?? 500;
  const split = cfg.ASSET_SPLIT ?? 5000;

  drawRail(m);

  const notes = [];
  if (m.net > 0 && m.net <= threshold)
    notes.push(`ยอดไม่เกิน ${baht(threshold)} บาท — ตามระเบียบยังไม่ต้องเปิดใบ PR`);
  if (isAsset(pr.doc_type))
    notes.push(`มูลค่า ${m.net >= split ? '≥' : '<'} ${baht(split)} → ควรเป็น${
      m.net >= split ? 'สินทรัพย์ชุดใหญ่' : 'สินทรัพย์ชุดเล็ก'}`);

  document.getElementById('barsum').innerHTML =
    `ยอดที่ใช้ตัดงบ <b>${baht(m.net)}</b> บาท${
      notes.length ? ` · <span style="color:var(--amber)">${esc(notes.join(' · '))}</span>` : ''}`;
}

/* ---------------- ผูก event ---------------- */

function wire() {
  const bind = (elId, key, cast = v => v) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const handler = () => { pr[key] = cast(el.type === 'checkbox' ? el.checked : el.value); afterChange(key); };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  };

  ['request_kind', 'department_id', 'branch_id', 'cost_center', 'doc_date', 'suggested_vendor',
   'reason', 'reason_other', 'refund_payee', 'refund_bank', 'advance_doc_no',
   'install_date', 'receiver_name'].forEach(k => bind(k, k));
  ['discount', 'vat_rate', 'wht_rate'].forEach(k => bind(k, k, Number));
  bind('needs_it', 'needs_it');
  bind('already_at_branch', 'already_at_branch');
  bind('doc_type', 'doc_type');

  document.querySelectorAll('input[name=pay]').forEach(r =>
    r.addEventListener('change', () => { pr.payment_method = r.value; }));

  /* -- รายการ -- */
  const rows = document.getElementById('itemrows');
  rows.addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const it = items[+tr.dataset.i];
    if (e.target.classList.contains('f-name'))   it.name = e.target.value;
    if (e.target.classList.contains('f-detail')) it.detail = e.target.value;
    if (e.target.classList.contains('f-qty'))    it.qty = Number(e.target.value);
    if (e.target.classList.contains('f-price'))  it.unit_price = Number(e.target.value);
    if (e.target.classList.contains('f-note'))   it.note = e.target.value;
    tr.querySelector('.f-amt').textContent = baht((Number(it.qty) || 0) * (Number(it.unit_price) || 0));
    recalc();
  });
  rows.addEventListener('change', e => {
    if (!e.target.classList.contains('f-cat')) return;
    items[+e.target.closest('tr').dataset.i].category_id = e.target.value || null;
    autoFlagIT();
  });
  rows.addEventListener('click', e => {
    if (!e.target.classList.contains('f-del')) return;
    items.splice(+e.target.closest('tr').dataset.i, 1);
    if (!items.length) items.push(blankItem());
    render();
  });
  document.getElementById('additem')?.addEventListener('click', () => { items.push(blankItem()); render(); });

  /* -- สินทรัพย์ -- */
  const arows = document.getElementById('assetrows');
  arows?.addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr || tr.dataset.i === undefined) return;
    const a = assets[+tr.dataset.i];
    if (e.target.classList.contains('a-code')) a.asset_code = e.target.value.trim();
    if (e.target.classList.contains('a-name')) a.asset_name = e.target.value;
    if (e.target.classList.contains('a-val'))  a.asset_value = Number(e.target.value);
    recalc();
  });
  arows?.addEventListener('click', e => {
    if (!e.target.classList.contains('a-del')) return;
    assets.splice(+e.target.closest('tr').dataset.i, 1);
    render();
  });
  document.getElementById('addasset')?.addEventListener('click', () => {
    assets.push({ asset_code: '', asset_name: '', asset_value: 0 }); render();
  });
  document.getElementById('fromitems')?.addEventListener('click', () => {
    assets = items.filter(i => i.name).map(i => ({
      asset_code: '', asset_name: i.name, asset_value: (Number(i.qty) || 0) * (Number(i.unit_price) || 0)
    }));
    render();
  });

  /* -- ฝ่าย IT -- */
  document.getElementById('itok')?.addEventListener('click', () => itOpinion('approve'));
  document.getElementById('itno')?.addEventListener('click', () => itOpinion('reject'));
  document.getElementById('itredo')?.addEventListener('click', () => { pr.it_opinion = null; drawIT(); wire(); recalc(); });

  /* -- ปุ่มหลัก -- */
  document.getElementById('save')?.addEventListener('click', () => persist(true));
  document.getElementById('submit')?.addEventListener('click', doSubmit);
  document.getElementById('print')?.addEventListener('click', doPrint);
  document.getElementById('revise')?.addEventListener('click', doRevise);
}

function afterChange(key) {
  if (key === 'reason') {
    document.getElementById('reason_other_wrap').style.display = pr.reason === 'other' ? '' : 'none';
  }
  if (key === 'doc_type') {
    document.getElementById('assetcard').style.display = isAsset(pr.doc_type) ? '' : 'none';
  }
  if (key === 'department_id') {
    const d = departments.find(x => x.id === pr.department_id);
    if (d?.cost_center && !pr.cost_center) {
      pr.cost_center = d.cost_center;
      document.getElementById('cost_center').value = d.cost_center;
    }
  }
  if (key === 'needs_it') { drawIT(); wire(); }
  recalc();
}

/** หมวดในกลุ่ม IT จะติดธงให้เอง แต่ผู้ขอยังติ๊กเพิ่มเองได้ (ข้อ 21) */
function autoFlagIT() {
  const itIds = new Set(categories.filter(c => c.is_it).map(c => c.id));
  if (items.some(i => itIds.has(i.category_id)) && !pr.needs_it) {
    pr.needs_it = true;
    document.getElementById('needs_it').checked = true;
    drawIT(); wire();
    note('รายการนี้อยู่ในหมวดอุปกรณ์ IT — ระบบติ๊ก “ต้องผ่านฝ่าย IT” ให้อัตโนมัติ', 'notebox');
  }
  recalc();
}

/* ---------------- บันทึกและเปลี่ยนสถานะ ---------------- */

const msg = () => document.getElementById('msg');
function note(text, cls = 'okbox') { msg().innerHTML = `<div class="${cls}">${esc(text)}</div>`; }
function fail(e) {
  msg().innerHTML = `<div class="errbox">${esc(e.message || e)}</div>`;
  msg().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validate() {
  if (!pr.department_id) return 'ยังไม่ได้เลือกฝ่ายผู้ขอ';
  if (!pr.branch_id) return 'ยังไม่ได้เลือกสาขา/หน่วยงานที่ใช้ของ';
  const good = items.filter(i => i.name.trim());
  if (!good.length) return 'ยังไม่มีรายการที่ขอซื้อ';
  if (good.some(i => !(Number(i.unit_price) > 0)))
    return 'ทุกรายการต้องกรอกราคาต่อหน่วย — ผู้ขอต้องแนบราคามาเอง';
  if (pr.reason === 'other' && !pr.reason_other?.trim()) return 'เลือกเหตุผล “อื่น ๆ” แล้วต้องระบุเหตุผลด้วย';
  return null;
}

async function persist(showMsg) {
  const fields = {
    doc_type: pr.doc_type, request_kind: pr.request_kind,
    department_id: pr.department_id, branch_id: pr.branch_id || null,
    cost_center: pr.cost_center || null, doc_date: pr.doc_date,
    reason: pr.reason || null, reason_other: pr.reason_other || null,
    suggested_vendor: pr.suggested_vendor || null, needs_it: Boolean(pr.needs_it),
    payment_method: pr.payment_method || null,
    refund_payee: pr.refund_payee || null, refund_bank: pr.refund_bank || null,
    advance_doc_no: pr.advance_doc_no || null,
    already_at_branch: Boolean(pr.already_at_branch),
    install_date: pr.install_date || null, receiver_name: pr.receiver_name || null,
    discount: Number(pr.discount) || 0,
    vat_rate: Number(pr.vat_rate) || 0, wht_rate: Number(pr.wht_rate) || 0,
    subtotal: money(pr, items).subtotal
  };

  try {
    if (!pr.id) {
      fields.creator_name = profile.full_name;
      fields.creator_position = profile.position_title || null;
      pr.id = await createDraft(fields);
      history.replaceState(null, '', `form.html?id=${pr.id}`);
    } else {
      await savePR(pr.id, fields);
    }
    await saveItems(pr.id, items.filter(i => i.name.trim()));
    if (isAsset(pr.doc_type)) await saveAssets(pr.id, assets.filter(a => a.asset_name?.trim()));
    if (showMsg) note('บันทึกแล้ว');
    return true;
  } catch (e) { fail(e); return false; }
}

async function doSubmit() {
  const bad = validate();
  if (bad) return fail(new Error(bad));
  if (!await persist(false)) return;
  try {
    const no = await submitPR(pr.id);
    note(`ยื่นแล้ว — เลขที่เอกสาร ${no}`);
    setTimeout(() => location.reload(), 700);
  } catch (e) { fail(e); }
}

async function doPrint() {
  const bad = validate();
  if (bad) return fail(new Error(bad));

  // ใบสินทรัพย์ต้องมีรหัสครบก่อนปริ้น (ข้อ 15)
  if (isAsset(pr.doc_type)) {
    const rows = assets.filter(a => a.asset_name?.trim());
    if (!rows.length) return fail(new Error('ใบสินทรัพย์ต้องมีรายการในส่วนงานสินทรัพย์อย่างน้อย 1 รายการ'));
    if (rows.some(a => !a.asset_code?.trim()))
      return fail(new Error('ยังกรอกรหัสสินทรัพย์ไม่ครบ — รหัสต้องมาจากทะเบียนใน SAP และต้องอยู่บนใบก่อนปริ้น'));
  }
  if (pr.needs_it && !pr.it_opinion)
    return fail(new Error('ยังไม่ได้รับความเห็นจากฝ่าย IT — อุปกรณ์ IT / กึ่ง IT ต้องผ่านฝ่าย IT ก่อนทุกครั้ง'));

  if (!await persist(false)) return;
  location.href = `print.html?id=${pr.id}`;
}

async function doRevise() {
  if (!confirm('ออกฉบับแก้ไข: ใบนี้จะถูกปิดเป็น “ถูกแทนที่” และสร้างฉบับใหม่ Rev. ถัดไป ต้องปริ้นและเซ็นใหม่ทั้งใบ')) return;
  try {
    location.href = `form.html?id=${await revisePR(pr.id)}`;
  } catch (e) { fail(e); }
}

async function itOpinion(kind) {
  if (!pr.id) return fail(new Error('ต้องบันทึกใบก่อนจึงให้ความเห็นได้'));
  try {
    const noteText = document.getElementById('it_note')?.value || '';
    await setITOpinion(pr.id, kind, noteText);
    pr.it_opinion = kind;
    pr.it_note = noteText;
    pr.it_at = new Date().toISOString();
    drawIT(); wire(); recalc();
    note(kind === 'approve' ? 'บันทึกความเห็น: เห็นชอบ' : 'บันทึกความเห็น: ไม่เห็นชอบ');
  } catch (e) { fail(e); }
}
