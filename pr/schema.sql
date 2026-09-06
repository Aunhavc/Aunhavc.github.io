-- ================================================================
--  ระบบใบขอจัดซื้อ (PURCHASE REQUEST) — สคีมาฐานข้อมูล
--  อ้างอิงฟอร์มจริง: RE15072569 F-HR (ชีต "Form")
--
--  วิธีใช้: Supabase Dashboard -> SQL Editor -> New query
--           วางไฟล์นี้ทั้งไฟล์แล้วกด Run   (รันซ้ำได้ ไม่พัง)
--
--  หลักการที่ยึด
--   1) ใบที่ "ส่งอนุมัติแล้ว" ห้ามแก้ — บังคับที่ RLS ไม่ใช่ที่หน้าเว็บ
--   2) ยอดเงินทุกช่องคำนวณในฐานข้อมูล ไม่ใช่ใน JavaScript
--      (เลขบนกระดาษที่ผู้บริหารเซ็น ต้องตรงกับ DB เสมอ)
--   3) pr_log เขียนได้อย่างเดียว แก้/ลบไม่ได้ — ไว้ให้ผู้ตรวจสอบดู
-- ================================================================

-- ---------------------------------------------------------------
-- 1. ผู้ใช้งาน + สิทธิ์
--    staff    = สร้าง/แก้ใบของตัวเอง
--    it       = ให้ความเห็นฝ่าย IT ได้ทุกใบ (ตามเงื่อนไขข้อ 2 บนฟอร์ม)
--    approver = อนุมัติ/ตีกลับได้ทุกใบ
--    admin    = ทุกอย่าง + จัดการผู้ใช้
-- ---------------------------------------------------------------
create table if not exists pr_member (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  position    text not null default '',            -- ตำแหน่ง (พิมพ์ใต้ชื่อในช่องเซ็น)
  department  text not null default 'ยังไม่กำหนด', -- แผนก/สาขา ที่โชว์บนใบ
  dept_code   text not null default 'GEN',         -- ตัวย่อใช้ในเลขที่เอกสาร เช่น IT
  cost_center text not null default '',            -- Division Cost Center ตั้งต้น
  role        text not null default 'staff'
              check (role in ('staff','it','approver','admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ผู้ใช้ใหม่ได้แถวใน pr_member อัตโนมัติ (สิทธิ์ staff) แล้วแอดมินค่อยตั้งฝ่าย/สิทธิ์
create or replace function pr_on_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into pr_member (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists pr_new_user on auth.users;
create trigger pr_new_user after insert on auth.users
  for each row execute function pr_on_new_user();

insert into pr_member (user_id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
from auth.users u
on conflict (user_id) do nothing;

-- ตัวช่วยอ่านสิทธิ์ — ต้องเป็น SECURITY DEFINER เพื่อข้าม RLS ของ pr_member เอง
-- ไม่งั้น policy ที่อ่าน pr_member จะเรียกตัวเองวนไม่รู้จบ
create or replace function pr_my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from pr_member where user_id = auth.uid()), 'none');
$$;

create or replace function pr_my_dept()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select department from pr_member where user_id = auth.uid()), '');
$$;

-- ---------------------------------------------------------------
-- 2. หัวใบขอจัดซื้อ — ชื่อคอลัมน์ล้อตามช่องบนฟอร์มกระดาษ
--    status: draft     = ร่าง แก้ได้
--            submitted = ส่งอนุมัติแล้ว ล็อก แก้ไม่ได้
--            approved  = อนุมัติแล้ว -> สั่งพิมพ์ไปเก็บลายเซ็นจริง
--            rejected  = ตีกลับ กลับมาแก้ได้
-- ---------------------------------------------------------------
create table if not exists pr_request (
  id             uuid primary key default gen_random_uuid(),
  doc_no         text unique,                 -- ว่างจนกว่าจะกดส่งอนุมัติ
  requester_id   uuid not null references auth.users(id) on delete restrict,
  requester_name text not null default '',    -- เก็บชื่อ ณ ตอนสร้าง เผื่อคนย้ายฝ่าย/ลาออก
  requester_pos  text not null default '',
  department     text not null default '',    -- แผนก/สาขา
  dept_code      text not null default 'GEN',
  cost_center    text not null default '',    -- Division Cost Center
  vendor_suggest text not null default '',    -- ชื่อผู้ขายที่แนะนำ (ถ้ามี)
  reason         text not null default '',    -- เหตุผลในการขอซื้อ
  doc_date       date not null default (now() at time zone 'Asia/Bangkok')::date,

  -- ประเภทรายการ (กาช่องเดียว) — ค่าตามชีต Dropdown List ของไฟล์เดิม
  asset_type     text not null default 'expense'
                 check (asset_type in ('big','small','expense')),

  -- บล็อก "รายละเอียดเพิ่มเติม" — เช็กบ็อกซ์บนฟอร์ม
  pay_no_supplier  boolean not null default false,  -- ไม่ต้องทำจ่ายซัพ
  pay_normal_cycle boolean not null default false,  -- ทำจ่ายให้ซัพฯ ตามรอบปกติ
  refund_transfer  boolean not null default false,  -- โอนเงินคืน
  refund_bank      text    not null default '',     -- ธนาคาร
  clear_advance    boolean not null default false,  -- เคลียร์เงินทดรองจ่าย
  at_branch        boolean not null default false,  -- ของอยู่ที่สาขาแล้ว
  install_wait     boolean not null default false,  -- รอช่าง/เจ้าของงานมาติดตั้ง
  install_date     date,
  receiver_name    text    not null default '',     -- ชื่อผู้รับมอบงาน
  pay_by_period    boolean not null default false,  -- ทำจ่ายตามรอบ
  period_no        text    not null default '',     -- งวดที่
  clear_doc_no     text    not null default '',     -- เลขที่ใบเคลียร์

  -- ยอดเงิน: subtotal มาจาก trigger, ที่เหลือคำนวณต่อจาก subtotal
  subtotal     numeric(14,2) not null default 0,                       -- รวมเป็นเงิน
  vat_rate     numeric(5,2)  not null default 7  check (vat_rate  >= 0 and vat_rate  <= 100),
  wht_rate     numeric(5,2)  not null default 0  check (wht_rate in (0,1,3,5)),  -- ตาม Dropdown List
  vat_amount   numeric(14,2) generated always as (round(subtotal * vat_rate / 100, 2)) stored,
  wht_amount   numeric(14,2) generated always as (round(subtotal * wht_rate / 100, 2)) stored,
  grand_total  numeric(14,2) generated always as (
                 subtotal + round(subtotal * vat_rate / 100, 2)
                          - round(subtotal * wht_rate / 100, 2)) stored,  -- ยอดรวม

  -- ความคิดเห็นจากฝ่าย IT (เงื่อนไขข้อ 2 บนฟอร์ม: ของ IT/กึ่ง IT ต้องผ่าน IT ทุกครั้ง)
  it_opinion   text check (it_opinion in ('agree','disagree')),
  it_note      text not null default '',
  it_by        uuid references auth.users(id),
  it_name      text not null default '',
  it_at        timestamptz,

  status         text not null default 'draft'
                 check (status in ('draft','submitted','approved','rejected')),
  version        int  not null default 0,   -- +1 ทุกครั้งที่กดส่ง — พิมพ์บนใบกันเซ็นผิดเวอร์ชัน
  submitted_at   timestamptz,
  decided_at     timestamptz,
  decided_by     uuid references auth.users(id),
  decided_name   text not null default '',
  decision_note  text not null default '',
  sap_ref        text not null default '',   -- เลข PR/PO ใน SAP หลังคีย์เข้าระบบจริง
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists pr_request_status_idx on pr_request (status, created_at desc);
create index if not exists pr_request_dept_idx   on pr_request (department, created_at desc);

-- ---------------------------------------------------------------
-- 3. รายการในใบ — amount คำนวณให้เอง แก้มือไม่ได้
-- ---------------------------------------------------------------
create table if not exists pr_item (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references pr_request(id) on delete cascade,
  line_no     int  not null default 1,
  description text not null default '',   -- ชื่อและรายละเอียดสิ่งที่ต้องการ
  item_type   text not null default '',   -- ประเภท
  qty         numeric(14,3) not null default 0,
  unit_price  numeric(14,2) not null default 0,   -- ราคาต่อหน่วย (ถ้าทราบ)
  amount      numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  note        text not null default ''
);

create index if not exists pr_item_req_idx on pr_item (request_id, line_no);

-- ทุกครั้งที่รายการเปลี่ยน ให้ตียอด "รวมเป็นเงิน" ที่หัวใบใหม่
create or replace function pr_sync_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.request_id, old.request_id);
begin
  update pr_request r
     set subtotal = coalesce((select sum(amount) from pr_item where request_id = rid), 0),
         updated_at = now()
   where r.id = rid;
  return null;
end $$;

drop trigger if exists pr_item_total on pr_item;
create trigger pr_item_total after insert or update or delete on pr_item
  for each row execute function pr_sync_total();

-- ---------------------------------------------------------------
-- 4. ประวัติ — เขียนอย่างเดียว (ไม่มี policy update/delete = แก้ไม่ได้)
-- ---------------------------------------------------------------
create table if not exists pr_log (
  id         bigserial primary key,
  request_id uuid not null references pr_request(id) on delete cascade,
  at         timestamptz not null default now(),
  actor_id   uuid references auth.users(id),
  actor_name text not null default '',
  action     text not null,   -- submitted / approved / rejected / it_agree / it_disagree / sap_ref
  note       text not null default ''
);

create index if not exists pr_log_req_idx on pr_log (request_id, at);

-- ---------------------------------------------------------------
-- 5. ตัวนับเลขที่เอกสาร แยกตามปี + ฝ่าย  ->  PR-2026-IT-0001
-- ---------------------------------------------------------------
create table if not exists pr_counter (
  year      int  not null,
  dept_code text not null,
  last_seq  int  not null default 0,
  primary key (year, dept_code)
);

-- ---------------------------------------------------------------
-- 6. RLS — ใครเห็น/แก้อะไรได้
-- ---------------------------------------------------------------
alter table pr_member  enable row level security;
alter table pr_request enable row level security;
alter table pr_item    enable row level security;
alter table pr_log     enable row level security;
alter table pr_counter enable row level security;   -- ไม่มี policy = แตะจากหน้าเว็บไม่ได้เลย

-- ---- pr_member ----
drop policy if exists pr_member_read   on pr_member;
drop policy if exists pr_member_manage on pr_member;

create policy pr_member_read on pr_member for select to authenticated
  using (user_id = auth.uid() or pr_my_role() in ('it','approver','admin'));

create policy pr_member_manage on pr_member for all to authenticated
  using (pr_my_role() = 'admin') with check (pr_my_role() = 'admin');

-- ---- pr_request ----
drop policy if exists pr_request_read   on pr_request;
drop policy if exists pr_request_insert on pr_request;
drop policy if exists pr_request_update on pr_request;
drop policy if exists pr_request_delete on pr_request;

-- staff เห็นใบของตัวเอง + ใบของแผนกตัวเอง / it,approver,admin เห็นทุกใบ
create policy pr_request_read on pr_request for select to authenticated
  using (
    requester_id = auth.uid()
    or department = pr_my_dept()
    or pr_my_role() in ('it','approver','admin')
  );

create policy pr_request_insert on pr_request for insert to authenticated
  with check (requester_id = auth.uid() and status = 'draft');

-- แก้ได้เฉพาะใบของตัวเอง ที่ยัง draft หรือถูกตีกลับ
-- การเปลี่ยนสถานะทำผ่าน pr_submit / pr_decide เท่านั้น
create policy pr_request_update on pr_request for update to authenticated
  using      (requester_id = auth.uid() and status in ('draft','rejected'))
  with check (requester_id = auth.uid() and status in ('draft','rejected'));

-- ลบได้เฉพาะร่างที่ยังไม่เคยออกเลขเอกสาร (ออกเลขแล้วห้ามหาย)
create policy pr_request_delete on pr_request for delete to authenticated
  using (requester_id = auth.uid() and status = 'draft' and doc_no is null);

-- ---- pr_item ---- (สิทธิ์ไหลตามใบแม่ ซึ่งถูก RLS ของ pr_request กรองอีกชั้นแล้ว)
drop policy if exists pr_item_read  on pr_item;
drop policy if exists pr_item_write on pr_item;

create policy pr_item_read on pr_item for select to authenticated
  using (exists (select 1 from pr_request r where r.id = request_id));

create policy pr_item_write on pr_item for all to authenticated
  using (exists (
    select 1 from pr_request r
     where r.id = request_id and r.requester_id = auth.uid()
       and r.status in ('draft','rejected')))
  with check (exists (
    select 1 from pr_request r
     where r.id = request_id and r.requester_id = auth.uid()
       and r.status in ('draft','rejected')));

-- ---- pr_log ---- อ่านตามใบแม่ / เขียนผ่านฟังก์ชันเท่านั้น
drop policy if exists pr_log_read on pr_log;
create policy pr_log_read on pr_log for select to authenticated
  using (exists (select 1 from pr_request r where r.id = request_id));

-- ---------------------------------------------------------------
-- 7. ฟังก์ชันเปลี่ยนสถานะ — ทางเดียวที่สถานะจะเปลี่ยนได้
-- ---------------------------------------------------------------

-- ส่งอนุมัติ: ออกเลขเอกสาร (ครั้งแรกครั้งเดียว) + ล็อกใบ + ลงประวัติ
create or replace function pr_submit(p_id uuid)
returns pr_request language plpgsql security definer set search_path = public as $$
declare
  r pr_request; m pr_member; n int; lines int;
  y int := extract(year from now() at time zone 'Asia/Bangkok');
begin
  select * into r from pr_request where id = p_id;
  if not found then raise exception 'ไม่พบใบขอจัดซื้อนี้'; end if;
  if r.requester_id <> auth.uid() then raise exception 'ส่งได้เฉพาะใบของตัวเอง'; end if;
  if r.status not in ('draft','rejected') then raise exception 'ใบนี้ส่งอนุมัติไปแล้ว'; end if;

  select count(*) into lines from pr_item where request_id = p_id and trim(description) <> '';
  if lines = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 บรรทัด'; end if;

  select * into m from pr_member where user_id = auth.uid();

  -- ถูกตีกลับแล้วส่งใหม่ ให้ใช้เลขเดิม เปลี่ยนแค่ version
  if r.doc_no is null then
    insert into pr_counter (year, dept_code, last_seq)
    values (y, coalesce(m.dept_code,'GEN'), 1)
    on conflict (year, dept_code) do update set last_seq = pr_counter.last_seq + 1
    returning last_seq into n;
    r.doc_no := format('PR-%s-%s-%s', y, coalesce(m.dept_code,'GEN'), lpad(n::text, 4, '0'));
  end if;

  update pr_request
     set doc_no = r.doc_no,
         status = 'submitted',
         version = version + 1,
         submitted_at = now(),
         decided_at = null, decided_by = null, decided_name = '', decision_note = '',
         updated_at = now()
   where id = p_id
   returning * into r;

  insert into pr_log (request_id, actor_id, actor_name, action, note)
  values (p_id, auth.uid(), coalesce(m.full_name,''), 'submitted', 'ครั้งที่ ' || r.version);

  return r;
end $$;

-- ความเห็นฝ่าย IT — ให้ได้ตั้งแต่ตอนรออนุมัติ ไม่บล็อกสายอนุมัติ
create or replace function pr_it_opinion(p_id uuid, p_opinion text, p_note text default '')
returns pr_request language plpgsql security definer set search_path = public as $$
declare r pr_request; m pr_member;
begin
  if pr_my_role() not in ('it','admin') then raise exception 'ไม่มีสิทธิ์ให้ความเห็นฝ่าย IT'; end if;
  if p_opinion not in ('agree','disagree') then raise exception 'ค่าความเห็นไม่ถูกต้อง'; end if;

  select * into m from pr_member where user_id = auth.uid();

  update pr_request
     set it_opinion = p_opinion, it_note = coalesce(p_note,''),
         it_by = auth.uid(), it_name = coalesce(m.full_name,''), it_at = now(),
         updated_at = now()
   where id = p_id and status in ('submitted','approved')
   returning * into r;
  if not found then raise exception 'ให้ความเห็นได้เฉพาะใบที่ส่งอนุมัติแล้ว'; end if;

  insert into pr_log (request_id, actor_id, actor_name, action, note)
  values (p_id, auth.uid(), coalesce(m.full_name,''), 'it_' || p_opinion, coalesce(p_note,''));

  return r;
end $$;

-- อนุมัติ / ตีกลับ
create or replace function pr_decide(p_id uuid, p_decision text, p_note text default '')
returns pr_request language plpgsql security definer set search_path = public as $$
declare r pr_request; m pr_member;
begin
  if pr_my_role() not in ('approver','admin') then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'ผลการพิจารณาไม่ถูกต้อง'; end if;

  select * into r from pr_request where id = p_id;
  if not found then raise exception 'ไม่พบใบขอจัดซื้อนี้'; end if;
  if r.status <> 'submitted' then raise exception 'ใบนี้ไม่ได้อยู่ระหว่างรออนุมัติ'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_note),'') = '' then
    raise exception 'ตีกลับต้องระบุเหตุผล';
  end if;

  select * into m from pr_member where user_id = auth.uid();

  update pr_request
     set status = p_decision,
         decided_at = now(), decided_by = auth.uid(),
         decided_name = coalesce(m.full_name,''), decision_note = coalesce(p_note,''),
         updated_at = now()
   where id = p_id
   returning * into r;

  insert into pr_log (request_id, actor_id, actor_name, action, note)
  values (p_id, auth.uid(), coalesce(m.full_name,''), p_decision, coalesce(p_note,''));

  return r;
