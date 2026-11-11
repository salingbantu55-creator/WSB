# PANDUAN MIGRASI KE SUPABASE ASLI — Filantropi Management System v2

Panduan lengkap memindahkan aplikasi dari **MODE DEMO (localStorage)** ke **Supabase asli (PostgreSQL + Auth + Edge Functions + Storage)**. Ikuti langkah berurutan; seluruh langkah dapat diselesaikan ±30 menit.

---

## Ringkasan Arsitektur

```
┌─────────────────────── Browser (static hosting: Vercel/Netlify) ───────────────────────┐
│  index.html (Public Website)      admin.html (Panel Admin)                             │
│  assets/js/supabase.js  → adapter DB API identik (cache mirror + write-behind)         │
│  assets/js/auth.js      → Supabase Auth (email + password)                             │
└──────────────┬─────────────────────────────────────────────────────────────────────────┘
               │ anon key (dilindungi RLS)          service_role (HANYA di server)
┌──────────────▼──────────────────────── Supabase ───────────────────────────────────────┐
│  PostgreSQL (29 tabel + RLS penuh + view publik + RPC)                                 │
│  Auth (admin & donatur)      Storage (bucket "uploads")                                │
│  Edge Functions:                                                                      │
│    • payment-webhook  → verifikasi signature Midtrans/Xendit → RPC webhook_finalize    │
│    • whatsapp-send    → Fonnte/Wablas/Twilio/Meta Cloud + Email (Resend)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Aturan yang tetap ditegakkan saat produksi:**
1. Status pembayaran → `berhasil` **hanya** melalui: (a) Edge Function `payment-webhook` setelah verifikasi signature, (b) konfirmasi manual admin berizin `transactions.verify` (tercatat audit), (c) simulasi DEMO yang **ditolak server** bila `demo_mode=false`.
2. API key payment gateway / WhatsApp / email = **Edge Function secrets**, tidak pernah di frontend.
3. Dana zakat/infak/sedekah/wakaf/sosial terpisah per `fund_type`.
4. Data penerima manfaat & jurnal keuangan privat (RLS); publik hanya melihat `ft_public` (tanpa PII) dan penyaluran berstatus `disalurkan`/`selesai`.

---

## LANGKAH 1 — Buat Proyek Supabase

1. Buka <https://supabase.com> → **New project**.
2. Simpan **Database password** (jangan hilangkan).
3. Setelah siap, catat:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon/public key**: (Project Settings → API) — aman untuk frontend.
   - **Service role key**: JANGAN pernah ditempatkan di frontend / repo publik.

## LANGKAH 2 — Jalankan Skema Database

1. Buka **SQL Editor** di dashboard Supabase.
2. Salin seluruh isi `supabase/schema.sql` → **Run**.
3. Verifikasi: Table Editor menampilkan 29 tabel; `roles` berisi 8 peran; `institution_settings` & `zakat_settings` berisi 1 baris; `payment_methods` berisi 9 metode.

Skema ini membuat:
- 29 tabel + trigger `updated_at` otomatis
- **RLS aktif di semua tabel** dengan matriks izin dari `roles.permissions`
- View publik `ft_public` (jurnal tanpa PII) & `public_stats` (statistik agregat)
- RPC: `donation_status`, `demo_finalize_payment` (guard demo), `cancel_donation_public`, `expire_stale_payments`, `increment_news_views`, `webhook_finalize_payment` (produksi)
- Trigger `programs.collected` (saldo terkumpul program dijaga database)
- Trigger `handle_new_user` (profil + peran otomatis saat user Auth dibuat)
- Bucket Storage `uploads` + kebijakan

## LANGKAH 3 — Buat Pengguna Admin & Donatur

1. **Authentication → Users → Add user** → email + password, centang **Auto Confirm**.
   - Contoh admin: `superadmin@lembagaanda.id`
2. SQL Editor — set peran & nama (ulangi per pengguna):

```sql
update profiles set name = 'Nama Anda', role_key = 'super_admin', role_label = 'Super Admin'
where email = 'superadmin@lembagaanda.id';
```

> Pendaftar baru otomatis mendapat peran `pimpinan` (dari trigger). Super Admin dapat mengubah peran siapa pun dari **Admin → Pengguna & Peran**.

3. Donatur **tidak perlu** dibuat manual — mereka mendaftar sendiri dari **Area Donatur**.
   - Disarankan: **Authentication → Providers → Email → matikan "Confirm email"** agar donatur langsung memiliki sesi setelah mendaftar.

## LANGKAH 4 — Deploy Edge Functions

### Jalur A — Via Dashboard (tanpa CLI, cocok untuk memulai cepat)

1. Dashboard → **Edge Functions → Deploy a new function → Via Editor → Open Editor**.
2. Buat fungsi baru bernama **`payment-webhook`**, tempel seluruh isi
   `supabase/functions/payment-webhook/index.ts` → **Deploy**.
3. Ulangi untuk **`whatsapp-send`** (isi `supabase/functions/whatsapp-send/index.ts`).
4. **Matikan verifikasi JWT khusus untuk `payment-webhook`** (dipanggil Midtrans/Xendit
   tanpa JWT Supabase): Edge Functions → pilih `payment-webhook` → **Details/Verify JWT
   with legacy secret → OFF**. Fungsi `whatsapp-send` dibiarkan **ON** (dipanggil admin
   ber-JWT).
5. Sidebar **Edge Functions → Secrets → Add new secret**:
   - `MIDTRANS_SERVER_KEY` = server key Midtrans (atau `XENDIT_CALLBACK_TOKEN` bila pakai Xendit)
   - `WA_PROVIDER` = `fonnte` | `wablas` | `twilio` | `meta`
   - `WA_TOKEN` = token provider WhatsApp yang dipilih
     (Wablas: `WA_WABLAS_DOMAIN`; Twilio: `TWILIO_ACCOUNT_SID` + `TWILIO_WHATSAPP_FROM`; Meta: `META_PHONE_NUMBER_ID`)
   - Opsional email kuitansi: `RESEND_API_KEY`, `EMAIL_FROM`
   - `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` **otomatis tersedia** (built-in) — jangan dibuat manual.
6. Catat URL fungsi: `https://<project-ref>.supabase.co/functions/v1/payment-webhook`
   (untuk Xendit tambahkan `?provider=xendit`).

