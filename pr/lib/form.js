/* =============================================================
   กรอก / แก้ไข / ยื่น ใบขอจัดซื้อ

   กติกาที่บังคับในหน้านี้
   · ปริ้นแล้วล็อก — แก้ต่อไม่ได้ ต้องออกฉบับแก้ไข
   · ใบสินทรัพย์ต้องมีรหัสสินทรัพย์ครบก่อนจึงปริ้นได้
   · รายการที่เป็นหมวด IT จะติดธง "ต้องผ่านฝ่าย IT" ให้เอง
   ============================================================= */
import {
  cfg, sb, requireSession, me, can, appbar, master, getPR, createDraft, savePR,
  saveItems, saveAssets, submitPR, revisePR, setITOpinion, money,
  esc, baht, isAsset, DOC_TYPE_LABEL, STATUS_LABEL, REASON_LABEL, KIND_LABEL, PAY_LABEL
} from './db.js';

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

/* ---------------- วาดหน้า ---------------- */

render();

function render() {
  const st = STATUS_LABEL[pr.status] || { t: pr.status, c: 'st-mute' };
  const asset = isAsset(pr.doc_type);

  main.innerHTML = `
    <div class="pagehead">
      <div>
        <h1>${pr.doc_no ? esc(pr.doc_no) : 'ใบขอจัดซื้อใหม่'}${pr.rev ? ` <span class="pill st-mute">Rev.${pr.rev}</span>` : ''}</h1>
        <p class="lead"><span class="pill ${st.c}">${esc(st.t)}</span>
          ${pr.doc_no ? '' : ' เลขที่เอกสารจะออกให้อัตโนมัติเมื่อกดยื่น'}</p>
      </div>
      <span class="grow"></span>
      <a class="btn quiet" href="index.html">← กลับรายการ</a>
    </div>

    <div id="msg"></div>
    ${locked ? `<div class="notebox">ใบนี้ถูกล็อกแล้ว (${esc(st.t)}) — แก้เนื้อหาไม่ได้
      ${can(profile, 'admin') || isOwner ? 'ถ้าต้องแก้ ให้กด “ออกฉบับแก้ไข” ด้านล่าง' : ''}</div>` : ''}

    <!-- ---------- หัวใบ ---------- -->
    <section class="card">
      <h2>ข้อมูลใบ</h2>
      <div class="grid g2">
        <label><span class="req">ประเภทเอกสาร</span>
          <select id="doc_type" ${canEdit ? '' : 'disabled'}>
            ${Object.entries(DOC_TYPE_LABEL).map(([k, t]) =>
              `<option value="${k}" ${pr.doc_type === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select></label>
        <label><span>ลักษณะคำขอ</span>
          <select id="request_kind" ${canEdit ? '' : 'disabled'}>
            ${Object.entries(KIND_LABEL).map(([k, t]) =>
              `<option value="${k}" ${pr.request_kind === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select></label>
        <label><span class="req">ฝ่ายผู้ขอ</span>
          <select id="department_id" ${canEdit ? '' : 'disabled'}>
            ${departments.map(d =>
              `<option value="${d.id}" ${pr.department_id === d.id ? 'selected' : ''}>${esc(d.code)} — ${esc(d.name)} (${d.approver.toUpperCase()} อนุมัติ)</option>`).join('')}
          </select></label>
        <label><span class="req">สาขา/หน่วยงานที่ใช้ของ</span>
          <select id="branch_id" ${canEdit ? '' : 'disabled'}>
            ${branches.map(b =>
              `<option value="${b.id}" ${pr.branch_id === b.id ? 'selected' : ''}>${esc(b.code)} — ${esc(b.name)}</option>`).join('')}
          </select></label>
        <label><span>Division Cost Center</span>
          <input id="cost_center" value="${esc(pr.cost_center || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span class="req">วัน/เดือน/ปี</span>
          <input type="date" id="doc_date" value="${esc(pr.doc_date)}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>ชื่อผู้ขายที่แนะนำ (ถ้ามี)</span>
          <input id="suggested_vendor" value="${esc(pr.suggested_vendor || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>เหตุผลในการขอซื้อ</span>
          <select id="reason" ${canEdit ? '' : 'disabled'}>
            ${Object.entries(REASON_LABEL).map(([k, t]) =>
              `<option value="${k}" ${pr.reason === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select></label>
        <label id="reason_other_wrap" style="${pr.reason === 'other' ? '' : 'display:none'}">
          <span>ระบุเหตุผล</span>
          <input id="reason_other" value="${esc(pr.reason_other || '')}" ${canEdit ? '' : 'disabled'}></label>
      </div>
    </section>

    <!-- ---------- รายการ ---------- -->
    <section class="card">
      <h2>รายการที่ขอซื้อ</h2>
      <div class="tablebox">
        <table class="items">
          <thead>
            <tr>
              <th style="width:34px">#</th>
              <th>ชื่อและรายละเอียด</th>
              <th style="width:150px">หมวด</th>
              <th class="num" style="width:78px">จำนวน</th>
              <th class="num" style="width:110px">ราคา/หน่วย</th>
              <th class="num" style="width:110px">จำนวนเงิน</th>
              <th style="width:120px">หมายเหตุ</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="itemrows"></tbody>
        </table>
      </div>
      ${canEdit ? '<div class="actions"><button class="btn quiet" id="additem" type="button">+ เพิ่มรายการ</button></div>' : ''}

      <div class="grid g3" style="margin-top:16px">
        <label><span>ส่วนลด (บาท)</span>
          <input type="number" step="0.01" min="0" id="discount" value="${Number(pr.discount) || 0}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>VAT (%)</span>
          <input type="number" step="0.01" min="0" id="vat_rate" value="${Number(pr.vat_rate)}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>หักภาษี ณ ที่จ่าย (%)</span>
          <input type="number" step="0.01" min="0" id="wht_rate" value="${Number(pr.wht_rate)}" ${canEdit ? '' : 'disabled'}></label>
      </div>

      <div class="totals" id="totals"></div>
    </section>

    <!-- ---------- ฝ่าย IT ---------- -->
    <section class="card">
      <h2>ฝ่าย IT</h2>
      <div class="radios" style="margin-bottom:12px">
        <label><input type="checkbox" id="needs_it" ${pr.needs_it ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
          รายการนี้เป็นอุปกรณ์ IT / กึ่ง IT — ต้องผ่านความเห็นชอบจากฝ่าย IT</label>
      </div>
      <div id="itpanel"></div>
    </section>

    <!-- ---------- สินทรัพย์ ---------- -->
    <section class="card" id="assetcard" style="${asset ? '' : 'display:none'}">
      <h2>ส่วนงานสินทรัพย์</h2>
      <p class="lead" style="margin-bottom:12px">
        รหัสสินทรัพย์มาจากทะเบียนใน SAP ห้ามซ้ำ และ<b>ต้องกรอกครบก่อนจึงจะปริ้นใบได้</b>
        ${canCode ? '' : ' — ช่องรหัสกรอกได้เฉพาะเจ้าหน้าที่ฝ่ายบัญชี'}</p>
      <div class="tablebox">
        <table class="items">
          <thead>
            <tr>
              <th style="width:34px">#</th>
              <th style="width:190px">รหัสสินทรัพย์ (จาก SAP)</th>
              <th>ชื่อสินทรัพย์</th>
              <th class="num" style="width:120px">มูลค่า</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="assetrows"></tbody>
        </table>
      </div>
      <div class="actions">
        ${canEdit || canCode ? '<button class="btn quiet" id="addasset" type="button">+ เพิ่มสินทรัพย์</button>' : ''}
        ${canEdit ? '<button class="btn quiet" id="fromitems" type="button">ดึงจากรายการที่ขอซื้อ</button>' : ''}
      </div>
    </section>

    <!-- ---------- การจ่ายเงิน ---------- -->
    <section class="card">
      <h2>รายละเอียดการจ่ายเงิน</h2>
      <div class="radios" style="margin-bottom:12px">
        ${Object.entries(PAY_LABEL).map(([k, t]) => `
          <label><input type="radio" name="pay" value="${k}" ${pr.payment_method === k ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> ${esc(t)}</label>`).join('')}
      </div>
      <div class="grid g2">
        <label><span>ผู้รับเงินคืน</span>
          <input id="refund_payee" value="${esc(pr.refund_payee || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>ธนาคาร / เลขบัญชี</span>
          <input id="refund_bank" value="${esc(pr.refund_bank || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>เลขที่เอกสารเบิกทดรองจ่าย</span>
          <input id="advance_doc_no" value="${esc(pr.advance_doc_no || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>รอช่างมาติดตั้งวันที่</span>
          <input type="date" id="install_date" value="${esc(pr.install_date || '')}" ${canEdit ? '' : 'disabled'}></label>
        <label><span>ชื่อผู้รับมอบงาน</span>
          <input id="receiver_name" value="${esc(pr.receiver_name || '')}" ${canEdit ? '' : 'disabled'}></label>
      </div>
      <div class="radios" style="margin-top:12px">
        <label><input type="checkbox" id="already_at_branch" ${pr.already_at_branch ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
          สินค้า / สินทรัพย์ / อุปกรณ์ ณ ปัจจุบันอยู่ที่สาขาแล้ว</label>
      </div>
    </section>

    <div class="actions">
      ${canEdit ? '<button class="btn quiet" id="save" type="button">บันทึกร่าง</button>' : ''}
      ${canEdit && !pr.doc_no ? '<button class="btn" id="submit" type="button">ยื่น (ออกเลขที่เอกสาร)</button>' : ''}
      ${pr.doc_no && !locked ? '<button class="btn" id="print" type="button">ตรวจและพิมพ์ใบ</button>' : ''}
      ${pr.status === 'printed' ? `<a class="btn quiet" href="print.html?id=${pr.id}">ดูใบที่พิมพ์</a>` : ''}
      <span class="grow"></span>
      ${locked && (isOwner || can(profile, 'admin')) && pr.status === 'printed'
        ? '<button class="btn danger" id="revise" type="button">ออกฉบับแก้ไข (Rev.)</button>' : ''}
    </div>`;

  drawItems();
  drawAssets();
  drawIT();
  recalc();
  wire();
}

/* ---------------- รายการสินค้า ---------------- */

function drawItems() {
  const tb = document.getElementById('itemrows');
  tb.innerHTML = items.map((it, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td>
        <input class="f-name" value="${esc(it.name)}" placeholder="ชื่อสิ่งที่ต้องการ" ${canEdit ? '' : 'disabled'}>
        <input class="f-detail" value="${esc(it.detail || '')}" placeholder="รายละเอียด / สเปก (ไม่บังคับ)"
               style="margin-top:4px;font-size:12.5px" ${canEdit ? '' : 'disabled'}>
      </td>
      <td><select class="f-cat" ${canEdit ? '' : 'disabled'}>
        <option value="">— ไม่ระบุ —</option>
        ${categories.map(c => `<option value="${c.id}" ${it.category_id === c.id ? 'selected' : ''}>${
          esc(c.name)}${c.is_it ? ' ⟨IT⟩' : ''}</option>`).join('')}
      </select></td>
      <td><input class="f-qty" type="number" step="0.01" min="0" value="${Number(it.qty) || 0}" ${canEdit ? '' : 'disabled'}></td>
      <td><input class="f-price" type="number" step="0.01" min="0" value="${Number(it.unit_price) || 0}" ${canEdit ? '' : 'disabled'}></td>
      <td class="num f-amt">${baht((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
      <td><input class="f-note" value="${esc(it.note || '')}" ${canEdit ? '' : 'disabled'}></td>
      <td>${canEdit && items.length > 1 ? '<button class="btn quiet f-del" type="button" title="ลบแถว">✕</button>' : ''}</td>
    </tr>`).join('');
}

function drawAssets() {
  const tb = document.getElementById('assetrows');
  if (!tb) return;
  if (!assets.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty" style="padding:22px">ยังไม่มีรายการสินทรัพย์</td></tr>';
    return;
  }
  tb.innerHTML = assets.map((a, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td><input class="a-code" value="${esc(a.asset_code || '')}" placeholder="เช่น CO1026090088"
                 style="font-family:var(--mono)" ${canCode ? '' : 'disabled'}></td>
      <td><input class="a-name" value="${esc(a.asset_name || '')}" ${canEdit || canCode ? '' : 'disabled'}></td>
      <td><input class="a-val" type="number" step="0.01" min="0" value="${Number(a.asset_value) || 0}" ${canEdit || canCode ? '' : 'disabled'}></td>
      <td>${canEdit || canCode ? '<button class="btn quiet a-del" type="button" title="ลบแถว">✕</button>' : ''}</td>
    </tr>`).join('');
}

function drawIT() {
  const el = document.getElementById('itpanel');
  if (!pr.needs_it) { el.innerHTML = '<p class="lead">ใบนี้ไม่ต้องผ่านฝ่าย IT</p>'; return; }
  if (pr.it_opinion) {
    const ok = pr.it_opinion === 'approve';
    el.innerHTML = `<div class="${ok ? 'okbox' : 'errbox'}">
      ฝ่าย IT <b>${ok ? 'เห็นชอบ' : 'ไม่เห็นชอบ'}</b>
      ${pr.it_note ? ` — ${esc(pr.it_note)}` : ''}</div>`;
    if (canIT) el.innerHTML += '<button class="btn quiet" id="itredo" type="button">แก้ความเห็น</button>';
    return;
  }
  if (!canIT) { el.innerHTML = '<div class="notebox">รอฝ่าย IT ให้ความเห็น — ใบนี้ยังพิมพ์ไม่ได้จนกว่าฝ่าย IT จะตอบ</div>'; return; }
  el.innerHTML = `
    <div class="grid">
      <label><span>รายละเอียดเพิ่มเติมจากฝ่าย IT</span>
        <textarea id="it_note">${esc(pr.it_note || '')}</textarea></label>
      <div class="actions" style="margin-top:0">
        <button class="btn" id="itok" type="button">เห็นชอบ</button>
        <button class="btn danger" id="itno" type="button">ไม่เห็นชอบ</button>
      </div>
    </div>`;
}

/* ---------------- คำนวณยอด ---------------- */

function recalc() {
  const m = money(pr, items);
  const threshold = cfg.PR_THRESHOLD ?? 500;
  const split = cfg.ASSET_SPLIT ?? 5000;
  document.getElementById('totals').innerHTML = `
    <dl>
      <dt>รวมเป็นเงิน</dt><dd>${baht(m.subtotal)}</dd>
      <dt>หักส่วนลด</dt><dd>${m.discount ? '−' + baht(m.discount) : '—'}</dd>
      <dt>ยอดหลังส่วนลด</dt><dd>${baht(m.net)}</dd>
      <dt>VAT ${Number(pr.vat_rate)}%</dt><dd>${baht(m.vat)}</dd>
      <dt>หักภาษี ณ ที่จ่าย ${Number(pr.wht_rate)}%</dt><dd>${m.wht ? '−' + baht(m.wht) : '—'}</dd>
      <div class="grand" style="display:contents"><dt>ยอดรวม</dt><dd>${baht(m.total)}</dd></div>
      <span class="hint">ยอดที่ใช้ตัดงบคือ <b>${baht(m.net)}</b> บาท (ก่อน VAT ไม่หักภาษี ณ ที่จ่าย)</span>
      ${m.net > 0 && m.net <= threshold
        ? `<span class="hint" style="color:var(--amber)">ยอดไม่เกิน ${baht(threshold)} บาท — ตามระเบียบยังไม่ต้องเปิดใบ PR</span>`
        : ''}
      ${isAsset(pr.doc_type)
        ? `<span class="hint">มูลค่า ${m.net >= split ? '≥' : '<'} ${baht(split)} → ควรเป็น<b>${
            m.net >= split ? 'สินทรัพย์ชุดใหญ่' : 'สินทรัพย์ชุดเล็ก'}</b></span>` : ''}
    </dl>`;
}

/* ---------------- ผูก event ---------------- */

function wire() {
  const bind = (elId, key, cast = v => v) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('input', () => { pr[key] = cast(el.type === 'checkbox' ? el.checked : el.value); afterChange(key); });
    el.addEventListener('change', () => { pr[key] = cast(el.type === 'checkbox' ? el.checked : el.value); afterChange(key); });
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
  document.getElementById('itemrows').addEventListener('input', e => {
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
  document.getElementById('itemrows').addEventListener('change', e => {
    if (!e.target.classList.contains('f-cat')) return;
    const tr = e.target.closest('tr');
    items[+tr.dataset.i].category_id = e.target.value || null;
    autoFlagIT();
  });
  document.getElementById('itemrows').addEventListener('click', e => {
    if (!e.target.classList.contains('f-del')) return;
    items.splice(+e.target.closest('tr').dataset.i, 1);
    if (!items.length) items.push(blankItem());
    render();
  });
  document.getElementById('additem')?.addEventListener('click', () => { items.push(blankItem()); render(); });

  /* -- สินทรัพย์ -- */
  document.getElementById('assetrows')?.addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr || tr.dataset.i === undefined) return;
    const a = assets[+tr.dataset.i];
    if (e.target.classList.contains('a-code')) a.asset_code = e.target.value.trim();
    if (e.target.classList.contains('a-name')) a.asset_name = e.target.value;
    if (e.target.classList.contains('a-val'))  a.asset_value = Number(e.target.value);
  });
  document.getElementById('assetrows')?.addEventListener('click', e => {
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
  document.getElementById('itredo')?.addEventListener('click', () => { pr.it_opinion = null; drawIT(); wire(); });

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
}

/* ---------------- บันทึกและเปลี่ยนสถานะ ---------------- */

const msg = () => document.getElementById('msg');
function note(text, cls = 'okbox') { msg().innerHTML = `<div class="${cls}">${esc(text)}</div>`; }
function fail(e) { msg().innerHTML = `<div class="errbox">${esc(e.message || e)}</div>`; }

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
    pr = await getPR(pr.id);
    items = pr.items.length ? pr.items : [blankItem()];
    assets = pr.assets;
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
    const newId = await revisePR(pr.id);
    location.href = `form.html?id=${newId}`;
  } catch (e) { fail(e); }
}

async function itOpinion(kind) {
  if (!pr.id) return fail(new Error('ต้องบันทึกใบก่อนจึงให้ความเห็นได้'));
  try {
    await setITOpinion(pr.id, kind, document.getElementById('it_note')?.value);
    pr.it_opinion = kind;
    pr.it_note = document.getElementById('it_note')?.value || '';
    pr.it_at = new Date().toISOString();
    drawIT(); wire();
    note(kind === 'approve' ? 'บันทึกความเห็น: เห็นชอบ' : 'บันทึกความเห็น: ไม่เห็นชอบ');
  } catch (e) { fail(e); }
}
