# FILANTROPI MANAGEMENT SYSTEM v2.4

Aplikasi web lembaga filantropi (zakat, infak, sedekah, wakaf + program sosial) yang **lengkap dan siap pakai** — dibangun dengan **HTML5, CSS3, dan JavaScript murni** tanpa dependensi eksternal wajib (berjalan offline). Kode ini mengimplementasikan seluruh spesifikasi: Public Website, Admin Dashboard 11+ modul, sistem login & RBAC 8 peran, serta lapisan database dengan aturan integritas keuangan.

**v2.0 (Tahap 2):**
- 📱 **Integrasi WhatsApp** — outbox notifikasi otomatis (kuitansi, instruksi bayar, penyaluran), kirim via API (Edge Function: Fonnte/Wablas/Twilio/Meta Cloud) atau tautan wa.me, tombol share kuitansi di halaman publik, modul **Outbox WhatsApp** di admin.
- 📄 **PDF/Excel lanjutan** — file **.xlsx dan .pdf ASLI** (pure-JS, tanpa library): kuitansi + terbilang, laporan keuangan multi-halaman, workbook Excel 3 sheet, ekspor transaksi/donatur/penyaluran/audit/transparansi/riwayat donatur.
- ☁️ **Migrasi Supabase asli** — adapter database dengan API identik (cache mirror + write-behind), Supabase Auth, **RLS penuh di 29 tabel**, view publik tanpa PII, RPC status pembayaran (webhook terverifikasi + guard demo), Edge Functions `payment-webhook` & `whatsapp-send`, generator SQL migrasi data, tab konfigurasi **Pengaturan → Supabase (Produksi)**. Panduan lengkap: **MIGRASI-SUPABASE.md**.

**v2.4 (Tahap 4) — Portal Pengelola:**
- 🔐 **Login pengelola langsung dari website publik** — tombol **🔒 Masuk / Portal Pengelola** di kanan atas (topbar, navbar, menu mobile, dan footer) membuka form login; setelah berhasil, pengelola otomatis diarahkan ke Panel Admin **tanpa perlu menghafal alamat `admin.html`**. Bekerja dalam satu situs (satu repo GitHub Pages/Vercel) karena sesi dibagikan satu origin — kredensial tetap divalidasi Supabase Auth + RLS, bukan sekadar disembunyikan URL-nya.
- 🏦 **Donasi Transfer Manual (Tahap 3, schema v2.3)** — donatur transfer ke rekening resmi yang tampil di website → kirim bukti via WhatsApp ke admin (pesan terisi otomatis) → admin verifikasi di Transaksi → donasi masuk otomatis ke website (kuitansi + jurnal + audit, atomik via RPC `admin_verify_payment`).

---

## 1. Cara Menjalankan

**Cara tercepat:** buka `index.html` langsung di browser (Chrome/Edge/Firefox).

**Disarankan (server lokal):**
```bash
cd filantropi-management-system
python3 -m http.server 8080     # atau: npx serve
# buka http://localhost:8080  (website publik)
# buka http://localhost:8080/admin.html  (panel admin)
```

Data tersimpan di **localStorage** browser (meniru Supabase/PostgreSQL). Tombol *Backup & Pulihkan* tersedia di Admin → Pengaturan Sistem → Backup.

> 🔐 **Pengelola tidak perlu mengetik `admin.html`** — buka website seperti biasa, klik **🔒 Masuk** (kanan atas) atau **Portal Pengelola** di footer, login, dan Anda langsung dibawa ke Panel Admin. Bila sudah pernah login, klik tombol yang sama langsung membuka panel.

## 2. Akun Demo (MODE DEMO aktif)

| Peran | Email | Password |
|---|---|---|
| Super Admin | superadmin@filantropi.id | Admin@123 |
| Admin Website | adminweb@filantropi.id | Admin@123 |
| Admin Program | adminprogram@filantropi.id | Admin@123 |
| Admin Donasi | admindonasi@filantropi.id | Admin@123 |
| Admin Keuangan | adminkeuangan@filantropi.id | Admin@123 |
| Admin Penyaluran | adminpenyaluran@filantropi.id | Admin@123 |
| Auditor | auditor@filantropi.id | Admin@123 |
| Viewer/Pimpinan | pimpinan@filantropi.id | Admin@123 |
| **Donatur (Area Donatur)** | donor1@mail.com | Donatur@123 |

