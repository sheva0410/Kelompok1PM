# SMART-TPS — Frontend Web

Frontend dashboard SMART-TPS empat node. Alurnya mengikuti web SMART-TPS terdahulu (login → dashboard → detail → laporan),
dengan isi yang disesuaikan ke proposal (SRS 4.5.1, SDD 5.2.4, Tabel 5.5).

Saat ini semua data masih **data contoh** dari `js/mock-api.js`, belum terhubung ke backend.

## Menjalankan

Buka `index.html` langsung di browser, atau jalankan server lokal dari folder ini:

```bash
python -m http.server 5500
```

lalu buka `http://localhost:5500`.

Akun contoh:

| Username | Password | Peran |
|---|---|---|
| `pengelola` | `pengelola123` | Pengelola TPS |
| `admin` | `admin123` | Administrator |
| `warga` | `warga123` | Warga |

## Halaman

| File | Isi | Bisa dibuka oleh |
|---|---|---|
| `index.html` | Masuk | Semua |
| `register.html` | Daftar akun warga | Semua |
| `dashboard.html` | Pengelola/admin: status TPS, notifikasi, denah, ringkasan node, laporan terbaru. Warga: kondisi bau, denah, pemberitahuan, laporan saya | Semua yang sudah masuk |
| `node.html?id=N1` | Detail node: tingkat bau, tren, grafik (tingkat bau, 9 sensor MQ, suhu & kelembapan), histori, ekspor CSV. Rentang 1/6/24 jam atau tanggal pilihan sendiri (maks. 7 hari) | Semua yang sudah masuk (ekspor: pengelola & admin, hapus histori: admin) |
| `laporan.html` | Inbox laporan warga: saring status, ubah status, lihat foto | Pengelola, admin |
| `notifikasi.html` | Riwayat notifikasi n8n: jenis (tinggi/tidak aktif), node, status kirim termasuk kirim ulang; rentang 24 jam/3 hari/7 hari | Pengelola, admin |
| `lapor.html` | Formulir laporan bau dan daftar laporan saya | Warga |
| `admin.html` | Daftarkan/ubah/hapus node, posisi di denah, nilai R0, tambah/hapus akun, pengaturan data contoh | Admin |
| `sus.html` | Kuesioner SUS 10 pernyataan (Lampiran E). Admin juga melihat rekap: skor per partisipan (rumus Lampiran F), rata-rata per peran dan per pernyataan, kesimpulan terhadap target ≥ 68, ekspor CSV | Semua yang sudah masuk (rekap: admin) |
| `profil.html` | Ganti password, ubah email, pilih tema, putar ulang panduan | Semua yang sudah masuk |

### Fitur kegunaan

- **Panduan pengguna baru:** 4 langkah di dashboard, berbeda untuk warga dan pengelola/admin. Muncul sekali per akun; bisa diputar ulang dari halaman Profil.
- **Tema terang/gelap:** tombol bulan/matahari di navbar, atau pilihan "Ikuti perangkat / Terang / Gelap" di Profil.

### Alur UAT dengan kuesioner SUS

1. Partisipan mencoba sistem (login dengan akunnya, atau akun yang disiapkan tim).
2. Partisipan membuka menu **Kuesioner**, mengisi kode partisipan (misal `P01`), peran, dan 10 pernyataan.
3. Admin membuka **Kuesioner → Rekap hasil** untuk melihat skor dan kesimpulan, lalu **Ekspor CSV** untuk Laporan Akhir (Lampiran F).

### Tampilan saat gagal

- Saat memuat: kerangka abu-abu berkilau (skeleton).
- Gagal memuat pertama kali: kotak "Data gagal dimuat" + tombol **Coba lagi**.
- Gagal saat pembaruan otomatis: data lama tetap tampil, muncul pemberitahuan sekali.
- Koneksi internet putus: pita kuning di bawah navbar; data dimuat ulang otomatis saat koneksi kembali.
- Sesi habis: langsung diarahkan ke halaman masuk.
- Untuk menguji: masuk sebagai admin → Kelola node → centang **Simulasikan server tidak merespons**.

## Struktur

