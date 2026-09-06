/* =============================================================
   ชั้นเชื่อมต่อ Supabase — ใช้ร่วมกันทุกหน้า
   ============================================================= */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.PLANNER_CONFIG || {};

export const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const supabase = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

/** แสดงคำเตือนเมื่อยังไม่ได้กรอก config.js */
export function configError(container) {
  container.innerHTML = `
    <div class="errbox">
      <b>ยังไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล</b>
      เปิดไฟล์ <code>public/config.js</code> แล้วกรอก <code>SUPABASE_URL</code> กับ
      <code>SUPABASE_ANON_KEY</code> — หาได้ที่ Supabase Dashboard → Project Settings → API
      (ดูขั้นตอนละเอียดใน <code>SETUP.md</code>)
    </div>`;
}

/* ---------------- เซสชัน ---------------- */

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signInWithGoogle(nextPage = 'app.html') {
  const redirectTo = new URL(nextPage, location.href).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
  if (error) throw error;
}

/** ส่งลิงก์เข้าสู่ระบบไปทางอีเมล — ไม่ต้องตั้งค่าอะไรเพิ่ม ไม่ต้องมีรหัสผ่าน */
export async function signInWithEmail(email, nextPage = 'app.html') {
  const emailRedirectTo = new URL(nextPage, location.href).href;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true }
  });
  if (error) throw error;
}

/** เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน (ไม่ต้องส่งอีเมลเลย) */
export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * สมัครสมาชิกด้วยอีเมล + รหัสผ่าน
 * คืนค่า true เมื่อเข้าใช้งานได้ทันที, false เมื่อระบบยังบังคับให้ยืนยันอีเมลก่อน
 */
export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return Boolean(data.session);
}

/** ถามเซิร์ฟเวอร์ว่าเปิดวิธีล็อกอินอะไรไว้บ้าง จะได้ไม่โชว์ปุ่มที่กดไม่ได้ */
export async function enabledProviders() {
  try {
    const r = await fetch(`${cfg.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY }
    });
    const j = await r.json();
    return j.external || {};
  } catch {
    return {};
  }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  location.replace('login.html');
}

/**
 * บังคับให้ต้องล็อกอินก่อน — คืนค่า session หรือเด้งไปหน้าล็อกอิน
 * ต้องเรียกก่อนแตะข้อมูลใด ๆ เสมอ
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'app.html');
    location.replace(`login.html?next=${back}`);
    return null;
  }
  return session;
}

/* ---------------- บัญชีและสิทธิ์ ---------------- */

/**
 * ข้อมูลบัญชีในคำขอเดียว: โปรไฟล์ + แผน + สถานะ + has_access
 * has_access มาจากฐานข้อมูล ไม่ใช่การคำนวณในเบราว์เซอร์ — แก้ไม่ได้
 */
export async function getAccount() {
  const { data, error } = await supabase.rpc('my_account');
  if (error) throw error;
  return data;
}

export async function touchLastSeen() {
  try { await supabase.rpc('touch_last_seen'); } catch { /* ไม่สำคัญพอจะให้แอปพัง */ }
}

/* ---------------- ข้อมูลแพลนเนอร์ ---------------- */

export async function loadPlannerState(userId) {
  const { data, error } = await supabase
    .from('planner_state').select('data, saved_at')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function savePlannerState(userId, obj) {
  const { error } = await supabase
    .from('planner_state')
    .upsert({ user_id: userId, data: obj }, { onConflict: 'user_id' });
  if (error) throw error;
}

/* ---------------- ตัวช่วยแสดงผล ---------------- */

export const PLAN_LABEL = {
  trial: 'ทดลองใช้', monthly: 'รายเดือน', yearly: 'รายปี', lifetime: 'ตลอดชีพ'
};

export const STATUS_LABEL = {
  trialing:  { t: 'ทดลองใช้',   c: 'p-trial'     },
  active:    { t: 'ใช้งานอยู่', c: 'p-active'    },
  past_due:  { t: 'ค้างชำระ',   c: 'p-expiring'  },
  canceled:  { t: 'ยกเลิกแล้ว', c: 'p-expired'   },
  suspended: { t: 'ระงับ',      c: 'p-suspended' }
};

/** สถานะที่ใช้แสดงในตาราง — รวมเรื่องหมดอายุเข้าไปด้วย */
export function displayStatus(row) {
  if (row.status === 'suspended') return 'suspended';
  if (!row.has_access) return 'expired';
  if (row.plan === 'lifetime' || !row.current_period_end) return 'active';
  const days = (new Date(row.current_period_end) - Date.now()) / 864e5;
  if (row.status === 'trialing') return 'trial';
  return days <= 7 ? 'expiring' : 'active';
}

export const fmtDate = v => {
  if (!v) return '—';
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const fmtBaht = minor => '฿' + Math.round((minor || 0) / 100).toLocaleString('th-TH');

export const esc = v => String(v ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** แถบบนของทุกหน้า */
export function renderAppBar(account, current) {
  const nav = [
    ['app.html', 'แพลนเนอร์'],
    ['billing.html', 'แผนและการชำระเงิน'],
    ...(account?.is_admin ? [['admin.html', 'จัดการผู้ใช้']] : [])
  ];
  const name = account?.full_name || account?.email || '';
  const initial = (name.trim()[0] || '?').toUpperCase();
  return `
    <div class="appbar">
      <div class="logo"><i>◑</i> ${esc(cfg.APP_NAME || 'Planner')}</div>
      <nav>${nav.map(([h, t]) =>
        `<a href="${h}"${h === current ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
      <span class="grow"></span>
      <div class="me">
        ${account?.avatar_url
          ? `<img src="${esc(account.avatar_url)}" alt="" referrerpolicy="no-referrer">`
          : `<span class="av" aria-hidden="true">${esc(initial)}</span>`}
        <span class="nm"><b>${esc(account?.full_name || '—')}</b><span>${esc(account?.email || '')}</span></span>
      </div>
      <button class="btn quiet" data-signout>ออกจากระบบ</button>
    </div>`;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-signout]')) signOut();
});