### Jalur B — Via CLI

Butuh Supabase CLI (`npm i -g supabase` atau `npx supabase`). Login: `supabase login`, lalu link: `supabase link --project-ref xxxxx`.

```bash
# 1) Webhook pembayaran (tidak butuh JWT karena dipanggil provider)
supabase functions deploy payment-webhook --no-verify-jwt
supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
# gunakan Xendit? selain token di bawah, panggil URL dengan ?provider=xendit
supabase secrets set XENDIT_CALLBACK_TOKEN=xxxxxxxx

# 2) WhatsApp + Email (kuitansi otomatis)
supabase functions deploy whatsapp-send
supabase secrets set WA_PROVIDER=fonnte WA_TOKEN=token-fonnte-anda
# alternatif provider: WA_PROVIDER=wablas|twilio|meta (+ secret terkait)
# email kuitansi (opsional): RESEND_API_KEY=re_xxx EMAIL_FROM="Lembaga <no-reply@domain.id>"
```

- **URL webhook Midtrans** (dashboard Midtrans → Settings → Payment Notification URL):
  `https://xxxxx.supabase.co/functions/v1/payment-webhook`
  Pada pembuatan transaksi di gateway, gunakan `order_id = donation_code`.
- **URL webhook Xendit**:
  `https://xxxxx.supabase.co/functions/v1/payment-webhook?provider=xendit`
  gunakan `external_id = donation_code`.

> Tanpa langkah ini, donasi tetap dapat dibuat; statusnya berubah via **konfirmasi manual rekonsiliasi** oleh Admin Keuangan/Donasi (tetap sesuai aturan). Integrasi WhatsApp berjalan **manual (tautan wa.me)** sampai `WA_TOKEN` diisi.

## LANGKAH 5 — Hubungkan Aplikasi

1. Jalankan aplikasi (`python3 -m http.server 8080`), buka `admin.html` → login **mode demo** (`superadmin@filantropi.id` / `Admin@123`).
2. **Pengaturan Sistem → Supabase (Produksi)**:
   - Isi **Supabase URL** + **Anon key** → **Uji Koneksi** → bila "Koneksi BERHASIL" → **Simpan & Muat Ulang**.
3. Aplikasi memuat ulang dan kini membaca/menulis langsung ke Supabase. Login dengan akun admin yang dibuat di Langkah 3.

## LANGKAH 6 — Migrasi Data (opsional, dari demo lokal)

Sebelum mengisi kredensial (masih mode demo):