```
web/frontend/
├── *.html              satu file per halaman
├── css/style.css       token warna (terang & gelap), layout, komponen
└── js/
    ├── vendor/         Three.js r147 + OrbitControls (disimpan lokal, jalan tanpa internet)
    ├── scene3d.js      denah TPS 3D: pagar, timbunan, bak kontainer, 4 node berwarna sesuai tingkat bau
    ├── mock-api.js     data contoh + fungsi Api.* (pengganti backend)
    ├── ui.js           komponen bersama: navbar, cek login, denah 2D/3D, grafik, toast
    └── pages/*.js      logika tiap halaman
```

## Denah 3D

- Tampil di halaman masuk, daftar, dashboard, dan detail node (kamera fokus ke node yang dibuka).
- Seret untuk memutar (di HP: dua jari), tombol `+` / `−` / `Reset` untuk zoom. Klik node atau labelnya untuk membuka detail.
- Tombol `3D` / `2D` di pojok kiri atas mengganti ke denah SVG. Pilihan diingat browser.
- Jika browser tidak mendukung WebGL, denah otomatis memakai versi 2D.
- Animasi denyut dan kepulan bau dimatikan bila pengguna memilih "kurangi gerakan" di sistem operasinya.
- Posisi node mengikuti `pos_x` dan `pos_y` (meter) dari halaman Kelola node.
- Hemat daya: denah tidak digambar ulang saat diam. Saat diputar 60 fps; animasi node Sedang/Tinggi 30 fps (HP 20 fps); putaran otomatis berhenti setelah 25 detik; render berhenti saat denah tidak terlihat atau tab disembunyikan. Di HP dan perangkat lemah (≤ 4 inti CPU atau ≤ 4 GB RAM) bayangan dimatikan dan resolusi maksimal 1,5×.

## Menghubungkan ke backend

Halaman hanya memanggil fungsi `Api.*`. Saat backend siap, ganti isi fungsi di `js/mock-api.js`
dengan `fetch()` ke endpoint yang tertulis di komentarnya (Tabel 5.2 proposal):

| Fungsi | Endpoint |
|---|---|
| `Api.login` | `POST /api/auth/login` |
| `Api.register` | `POST /api/auth/register` |
| `Api.profile` | `GET /api/auth/profile` |
| `Api.getStatus` | `GET /api/status` |
| `Api.getReadings` | `GET /api/nodes/{id}/readings?from=&to=` |
| `Api.getReports` / `createReport` / `updateReport` | `GET` / `POST` / `PATCH /api/reports` |
| `Api.exportCsv` | `GET /api/export?node=&from=&to=` |
| `Api.getNotifications` | `GET /api/notifications?hours=` (endpoint baru, belum ada di Tabel 5.2) |
| `Api.getNodes` / `addNode` / `updateNode` / `deleteNode` | `GET` / `POST /api/nodes`, `PUT` / `DELETE /api/nodes/{id}` |
| `Api.saveNodePositions` / `measureR0` / `deleteReadings` | `PUT /api/nodes/{id}`, `PUT /api/nodes/{id}/r0`, `DELETE /api/nodes/{id}/readings` |
| `Api.getAccounts` / `addAccount` / `deleteAccount` | `GET` / `POST /api/accounts`, `DELETE /api/accounts/{username}` (endpoint baru) |
| `Api.changePassword` / `updateEmail` | `PUT /api/auth/password`, `PUT /api/auth/profile` (endpoint baru) |
| `Api.submitSus` / `getSusResponses` / `deleteSus` | `POST` / `GET /api/sus`, `DELETE /api/sus/{id}` (endpoint baru; bisa juga disimpan tanpa backend, misalnya Google Form) |

Error dari API sebaiknya membawa penanda supaya tampilan bisa memilih respons yang tepat: `auth` (401, sesi habis), `forbidden` (403), `notFound` (404), `network` (server tidak merespons), dan `fields` (pesan per kolom untuk error validasi 400).

Token login disimpan di `localStorage` (kunci `smarttps_session`) dan dikirim sebagai header `Authorization: Token <token>`.

## Keputusan yang belum final

- Nama tingkat bau: Rendah/Sedang/Tinggi (dipakai di sini), Normal/Sedang/Tinggi, atau Aman/Waspada/Bahaya.
- Proposal (tabel `USER`) hanya punya peran pengelola dan admin. Di sini warga punya akun seperti di web terdahulu, jadi tabel `USER` dan `CITIZEN_REPORT` perlu kolom peran warga dan pelapor.
- Foto pada laporan warga tidak ada di proposal. Di sini foto opsional.
