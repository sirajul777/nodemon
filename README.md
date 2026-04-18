# MikHMon NestJS

MikroTik Hotspot Monitor — versi NestJS, support ROS 6 dan ROS 7.

## Cara Install

```bash
# 1. Install dependencies
npm install

# 2. Copy dan edit konfigurasi
cp .env.example .env
# Edit .env sesuai kebutuhan

# 3. Build
npm run build

# 4. Jalankan
npm run start
```

Buka browser: http://localhost:3000

Login default: **mikhmon** / **1234**

## Docker

```bash
docker-compose up -d
```

## Struktur API

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Cek status login |
| GET | /api/sessions | Daftar router sessions |
| POST | /api/sessions | Tambah/edit session |
| DELETE | /api/sessions/:id | Hapus session |
| GET | /api/mikrotik/:session/dashboard | Info dashboard |
| GET | /api/mikrotik/:session/hotspot/active | User aktif |
| GET | /api/mikrotik/:session/hotspot/users | Daftar user |
| GET | /api/mikrotik/:session/hotspot/profiles | Profile |
| GET | /api/mikrotik/:session/connect/test | Test koneksi |
| GET | /api/report/:session/selling | Selling report |
| GET | /api/report/:session/live | Live report |
| GET | /api/report/:session/resume | Resume/grafik |
| DELETE | /api/report/:session/selling | Hapus data |

## Perbedaan vs PHP Version

- **ROS 7 fix**: Filter `?source` dan `?comment` yang broken di ROS 7 sudah diatasi secara native
- **Tidak ada double connect**: Koneksi dikelola per-request, tidak ada reconnect bug
- **REST API**: Frontend dan backend terpisah, mudah diintegrasikan dengan tools lain
- **Persistent config**: Data disimpan di `data/config.json`

## Cara Tambah Router

1. Buka http://localhost:3000
2. Login
3. Halaman Sessions → klik "Add"
4. Isi IP, user, password API MikroTik
5. Klik Save → Test Connect untuk verifikasi