## 3. Fitur Utama

### Public Website (`index.html`)
- **Beranda**: hero + DONASI SEKARANG, statistik live, kampanye, program unggulan, testimoni, berita, ringkasan transparansi, galeri, newsletter.
- **Profil Lembaga**: sejarah, visi misi, struktur organisasi, legalitas, peta (Google Maps — *BELUM TERHUBUNG* bila admin belum memasang embed URL), tombol WhatsApp.
- **Program**: 7 kategori (Pendidikan, Kesehatan, Kemanusiaan, Bantuan Bencana, Pemberdayaan Ekonomi, Sosial & Keagamaan, ZISWAF), target/terkumpul/progress bar, halaman detail.
- **Donasi Online**: nominal cepat + custom, jenis dana, pilihan program, **donasi anonim (Hamba Allah)**, donasi rutin bulanan, metode: **Transfer Bank Manual — konfirmasi bukti via WhatsApp admin (paling mudah)**, VA 4 bank / QRIS / E-Wallet / Payment Gateway.
- **Alur pembayaran jujur**: status `Menunggu Pembayaran` → hanya berubah menjadi `Berhasil` melalui **webhook terverifikasi** (di mode demo: tombol simulasi bertanda DEMO). Status lain: `Gagal`, `Kedaluwarsa` (otomatis >24 jam), `Dibatalkan`.
- **Kuitansi otomatis** (logo, no. kuitansi, Hamba Allah/nama, tanggal, jenis dana, program, jumlah, metode, status) — cetak/simpan PDF, terbit hanya setelah pembayaran terverifikasi.
- **Transparansi**: penerimaan/penyaluran/saldo per jenis dana **hanya dari transaksi terverifikasi**, riwayat penyaluran, laporan resmi (PDF).
- **Berita & Dokumentasi** dengan kategori, penulis, tanggal, share sosial media.
- **Kalkulator Zakat**: penghasilan, emas/perak, perdagangan, tabungan — nisab & harga emas dapat diatur admin.
- **Galeri & Testimoni** (izin/consent), **FAQ (6 pertanyaan)**, **Area Donatur** (login/daftar, riwayat, unduh kuitansi, donasi rutin, pengaturan akun), tombol WhatsApp mengapung.

### Admin Dashboard (`admin.html`) — 11 modul
Dashboard Utama (harian/bulanan/tahunan, saldo 5 dana, grafik, transaksi terbaru, kampanye mendekati target) · Manajemen Program · Kampanye · Donatur (+Ekspor Excel) · Transaksi (filter, **rekonsiliasi**, konfirmasi manual ber-catatan, koreksi wajib audit) · Penyaluran Dana (alur *diajukan → diverifikasi → disetujui → disalurkan → selesai*, potong saldo per kategori, unggah bukti) · Penerima Manfaat (**data termasking** sesuai peran) · Laporan Keuangan (ringkasan per dana, jurnal, buat & setujui laporan, Excel/PDF) · Konten Website (berita, galeri, testimoni, FAQ, profil & struktur) · Pengguna & Peran (**matriks izin dapat diubah Super Admin**) · Pengaturan Sistem (identitas, rekening, gateway **BELUM TERHUBUNG** tanpa API key, WhatsApp/SMTP/Gemini, kuitansi, SEO, zakat, backup) · **Audit Trail**.

## 4. Aturan Integritas yang Ditegakkan Kode
1. **Satu sumber data** untuk semua modul (`DB`).
2. Status pembayaran **hanya** `webhookSuccess()` (webhook terverifikasi; demo ditandai) atau `manualConfirm()` (rekonsiliasi oleh admin berwenang, wajib catatan).
3. Transaksi **Berhasil terkunci** — koreksi wajib alasan + rekam nilai lama→baru di `audit_logs`.
4. Dana terbatas (zakat/infak/sedekah/wakaf/sosial) **dicatat & dipotong terpisah**; penyaluran melebihi saldo kategori ditolak.
5. Data penerima manfaat sensitif **dimasking** kecuali peran memiliki `beneficiaries.view_full`.
6. Data demo diberi label **[DEMO]**; integrasi tanpa API key menampilkan **BELUM TERHUBUNG** beserta halaman konfigurasinya.
7. Kuitansi hanya terbit setelah status **Berhasil**.

