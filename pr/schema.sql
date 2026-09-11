-- =============================================================
-- ระบบใบขอจัดซื้อ (Purchase Request) — สมใจบิซกรุ๊ป
-- รันไฟล์นี้ครั้งเดียวใน Supabase → SQL Editor
--
-- ก้อน A: เปิดใบ → ออกเลข → ฝ่าย IT ให้ความเห็น → บัญชีคีย์รหัสสินทรัพย์
--         → ปริ้น (ล็อกใบ) → ออกฉบับแก้ไข
-- =============================================================

-- ---------- ข้อมูลหลัก ----------

-- สายงาน/ฝ่าย และผู้บริหารที่อนุมัติของสายงานนั้น (ตัดสินใจข้อ 6)
create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- 'HR', 'IT', 'SA', 'WH' — ใช้ในเลขเอกสาร
  name        text not null,
  approver    text not null check (approver in ('ceo','coo')),
  cost_center text,                          -- Division Cost Center ที่ขึ้นเป็นค่าตั้งต้นบนฟอร์ม
  seq_start   int  not null default 0,       -- เลขรันเริ่มต้น เพื่อรันต่อจากเล่มเดิม (ข้อ 23)
  sort_order  int  not null default 0,
  active      boolean not null default true
);

-- สาขา/หน่วยงานที่ใช้ของ — รหัส 2 หลักที่ไปอยู่ในเลขเอกสาร
-- '00' สงวนไว้สำหรับใบที่ซื้อให้หลายสาขาพร้อมกัน
create table if not exists branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[0-9]{2}$'),
  name       text not null,
  sort_order int not null default 0,
  active     boolean not null default true
);

-- หมวดสินค้า — หมวดที่ is_it = true จะติดธง "ต้องผ่านฝ่าย IT" อัตโนมัติ (ข้อ 21)
create table if not exists item_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_it      boolean not null default false,
  sort_order int not null default 0,
  active     boolean not null default true
);

-- ---------- ผู้ใช้และสิทธิ์ ----------

-- roles เก็บเป็น array เพราะคนเดียวมักสวมหลายบทบาท
-- requester | manager | asset_admin | asset_accountant | it | exec_assistant
-- | purchasing | executive | admin
create table if not exists profiles (
  user_id       uuid primary key references auth.users on delete cascade,
  email         text,
  full_name     text,
  position_title text,                        -- ชื่อตำแหน่งที่จะพิมพ์ใต้ลายเซ็นบนใบ
  department_id uuid references departments,
  roles         text[] not null default '{requester}',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create or replace function has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r = any(roles) and active from profiles where user_id = auth.uid()),
    false);
$$;

create or replace function my_department() returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from profiles where user_id = auth.uid();
$$;

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีคนสมัคร (ยังไม่มีสิทธิ์อะไรจนกว่าแอดมินจะกำหนดฝ่าย)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ---------- ใบขอจัดซื้อ ----------