1. **Pengaturan Sistem → Supabase (Produksi)** →
   - **SQL Migrasi — Konten & Keuangan**: program, kampanye, berita, galeri, testimoni, FAQ, struktur organisasi, jurnal keuangan, laporan.
   - **SQL Migrasi — Lengkap + Donasi**: di atas **plus** donatur, donasi, transaksi, kuitansi, penyaluran, penerima manfaat, donasi rutin (mengandung data pribadi — hanya untuk proyek Anda).
2. Jalankan file `.sql` yang terunduh di **SQL Editor** (setelah Langkah 2). UUID diregenerasi otomatis dan relasi dipetakan ulang.
3. **Pengaturan Sistem → Identitas**: perbarui nama lembaga, kontak, rekening — lalu **matikan MODE DEMO** (checkbox).

## LANGKAH 7 — Nonaktifkan Mode Demo

**Pengaturan Sistem → Identitas** → hilangkan centang **MODE DEMO**. Efeknya:
- Banner demo & tombol "Simulasikan Webhook (DEMO)" hilang dari halaman publik.
- RPC `demo_finalize_payment` **menolak** dipanggil (ditegakkan server, bukan hanya UI).

## LANGKAH 8 — Deploy Frontend

1. Push folder ini ke GitHub.
2. **Opsi A — GitHub Pages (paling mudah, cukup):** Repo → **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.** Situs tayang di `https://<username>.github.io/<repo>/` — website publik di alamat itu, panel admin di `admin.html`, atau cukup klik **🔒 Masuk / Portal Pengelola** di kanan atas website untuk masuk panel tanpa mengetik alamat admin.
3. **Opsi B — Vercel/Netlify:** import repo sebagai *static site* (tanpa build step, output = root).
4. Opsional: tempatkan `supabase/` di luar folder publik agar tidak ikut ter-publish.
5. HTTPS otomatis; aktifkan juga **backups** harian di Supabase (Database → Backups).

> **Keamanan pada hosting statis:** URL `admin.html` memang bisa ditebak siapa pun — itu wajar dan tetap aman, karena pelindungnya ada di Supabase: RLS di 29 tabel (anonim tidak dapat data admin), RPC sensitif dijaga `has_perm(...)`, dan seluruh secret hanya di Edge Functions. Pengunjung yang membuka `admin.html` tanpa login hanya melihat form masuk kosong.

---

## Checklist Verifikasi Akhir

| # | Uji | Hasil diharapkan |
|---|-----|------------------|
| 1 | Buka website publik tanpa login | Beranda tampil; statistik dari `public_stats`; transparansi dari `ft_public` |
| 2 | Buat donasi (tanpa akun) | Baris baru di tabel `donations` & `payment_transactions`; instruksi VA tampil |
| 3 | Mode demo aktif → klik Simulasikan Webhook | Status **Berhasil**, kuitansi terbit, jurnal masuk — semua via RPC server |
| 4 | Matikan demo → tombol simulasi hilang; panggil RPC manual | Server **menolak** |
| 5 | Admin Donasi/Keuangan → Transaksi → Konfirmasi manual | Berhasil + catatan wajib + tercatat Audit Trail |
| 6 | Kuitansi → Unduh PDF / Kirim via WhatsApp | File PDF terunduh; wa.me terbuka dengan pesan terisi |
| 7 | Outbox WhatsApp (admin) | Pesan kuitansi masuk antrean; kirim manual/API sesuai konfigurasi |
| 8 | Ekspor Excel/PDF (Transaksi, Donatur, Keuangan, Penyaluran, Audit, Transparansi) | File `.xlsx`/`.pdf` asli terunduh |
| 9 | Penyaluran melebihi saldo kategori | Ditolak sistem |
| 10 | Pimpinan login | Sidebar hanya modul berizin (RBAC aktif dari `roles.permissions`) |
| 11 | **Donasi Transfer Manual**: pilih metode di formulir → halaman pembayaran | Rekening lembaga tampil (dari Pengaturan → Identitas → Bank) + tombol hijau **Kirim Bukti Transfer ke WhatsApp Admin** |
| 12 | Klik tombol WA → lampirkan screenshot bukti → kirim | wa.me ke nomor WA lembaga terbuka dengan pesan konfirmasi terisi otomatis (kode donasi, nama, jumlah, peruntukan) |
| 13 | Admin → Transaksi → konfirmasi manual pada donasi tersebut | Server (RPC `admin_verify_payment`) menolak bila catatan kosong; bila valid → status **Berhasil**, kuitansi, jurnal dana, dan audit terbit atomik — website (total, transparansi) terupdate otomatis |
| 14 | Klik **🔒 Masuk / Portal Pengelola** di website publik → login admin | Modal login terbuka; setelah sukses browser dialihkan ke `admin.html` dan **dashboard langsung terbuka tanpa login ulang** (sesi dibagikan satu origin) |
| 15 | Login di Portal Pengelola memakai akun DONATUR | Ditolak dengan pesan jelas: *"Akun ini terdaftar sebagai DONATUR. Silakan masuk melalui Area Donatur"* |

