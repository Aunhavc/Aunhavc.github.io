/* =============================================================
   ตัวดักหน้าค้าง — สคริปต์ธรรมดา (ไม่ใช่ module) จึงทำงานเสมอ
   แม้ module หลักจะโหลดไม่สำเร็จ

   เหตุที่ต้องมี: ไลบรารี Supabase โหลดจาก CDN ภายนอก (esm.sh)
   ถ้าเน็ตบริษัทบล็อก CDN นั้น หน้าเว็บจะค้างที่ "กำลังโหลด…" เงียบ ๆ
   ผู้ใช้จะโทรหา IT โดยไม่มีข้อมูลอะไรเลย — อันนี้บอกสาเหตุให้เลย
   ============================================================= */
(function () {
  var SECONDS = 12;
  setTimeout(function () {
    var root = document.getElementById('root') || document.getElementById('out');
    if (!root) return;
    // ถ้าหน้ายังเป็นข้อความ boot ตั้งต้นอยู่ แปลว่า module ไม่ได้ทำงาน
    if (!/กำลังโหลด/.test(root.textContent || '')) return;

    var cfg = window.PR_CONFIG || {};
    root.innerHTML =
      '<div style="max-width:620px;margin:60px auto;padding:20px;font-family:Sarabun,system-ui;' +
      'border:1px solid #dcdfe5;border-radius:10px;background:#fff">' +
      '<h2 style="margin:0 0 10px;font-size:17px">เปิดระบบไม่สำเร็จ</h2>' +
      '<p style="margin:0 0 10px">หน้าเว็บโหลดค้างเกิน ' + SECONDS + ' วินาที สาเหตุที่พบบ่อยเรียงตามความน่าจะเป็น:</p>' +
      '<ol style="margin:0 0 10px;padding-inline-start:20px;line-height:1.8">' +
      (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY ? '' :
        '<li><b>ยังไม่ได้กรอก pr/config.js</b> — ใส่ SUPABASE_URL และ SUPABASE_ANON_KEY ก่อน</li>') +
      '<li>เครือข่ายบริษัทบล็อก <code>esm.sh</code> หรือ <code>*.supabase.co</code> — แจ้งฝ่ายเครือข่ายให้เปิด</li>' +
      '<li>อินเทอร์เน็ตหลุด — ลองเปิดเว็บอื่นดู</li>' +
      '</ol>' +
      '<p style="margin:0;color:#697083;font-size:13.5px">กด F12 แล้วดูแท็บ Console จะเห็นสาเหตุที่แท้จริง</p>' +
      '</div>';
  }, SECONDS * 1000);
})();
