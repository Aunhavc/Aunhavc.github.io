/* =============================================================
   ชั้นเชื่อมต่อฐานข้อมูล — ใช้ร่วมกันทุกหน้าของระบบใบขอจัดซื้อ
   ============================================================= */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.PR_CONFIG || {};
export const ORG_NAME = cfg.ORG_NAME || '';
export const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const supabase = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

/* ---------------- เซสชัน ---------------- */

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  location.replace('index.html');
}

/** บังคับล็อกอินก่อนแตะข้อมูล — คืน session หรือเด้งกลับหน้าแรก */
export async function requireSession() {
  const s = await getSession();
  if (!s) { location.replace(`index.html?next=${encodeURIComponent(location.pathname + location.search)}`); return null; }
  return s;
}

/* ---------------- โปรไฟล์ผู้ใช้ + สิทธิ์ ---------------- */

export async function myMember() {
  const { data, error } = await supabase
    .from('pr_member').select('*').eq('user_id', (await getSession()).user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMembers() {
  const { data, error } = await supabase
    .from('pr_member').select('*').order('department').order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function updateMember(userId, patch) {
  const { error } = await supabase.from('pr_member').update(patch).eq('user_id', userId);
  if (error) throw error;
}

/* ---------------- ใบขอจัดซื้อ ---------------- */

const HEADER_COLS = '*';

export async function listRequests({ status = 'all', q = '' } = {}) {
  let sel = supabase.from('pr_request').select(HEADER_COLS).order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') sel = sel.eq('status', status);
  if (q.trim()) sel = sel.or(`doc_no.ilike.%${q}%,requester_name.ilike.%${q}%,reason.ilike.%${q}%`);
  const { data, error } = await sel;
  if (error) throw error;
  return data ?? [];
}

export async function getRequest(id) {
  const [{ data: head, error: e1 }, { data: items, error: e2 }, { data: logs, error: e3 }] =
    await Promise.all([
      supabase.from('pr_request').select(HEADER_COLS).eq('id', id).maybeSingle(),
      supabase.from('pr_item').select('*').eq('request_id', id).order('line_no'),
      supabase.from('pr_log').select('*').eq('request_id', id).order('at')
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (!head) throw new Error('ไม่พบใบขอจัดซื้อนี้ หรือคุณไม่มีสิทธิ์เปิดดู');
  return { head, items: items ?? [], logs: logs ?? [] };
}

export async function createRequest(patch) {
  const { data, error } = await supabase.from('pr_request').insert(patch).select().single();
  if (error) throw error;
  return data;
}

export async function updateRequest(id, patch) {
  const { data, error } = await supabase.from('pr_request').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRequest(id) {
  const { error } = await supabase.from('pr_request').delete().eq('id', id);
  if (error) throw error;
}

/**
 * บันทึกรายการทั้งชุดแบบ "ลบของเดิมแล้วใส่ใหม่"
 * ตั้งใจเลือกวิธีนี้เพราะรายการมีไม่กี่บรรทัด และทำให้ลำดับบรรทัดตรงกับหน้าจอเสมอ
 * (ถ้าอนาคตรายการเยอะขึ้นมาก ค่อยเปลี่ยนเป็น upsert รายบรรทัด)
 */
export async function saveItems(requestId, rows) {
  const { error: delErr } = await supabase.from('pr_item').delete().eq('request_id', requestId);
  if (delErr) throw delErr;

  const clean = rows
    .filter(r => String(r.description || '').trim() !== '')
    .map((r, i) => ({
      request_id: requestId,
      line_no: i + 1,
      description: r.description || '',
      item_type: r.item_type || '',
      qty: Number(r.qty) || 0,
      unit_price: Number(r.unit_price) || 0,
      note: r.note || ''
    }));

  if (clean.length) {
    const { error } = await supabase.from('pr_item').insert(clean);
    if (error) throw error;
  }
  return clean.length;
}

/* ---------------- เปลี่ยนสถานะ (ผ่านฟังก์ชันฝั่งฐานข้อมูลเท่านั้น) ---------------- */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

export const submitRequest = id            => rpc('pr_submit',      { p_id: id });
export const decideRequest = (id, d, note) => rpc('pr_decide',      { p_id: id, p_decision: d, p_note: note || '' });
export const itOpinion     = (id, o, note) => rpc('pr_it_opinion',  { p_id: id, p_opinion: o, p_note: note || '' });
export const setSapRef     = (id, ref)     => rpc('pr_set_sap_ref', { p_id: id, p_ref: ref || '' });