## Alur Donasi Transfer Manual (Konfirmasi via WhatsApp)

Untuk lembaga yang belum memakai payment gateway, alur paling sederhana:

1. **Isi identitas lembaga** (Admin → Pengaturan → Identitas): nomor rekening bank pada daftar **Bank** dan **nomor WhatsApp lembaga** — keduanya tampil otomatis di website.
2. **Donatur** membuka halaman Donasi → memilih **Transfer Bank Manual — Konfirmasi via WhatsApp** (ditampilkan pertama, label PALING MUDAH) → mengisi formulir → halaman instruksi menampilkan seluruh rekening lembaga (tombol salin) + nominal **termasuk 3 digit kode unik** (memudahkan pencocokan).
3. **Donatur** menekan tombol WhatsApp → pesan konfirmasi terisi otomatis (kode donasi, nama, jumlah) → cukup **melampirkan screenshot bukti transfer** → kirim ke WA admin. Konfirmasi juga tercatat di Outbox.
4. **Admin** menerima bukti di WhatsApp → membuka panel Admin → **Transaksi** → tombol centang (Konfirmasi manual) → mencocokkan mutasi bank → isi catatan → **Konfirmasi Berhasil**.
5. **Server** menjalankan RPC `admin_verify_payment` (security definer, guard `has_perm('transactions.verify')`): status transaksi + donasi → `berhasil`, kuitansi terbit (advisory-lock anti-balapan), jurnal keuangan `IN-<fund>` masuk, audit trail tercatat dengan identitas admin — semuanya dalam **satu transaksi database**. Website (total donasi, saldo per dana, transparansi) terupdate otomatis karena dihitung langsung dari tabel.

Catatan integritas: hanya admin berizin `transactions.verify` yang bisa menaikkan status; catatan verifikasi wajib (min. 3 karakter); donasi sudah Berhasil tidak dapat diverifikasi ulang. Batas pembayaran tetap 24 jam — verifikasi sebaiknya dilakukan sebelum kedaluwarsa.

## Pemecahan Masalah

| Gejala | Penyebab & solusi |
|--------|-------------------|
| `ERROR: 42P01 missing FROM-clause entry for table "a"` saat menjalankan schema.sql | Versi schema lama (bug alias di seed permissions, baris ±903). Gunakan **schema.sql terbaru** — bug telah diperbaiki (`a.action` → `m.action`) dan seluruh file telah diuji otomatis (23/23 uji PASS, dijalankan 2× tanpa error). File bersifat idempoten: jalankan ulang **seluruh** file dari awal, aman. |
| Panel admin/web macet di *"Memuat panel admin…"* + konsol `DB.load is not a function` saat Supabase aktif | Bug adapter versi lama (v2.3 ke bawah) — sudah diperbaiki di **v2.4** (adapter kini menyediakan `load`). Gunakan paket terbaru; bila masih terlihat, **hard refresh (Ctrl+F5)** agar `supabase.js?v=2.1.1` terbaru termuat |
| "Supabase gagal terhubung" saat load | URL/anon key salah, atau jaringan memblokir CDN jsdelivr. Periksa `FLMS_SUPABASE_CFG` di localStorage |
| Uji koneksi gagal: *relation "roles" does not exist* | `schema.sql` belum dijalankan / proyek berbeda |
| Login admin gagal "Profil admin tidak ditemukan" | User Auth dibuat tanpa profil — jalankan `update profiles … where email=…` (Langkah 3) |
| Donasi baru muncul tapi admin tidak melihatnya | Klik **Muat Ulang Data** (Pengaturan → Supabase) atau refresh; cache admin diperbarui saat login |
| "Gagal sinkron ke Supabase" toast | Kebijakan RLS menolak aksi — peran Anda kurang izin; periksa matriks di Pengguna & Peran |
| Kuitansi WA tidak otomatis | `WA_TOKEN`/`WA_PROVIDER` belum diset → mode manual (wa.me) dipakai; ikuti Langkah 4 |
| View transparansi kosong | Tidak ada jurnal berstatus `berhasil` — pastikan migrasi SQL dijalankan / ada donasi terverifikasi |

