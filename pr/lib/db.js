/* =============================================================
   ชั้นเชื่อมต่อฐานข้อมูล — ใช้ร่วมกันทุกหน้าของระบบใบขอจัดซื้อ
   ============================================================= */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { cfg } from './util.js';
export * from './util.js';
export const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const sb = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

/* ---------------- เซสชันและโปรไฟล์ ---------------- */

export async function requireSession() {
  if (!sb) {
    document.body.innerHTML =
      '<div class="errbox">ยังไม่ได้ตั้งค่า <code>pr/config.js</code> — กรอก SUPABASE_URL และ SUPABASE_ANON_KEY ก่อน</div>';
    throw new Error('ยังไม่ได้ตั้งค่า config.js');
  }
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`login.html?next=${back}`);
    throw new Error('ยังไม่ได้ล็อกอิน');
  }
  return data.session;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
  location.replace('login.html');
}

let _me = null;
export async function me() {
  if (_me) return _me;
  const { data, error } = await sb
    .from('profiles')
    .select('*, department:departments(*)')
    .eq('user_id', (await sb.auth.getUser()).data.user.id)
    .maybeSingle();
  if (error) throw error;
  _me = data;
  return data;
}

export const can = (profile, role) => Boolean(profile?.active && profile.roles?.includes(role));

/* ---------------- ข้อมูลหลัก ---------------- */

let _master = null;
export async function master() {
  if (_master) return _master;
  const [d, b, c] = await Promise.all([
    sb.from('departments').select('*').eq('active', true).order('sort_order'),
    sb.from('branches').select('*').eq('active', true).order('sort_order'),
    sb.from('item_categories').select('*').eq('active', true).order('sort_order')
  ]);
  for (const r of [d, b, c]) if (r.error) throw r.error;
  _master = { departments: d.data, branches: b.data, categories: c.data };
  return _master;
}

/* ---------------- ใบขอจัดซื้อ ---------------- */

export const PR_SELECT = `
  *,
  department:departments(*),
  branch:branches(*),
  items:pr_items(*),
  assets:pr_assets(*)
`;

export async function listPR({ mine = false, status = null, q = null } = {}) {
  let sel = sb.from('pr')
    .select('id, doc_no, rev, doc_type, status, doc_date, subtotal, discount, needs_it, it_opinion, department:departments(code,name), branch:branches(code,name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (mine) sel = sel.eq('created_by', (await sb.auth.getUser()).data.user.id);
  if (status) sel = sel.eq('status', status);
  if (q) sel = sel.or(`doc_no.ilike.%${q}%`);
  const { data, error } = await sel;
  if (error) throw error;
  return data;
}

export async function getPR(id) {
  const { data, error } = await sb.from('pr').select(PR_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (data) {
    data.items = (data.items || []).sort((a, b) => a.line_no - b.line_no);
    data.assets = (data.assets || []).sort((a, b) => a.line_no - b.line_no);
  }
  return data;
}

export async function createDraft(fields) {
  const { data, error } = await sb.from('pr').insert(fields).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function savePR(id, fields) {
  const { error } = await sb.from('pr').update(fields).eq('id', id);
  if (error) throw error;
}

/** เขียนทับรายการทั้งชุด — ง่ายและถูกต้องกว่าการไล่ diff ทีละบรรทัด */
export async function saveItems(prId, rows) {
  const del = await sb.from('pr_items').delete().eq('pr_id', prId);
  if (del.error) throw del.error;
  if (!rows.length) return;
  const payload = rows.map((r, i) => ({
    pr_id: prId, line_no: i + 1,
    name: r.name, detail: r.detail || null, category_id: r.category_id || null,
    qty: r.qty || 0, unit_price: r.unit_price || 0, note: r.note || null
  }));
  const { error } = await sb.from('pr_items').insert(payload);
  if (error) throw error;
}

export async function saveAssets(prId, rows) {
  const del = await sb.from('pr_assets').delete().eq('pr_id', prId);
  if (del.error) throw del.error;
  if (!rows.length) return;
  const payload = rows.map((r, i) => ({
    pr_id: prId, line_no: i + 1,
    asset_code: r.asset_code, asset_name: r.asset_name, asset_value: r.asset_value || 0
  }));
  const { error } = await sb.from('pr_assets').insert(payload);
  if (error) throw error;
}

export async function submitPR(id) {
  const { data, error } = await sb.rpc('issue_pr_no', { p_id: id });
  if (error) throw error;
  return data;
}

export async function markPrinted(id) {
  const { error } = await sb.rpc('mark_printed', { p_id: id });
  if (error) throw error;
}

export async function revisePR(id) {
  const { data, error } = await sb.rpc('revise_pr', { p_id: id });
  if (error) throw error;
  return data;
}

export async function setITOpinion(id, opinion, note) {
  const uid = (await sb.auth.getUser()).data.user.id;
  await savePR(id, { it_opinion: opinion, it_note: note || null, it_by: uid, it_at: new Date().toISOString() });
  await sb.from('pr_log').insert({ pr_id: id, action: 'it_opinion', detail: opinion });
}

/* ---------------- แถบนำทาง ---------------- */

import { esc } from './util.js';

/** แถบบนสุดของทุกหน้า */
export function appbar(profile, current) {
  const nav = [['index.html', 'ใบขอจัดซื้อ']];
  if (can(profile, 'admin')) nav.push(['admin.html', 'ตั้งค่าระบบ']);
  return `
    <header class="appbar">
      <a class="brand" href="index.html"><b>PR</b> ใบขอจัดซื้อ</a>
      <nav>${nav.map(([h, t]) =>
        `<a href="${h}"${h === current ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>
      <span class="grow"></span>
      <span class="who"><b>${esc(profile?.full_name || '—')}</b><span>${
        esc(profile?.department?.name || 'ยังไม่ได้กำหนดฝ่าย')}</span></span>
      <button class="btn quiet" id="signout">ออกจากระบบ</button>
    </header>`;
}

document.addEventListener('click', e => {
  if (e.target.closest('#signout')) signOut();
});