## 5. Struktur File
```
filantropi-management-system/
├── index.html               # Public Website (SPA hash-router, 15 rute)
├── admin.html               # Admin Dashboard (14 rute, termasuk Outbox WhatsApp)
├── assets/css/style.css     # Design system (hijau tua/putih/emas/abu)
├── assets/js/utils.js       # Format, ikon SVG, modal, toast, print, SHA-256
├── assets/js/db.js          # DB demo (29 tabel, localStorage) + webhook pipeline
├── assets/js/supabase.js    # [v2] Adapter Supabase asli + Auth + generator SQL migrasi
├── assets/js/auth.js        # Auth admin & donatur + RBAC 8 peran (Auth/Supabase)
├── assets/js/export.js      # [v2] Mesin ekspor .xlsx & .pdf asli (tanpa library)
├── assets/js/wa.js          # [v2] WhatsApp: outbox, pesan, wa.me, Edge Function send
├── assets/js/charts.js      # Grafik canvas (garis, donut, batang)
├── assets/js/public.js      # Semua halaman publik + aksi
├── assets/js/admin.js       # Semua modul admin + aksi
├── supabase/schema.sql      # [v2] Skema produksi: 29 tabel, RLS penuh, RPC, seed, storage
├── supabase/functions/      # [v2] Edge Functions: payment-webhook, whatsapp-send
└── MIGRASI-SUPABASE.md      # [v2] Panduan migrasi step-by-step ke Supabase
```

## 6. Migrasi ke Produksi (Supabase + Hosting)
**Ikuti `MIGRASI-SUPABASE.md`** — ringkasan:
1. Jalankan `supabase/schema.sql` di SQL Editor (29 tabel + RLS + RPC + seed + storage).
2. Buat pengguna admin di Authentication → set `role_key` di `profiles`.
3. Deploy Edge Functions `payment-webhook` & `whatsapp-send` + secrets (API key di server).
4. Admin → Pengaturan → **Supabase (Produksi)** → isi URL + anon key → Simpan & Muat Ulang.
5. (Opsional) Ekspor SQL Migrasi data demo → jalankan di SQL Editor → matikan MODE DEMO.
6. Deploy static ke hosting; aktifkan backup harian Supabase.

### Opsi hosting: GitHub Pages (website + admin dalam SATU situs)
`index.html` dan `admin.html` sengaja diletakkan dalam satu folder agar bisa di-host bersama — backend (database, auth, verifikasi) ditangani Supabase, sehingga hosting statis apa pun cukup:
1. Push seluruh folder ke repository GitHub.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
3. Situs tayang di `https://<username>.github.io/<repo>/`:
   - Website publik: `https://<username>.github.io/<repo>/`
   - Panel admin: `https://<username>.github.io/<repo>/admin.html` (atau cukup klik **🔒 Masuk** di website).
4. Isi URL + anon key Supabase lewat Admin → Pengaturan → Supabase (Produksi); konfigurasi tersimpan di browser masing-masing pengelola.

> **Catatan keamanan penting:** pada hosting statis, nama file `admin.html` tidak rahasia (siapa pun bisa mencoba URL itu) — dan itu **by design aman**, karena seluruh perlindungan ada di sisi Supabase: data admin dilindungi RLS 29 tabel (pengunjung anonim tidak bisa membacanya), aksi sensitif dijaga RPC `has_perm(...)`, dan API key rahasia hanya ada di Edge Functions. Halaman admin tanpa login hanya menampilkan form masuk kosong; tombol **Portal Pengelola** hanyalah pintu kemudahan, bukan lapisan keamanan.

## 7. Uji Coba Cepat
1. Buka `#/donasi` → isi form → pilih **Transfer Bank Manual** → halaman instruksi → **Kirim Bukti ke WhatsApp Admin** / **Simulasikan Webhook (DEMO)** → status **Berhasil** + kuitansi terbit → cek **Transparansi** (saldo berubah).
2. Klik **🔒 Masuk** di kanan atas website → login `superadmin@filantropi.id` / `Admin@123` → langsung diarahkan ke Panel Admin.
3. Login Admin Keuangan → Transaksi → filter **Belum Direkonsiliasi** → rekonsiliasi.
4. Login Admin Penyaluran → Ajukan penyaluran melebihi saldo → **sistem menolak**.
5. Login Pimpinan → sidebar hanya menampilkan modul berizin (RBAC aktif).
6. Admin → Audit Trail → semua aksi di atas tercatat dengan nilai lama→baru.