---

*Filantropi Management System v2.0 — Tahap 2: WhatsApp integration, PDF/Excel lanjutan, migrasi Supabase asli.*

---

## Riwayat Perbaikan Schema

**v2.4 — Portal Pengelola (hanya frontend, tanpa perubahan schema):**
1. **Login admin dari website publik** — tombol **🔒 Masuk** (topbar/navbar) + **Portal Pengelola** (menu mobile & footer) membuka modal login di `index.html`; sukses → redirect `admin.html`, sesi dibagikan satu origin sehingga dashboard langsung terbuka.
2. `supabase.js` → `adminLogin` kini mengenali akun donatur dan menampilkan pesan arahan ke Area Donatur (sebelumnya generik "Profil admin tidak ditemukan").
3. Panduan deploy **GitHub Pages** ditambahkan (website + admin satu situs) beserta catatan keamanan RLS.
4. **Perbaikan krusial jalur Supabase** — adapter Supabase tidak mengekspor `load`, sehingga tepat setelah Supabase terhubung halaman macet di *"Memuat panel admin…"/"Memuat Filantropi Management System…* dengan error `Uncaught TypeError: DB.load is not a function` (public.js:57 & admin.js:33). Kini adapter menyediakan `load` (no-op — cache sudah ditarik `pull()` sebelum adapter aktif). Terverifikasi dengan mock Supabase end-to-end: kedua halaman render, login admin → dashboard, tanpa error konsol.

**v2.3** — Alur donasi transfer manual + konfirmasi WhatsApp:
1. **Tipe metode baru `transfer_manual`** — CHECK constraint `payment_methods.type` diperluas (DO block idempoten untuk instalasi lama) + seed metode aktif pertama di formulir donasi.
2. **RPC `admin_verify_payment(p_code, p_note)`** — jalur verifikasi manual admin menjadi server-side & atomik: guard `has_perm('transactions.verify')`, catatan wajib min. 3 karakter, kuitansi + jurnal + audit dalam satu transaksi; `REVOKE` dari public, `GRANT` ke authenticated.
3. Frontend: halaman pembayaran transfer_manual menampilkan rekening lembaga + tombol WA admin (pesan terisi otomatis); verifikasi admin via RPC (fallback ke jalur lama bila skema belum diperbarui).

Telah diverifikasi otomatis: **31/31 uji PASS** (termasuk uji RPC verifikasi: anon ditolak, catatan pendek ditolak, verifikasi berhasil → kuitansi + jurnal infak + audit super_admin, dobel verifikasi ditolak).

**v2.2** — Perbaikan bug 42P01 + penguatan:
1. **Bug alias seed permissions** (baris ±903): `a.action` → `m.action` — penyebab `ERROR: 42P01 missing FROM-clause entry for table "a"` di SQL Editor.
2. **pgcrypto opsional** — di PostgreSQL 13+ `gen_random_uuid()` bawaan; kegagalan create extension tidak lagi menghentikan migrasi.
3. **Peran anon/authenticated/service_role dibuat otomatis bila belum ada** — file dapat dijalankan di Supabase maupun psql lokal.
4. **`pg_advisory_xact_lock`** pada `demo_finalize_payment` & `webhook_finalize_payment` — mencegah balapan penomoran kuitansi saat donasi bersamaan.
5. **`webhook_finalize_payment` dikunci**: `REVOKE ... FROM public` + `GRANT ... TO service_role` — hanya Edge Function yang boleh memfinalisasi status pembayaran.
6. **Seed FAQ idempoten** — deduplikasi + indeks unik `ux_faqs_question` + `on conflict (question)`, aman dijalankan ulang tanpa duplikat.

Telah diverifikasi otomatis (PostgreSQL asli via pgserver, simulasi lengkap Supabase): **23/23 uji PASS** — RLS (anon terblokir, admin diizinkan), trigger profil otomatis, guard demo_mode, finalisasi pembayaran + jurnal zakat, kunci webhook, jumlah seed (29 tabel, 8 peran, 33 izin, 9 metode bayar, 10 kategori, 6 FAQ), dan **idempotensi 2× eksekusi tanpa error**.

**v2.1** — Idempotensi menyeluruh (`if not exists` / `on conflict`), pengaman eksekusi ulang.