create table if not exists pr (
  id            uuid primary key default gen_random_uuid(),

  doc_no        text unique,                  -- ว่างจนกว่าจะกด "ยื่น" (ข้อ 23)
  rev           int  not null default 0,      -- ฉบับแก้ไข (ข้อ 13)
  supersedes    uuid references pr,           -- ใบที่ฉบับนี้มาแทน
  seq           int,                          -- ลำดับรันของฝ่ายในปีนั้น

  -- ประเภทเอกสาร: ค่าใช้จ่าย / สินทรัพย์ชุดเล็ก / สินทรัพย์ชุดใหญ่ (ข้อ 18)
  doc_type      text not null default 'expense'
                check (doc_type in ('expense','asset_small','asset_large')),
  request_kind  text not null default 'buy'
                check (request_kind in ('buy','repair','make')),

  department_id uuid not null references departments,
  branch_id     uuid references branches,
  cost_center   text,
  doc_date      date not null default current_date,

  reason        text check (reason in ('damaged','lost','out_of_stock','new_branch','other')),
  reason_other  text,
  suggested_vendor text,

  -- ฝ่าย IT (ข้อ 21) — needs_it ตั้งอัตโนมัติจากหมวดสินค้า แต่ผู้ขอติ๊กเพิ่มเองได้
  needs_it      boolean not null default false,
  it_opinion    text check (it_opinion in ('approve','reject')),
  it_note       text,
  it_by         uuid references auth.users,
  it_at         timestamptz,

  -- วิธีจ่ายเงิน — เก็บเป็นข้อมูลเท่านั้น ไม่สร้างกระบวนการ (ข้อ 24)
  payment_method text check (payment_method in ('no_pay','normal_cycle','refund','clear_advance')),
  refund_bank    text,
  refund_payee   text,
  advance_doc_no text,
  already_at_branch boolean not null default false,
  install_date   date,
  receiver_name  text,

  -- ยอดเงิน (ข้อ 19, 20) — net = subtotal - discount คือยอดที่ใช้ตัดงบ
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  vat_rate      numeric(5,2)  not null default 7,
  wht_rate      numeric(5,2)  not null default 0,

  status        text not null default 'draft'
                check (status in ('draft','submitted','printed','approved','cancelled','superseded')),
  submitted_at  timestamptz,
  printed_at    timestamptz,

  -- ชื่อผู้ขอถูกบันทึกทับไว้ตอนสร้างใบ เพื่อให้ใบที่ปริ้นไปแล้วไม่เปลี่ยนตามโปรไฟล์ที่แก้ทีหลัง
  creator_name     text,
  creator_position text,

  created_by    uuid not null references auth.users default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pr_dept_idx   on pr (department_id, created_at desc);
create index if not exists pr_status_idx on pr (status);
create index if not exists pr_creator_idx on pr (created_by, created_at desc);

-- ยอดหลังส่วนลด = ยอดที่ใช้ตัดงบ (ข้อ 20 — ก่อน VAT ไม่หัก WHT ออก)
create or replace function pr_net(p pr) returns numeric
language sql immutable as $$ select round(p.subtotal - p.discount, 2) $$;

create or replace function pr_vat(p pr) returns numeric
language sql immutable as $$ select round((p.subtotal - p.discount) * p.vat_rate / 100, 2) $$;

create or replace function pr_wht(p pr) returns numeric
language sql immutable as $$ select round((p.subtotal - p.discount) * p.wht_rate / 100, 2) $$;

create or replace function pr_total(p pr) returns numeric
language sql immutable as $$
  select round((p.subtotal - p.discount)
             + (p.subtotal - p.discount) * p.vat_rate / 100
             - (p.subtotal - p.discount) * p.wht_rate / 100, 2)
$$;

-- รายการสินค้า
create table if not exists pr_items (
  id          uuid primary key default gen_random_uuid(),
  pr_id       uuid not null references pr on delete cascade,
  line_no     int  not null,
  name        text not null,
  detail      text,
  category_id uuid references item_categories,
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  note        text,
  unique (pr_id, line_no)
);
create index if not exists pr_items_pr_idx on pr_items (pr_id, line_no);

-- บล็อกสินทรัพย์ — รหัสมาจากทะเบียน SAP คีย์ด้วยมือ ห้ามซ้ำ (ข้อ 15)
create table if not exists pr_assets (
  id          uuid primary key default gen_random_uuid(),
  pr_id       uuid not null references pr on delete cascade,
  line_no     int  not null,
  asset_code  text not null,
  asset_name  text not null,
  asset_value numeric(14,2) not null default 0,
  coded_by    uuid references auth.users,
  coded_at    timestamptz not null default now(),
  unique (pr_id, line_no)
);
create unique index if not exists pr_assets_code_uniq on pr_assets (asset_code);

-- บันทึกการแก้ไขสำคัญ — ใช้ตอบว่าใครทำอะไรเมื่อไหร่
create table if not exists pr_log (
  id        bigserial primary key,
  pr_id     uuid not null references pr on delete cascade,
  action    text not null,
  detail    text,
  actor     uuid not null references auth.users default auth.uid(),
  at        timestamptz not null default now()
);
create index if not exists pr_log_pr_idx on pr_log (pr_id, at desc);

-- ---------- กฎเหล็ก: กดปริ้นแล้วห้ามแก้ (ข้อ 13) ----------

create or replace function pr_guard_locked() returns trigger
language plpgsql as $$
declare locked boolean;
begin
  if tg_table_name = 'pr' then
    -- ยอมให้เปลี่ยนเฉพาะสถานะและเวลา ไม่ให้แตะเนื้อหาที่ผู้บริหารเซ็นอนุมัติ
    if old.status in ('printed','approved','cancelled','superseded') then
      if new.subtotal    is distinct from old.subtotal
      or new.discount    is distinct from old.discount
      or new.vat_rate    is distinct from old.vat_rate
      or new.wht_rate    is distinct from old.wht_rate
      or new.doc_type    is distinct from old.doc_type
      or new.department_id is distinct from old.department_id
      or new.branch_id   is distinct from old.branch_id
      or new.doc_no      is distinct from old.doc_no then
        raise exception 'ใบนี้ปริ้นไปแล้ว แก้ไม่ได้ — ต้องออกฉบับแก้ไข (Rev.)';
      end if;
    end if;
    return new;
  end if;

  select p.status in ('printed','approved','cancelled','superseded') into locked
    from pr p where p.id = coalesce(new.pr_id, old.pr_id);
  if locked then
    raise exception 'ใบนี้ปริ้นไปแล้ว แก้รายการไม่ได้ — ต้องออกฉบับแก้ไข (Rev.)';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists pr_locked      on pr;
drop trigger if exists pr_items_locked on pr_items;
create trigger pr_locked       before update on pr       for each row execute function pr_guard_locked();
create trigger pr_items_locked before insert or update or delete on pr_items
  for each row execute function pr_guard_locked();

create or replace function pr_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists pr_touch_t on pr;
create trigger pr_touch_t before update on pr for each row execute function pr_touch();

-- ---------- ออกเลขเอกสาร (ข้อ 22, 23) ----------
-- รูปแบบ  PR-{ฝ่าย}-{ปีพ.ศ.2หลัก}{เดือน}-{สาขา}-{ลำดับ4หลัก}
-- ตัวอย่าง PR-SA-6909-10-0042   ลำดับรันต่อเนื่องทั้งปีต่อฝ่าย
create or replace function issue_pr_no(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  r        pr%rowtype;
  d        departments%rowtype;
  br       text;
  yr_be    int;
  next_seq int;
  no       text;
begin
  select * into r from pr where id = p_id for update;
  if not found then raise exception 'ไม่พบใบขอจัดซื้อ'; end if;
  if r.doc_no is not null then return r.doc_no; end if;

  select * into d from departments where id = r.department_id;
  select coalesce(b.code, '00') into br from branches b where b.id = r.branch_id;
  if br is null then br := '00'; end if;

  yr_be := extract(year from r.doc_date)::int + 543;

  -- ลำดับถัดไปของฝ่ายนี้ในปีนี้ นับต่อจากเลขเริ่มต้นที่แอดมินตั้งไว้
  select greatest(coalesce(max(p.seq), 0), d.seq_start) + 1 into next_seq
    from pr p
   where p.department_id = r.department_id
     and extract(year from p.doc_date) = extract(year from r.doc_date);

  no := format('PR-%s-%s%s-%s-%s',
               d.code,
               lpad((yr_be % 100)::text, 2, '0'),
               lpad(extract(month from r.doc_date)::text, 2, '0'),
               br,
               lpad(next_seq::text, 4, '0'));

  update pr set doc_no = no, seq = next_seq,
                status = case when status = 'draft' then 'submitted' else status end,
                submitted_at = coalesce(submitted_at, now())
   where id = p_id;

  insert into pr_log (pr_id, action, detail) values (p_id, 'submit', no);
  return no;
end $$;

-- ล็อกใบเมื่อกดปริ้น — เรียกครั้งแรกเท่านั้นที่เปลี่ยนสถานะ
create or replace function mark_printed(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pr set status = 'printed', printed_at = coalesce(printed_at, now())
   where id = p_id and status in ('submitted','printed');
  insert into pr_log (pr_id, action) values (p_id, 'print');
end $$;

-- ออกฉบับแก้ไข: คัดลอกใบเดิมทั้งใบ เพิ่ม rev แล้วปิดใบเก่าเป็น "ถูกแทนที่" (ข้อ 13)
create or replace function revise_pr(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; old_no text; old_rev int;
begin
  select doc_no, rev into old_no, old_rev from pr where id = p_id;
  if old_no is null then raise exception 'ใบนี้ยังไม่ได้ยื่น ไม่ต้องออกฉบับแก้ไข'; end if;

  insert into pr (doc_no, rev, supersedes, seq, doc_type, request_kind, department_id, branch_id,
                  cost_center, doc_date, reason, reason_other, suggested_vendor, needs_it,
                  payment_method, refund_bank, refund_payee, advance_doc_no,
                  already_at_branch, install_date, receiver_name,
                  creator_name, creator_position,
                  subtotal, discount, vat_rate, wht_rate, status, submitted_at, created_by)
  select doc_no, rev + 1, id, seq, doc_type, request_kind, department_id, branch_id,
         cost_center, doc_date, reason, reason_other, suggested_vendor, needs_it,
         payment_method, refund_bank, refund_payee, advance_doc_no,
         already_at_branch, install_date, receiver_name,
         creator_name, creator_position,
         subtotal, discount, vat_rate, wht_rate, 'submitted', now(), created_by
    from pr where id = p_id
  returning id into new_id;

  insert into pr_items (pr_id, line_no, name, detail, category_id, qty, unit_price, note)
  select new_id, line_no, name, detail, category_id, qty, unit_price, note
    from pr_items where pr_id = p_id;

  -- รหัสสินทรัพย์ห้ามซ้ำ จึงย้ายมาอยู่กับฉบับใหม่แทนการคัดลอก
  update pr_assets set pr_id = new_id where pr_id = p_id;

  update pr set status = 'superseded' where id = p_id;
  insert into pr_log (pr_id, action, detail) values (p_id, 'supersede', old_no || ' Rev.' || (old_rev + 1));
  insert into pr_log (pr_id, action, detail) values (new_id, 'revise', 'จาก ' || old_no);
  return new_id;
end $$;

-- doc_no ซ้ำได้ข้าม rev — ใช้ unique ที่ (doc_no, rev) แทน unique เดี่ยว
alter table pr drop constraint if exists pr_doc_no_key;
create unique index if not exists pr_doc_no_rev_uniq on pr (doc_no, rev) where doc_no is not null;

-- ---------- สิทธิ์ระดับแถว ----------

alter table departments    enable row level security;
alter table branches       enable row level security;
alter table item_categories enable row level security;
alter table profiles       enable row level security;
alter table pr             enable row level security;
alter table pr_items       enable row level security;
alter table pr_assets      enable row level security;
alter table pr_log         enable row level security;

-- ข้อมูลหลัก: ทุกคนที่ล็อกอินอ่านได้ แอดมินแก้ได้
do $$ declare t text;
begin
  foreach t in array array['departments','branches','item_categories'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (has_role(''admin'')) with check (has_role(''admin''))', t, t);
  end loop;
end $$;

drop policy if exists profiles_self  on profiles;
drop policy if exists profiles_admin on profiles;
create policy profiles_self on profiles for select to authenticated
  using (user_id = auth.uid() or has_role('admin') or has_role('executive'));
create policy profiles_admin on profiles for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- ใบ PR: ผู้ขอเห็นของฝ่ายตัวเอง / บทบาทที่ต้องทำงานกับใบเห็นทั้งหมด
drop policy if exists pr_read   on pr;
drop policy if exists pr_insert on pr;
drop policy if exists pr_update on pr;
create policy pr_read on pr for select to authenticated using (
  created_by = auth.uid()
  or department_id = my_department()
  or has_role('admin') or has_role('executive') or has_role('exec_assistant')
  or has_role('purchasing') or has_role('asset_accountant') or has_role('asset_admin')
  or (has_role('it') and needs_it)
);
create policy pr_insert on pr for insert to authenticated
  with check (created_by = auth.uid() and has_role('requester'));
create policy pr_update on pr for update to authenticated using (
  (created_by = auth.uid() and status in ('draft','submitted'))
  or (has_role('manager') and department_id = my_department())
  or (has_role('it') and needs_it)
  or has_role('asset_accountant') or has_role('asset_admin')
  or has_role('exec_assistant') or has_role('admin')
);

-- รายการและสินทรัพย์: อ่าน/เขียนตามสิทธิ์ของใบแม่
do $$ declare t text;
begin
  foreach t in array array['pr_items','pr_assets','pr_log'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format($f$create policy %I_read on %I for select to authenticated
      using (exists (select 1 from pr where pr.id = %I.pr_id))$f$, t, t, t);
    execute format($f$create policy %I_write on %I for all to authenticated
      using (exists (select 1 from pr where pr.id = %I.pr_id))
      with check (exists (select 1 from pr where pr.id = %I.pr_id))$f$, t, t, t, t);
  end loop;
end $$;

-- ---------- ข้อมูลตั้งต้น ----------

insert into departments (code, name, approver, cost_center, sort_order) values
  ('HR',  'บุคคล (HR)',            'coo', '10302000', 1),
  ('IT',  'IT',                    'coo', null,       2),
  ('PR',  'Pricing',               'coo', null,       3),
  ('IC',  'Inventory Control',     'coo', null,       4),
  ('WH',  'คลังสินค้า (Warehouse)', 'coo', null,      5),
  ('OP',  'ปฏิบัติการสาขา',         'ceo', null,       6),
  ('PU',  'จัดซื้อ',                'ceo', null,       7),
  ('AC',  'บัญชี/การเงิน',          'ceo', null,       8),
  ('SA',  'การตลาด/ออนไลน์',        'ceo', '10101000', 9)
on conflict (code) do nothing;

insert into branches (code, name, sort_order) values
  ('00', 'ส่วนกลาง / หลายสาขา', 0),
  ('01', 'สำนักงานใหญ่',        1)
on conflict (code) do nothing;

-- หมวดที่ติดธง IT มาจากลิสต์ที่ตกลงกันไว้ (ข้อ 21)
insert into item_categories (name, is_it, sort_order) values
  ('จอมอนิเตอร์',          true,  1),
  ('จอ POS',              true,  2),
  ('ปริ้นเตอร์',           true,  3),
  ('เครื่องปริ้นบาร์โค้ด',   true,  4),
  ('เครื่อง PDA',          true,  5),
  ('เครื่องสแกนบาร์โค้ด',    true,  6),
  ('โน้ตบุ๊ก',              true,  7),
  ('PC',                  true,  8),
  ('ของใช้สำนักงาน',       false, 20),
  ('ของใช้สิ้นเปลืองสาขา',  false, 21),
  ('งานซ่อมแซม/ผู้รับเหมา', false, 22),
  ('อุปกรณ์คลัง/ขนส่ง',     false, 23),
  ('สื่อ/การตลาด/งานพิมพ์', false, 24),
  ('เฟอร์นิเจอร์/ชั้นวาง',   false, 25),
  ('อื่น ๆ',               false, 99)
on conflict (name) do nothing;