end $$;

-- แปะเลข PR/PO ของ SAP กลับเข้ามาหลังจัดซื้อคีย์เข้าระบบจริง
create or replace function pr_set_sap_ref(p_id uuid, p_ref text)
returns pr_request language plpgsql security definer set search_path = public as $$
declare r pr_request; m pr_member;
begin
  if pr_my_role() not in ('approver','admin') then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into m from pr_member where user_id = auth.uid();

  update pr_request set sap_ref = coalesce(p_ref,''), updated_at = now()
   where id = p_id returning * into r;
  if not found then raise exception 'ไม่พบใบขอจัดซื้อนี้'; end if;

  insert into pr_log (request_id, actor_id, actor_name, action, note)
  values (p_id, auth.uid(), coalesce(m.full_name,''), 'sap_ref', coalesce(p_ref,''));

  return r;
end $$;

grant execute on function pr_submit(uuid)                  to authenticated;
grant execute on function pr_it_opinion(uuid, text, text)  to authenticated;
grant execute on function pr_decide(uuid, text, text)      to authenticated;
grant execute on function pr_set_sap_ref(uuid, text)       to authenticated;
grant execute on function pr_my_role()                     to authenticated;
grant execute on function pr_my_dept()                     to authenticated;

-- ================================================================
--  ขั้นตอนสุดท้าย: ตั้งตัวเองเป็นแอดมิน (แก้อีเมลให้ตรงก่อนรัน)
--
--  update pr_member
--     set role='admin', full_name='ชื่อ นามสกุล', position='ผู้จัดการฝ่ายไอที',
--         department='ฝ่ายเทคโนโลยีสารสนเทศ', dept_code='IT'
--   where user_id = (select id from auth.users where email='you@company.com');
-- ================================================================
