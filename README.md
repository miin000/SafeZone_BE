# SafeZone API

Backend REST API của SafeZone, cung cấp xác thực, dữ liệu dịch bệnh, báo cáo ca bệnh, vùng dịch, GIS, thông báo, bài viết cộng đồng và thông tin y tế cho Admin Web và ứng dụng Flutter.

## Công nghệ

- NestJS 11 và TypeScript
- PostgreSQL với TypeORM
- JWT, Passport và bcrypt
- Class Validator/Transformer
- Firebase Admin cho push notification
- Nodemailer/Resend và Twilio cho các luồng liên lạc tùy chọn

## Module

| Module | Mục đích |
|---|---|
| Auth | Đăng ký, đăng nhập, hồ sơ, xác minh và token |
| Admin | Chức năng quản trị và audit |
| Report | Tiếp nhận và xử lý báo cáo ca bệnh |
| Zone | Tạo, truy vấn và tính mức rủi ro vùng dịch |
| GIS | Dữ liệu bản đồ và khu vực địa lý |
| Disease | Danh mục và dữ liệu dịch bệnh |
| Notification | Thông báo cho người dùng |
| Post | Bài đăng cộng đồng |
| Health Info | Nội dung hướng dẫn y tế |

## Yêu cầu

- Node.js 20 trở lên
- npm 10 trở lên
- PostgreSQL 14 trở lên hoặc PostgreSQL tương thích như Neon/Render Postgres

## Cài đặt

```powershell
cd apps/api
npm install
Copy-Item .env.example .env
```

Điền thông tin database và các dịch vụ tùy chọn trong `.env`. Không commit file `.env`.

### Cấu hình database

Có thể dùng một trong hai cách:

```env
# Database URL của dịch vụ managed
DATABASE_URL=postgresql://user:password@host:5432/database
DB_SSL_MODE=require
```

Hoặc dùng các biến rời:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=safezone
```

Các biến quan trọng khác:

```env
PORT=3002
NODE_ENV=development
JWT_SECRET=thay-bang-gia-tri-bi-mat
```

Firebase, email và SMS là các tích hợp tùy chọn. Tên biến đầy đủ được liệt kê trong [.env.example](.env.example).

## Chạy local

```powershell
# Development
npm run start:dev

# Production local
npm run build
npm run start:prod
```

API mặc định chạy tại `http://localhost:3002`, với global prefix:

```text
http://localhost:3002/api/v1
```

Route kiểm tra cơ bản: `GET /api/v1`.

## Seed dữ liệu

Script seed ca bệnh nằm trong thư mục `data/`. Chạy từ thư mục API:

```powershell
npm run seed:cases
```

Chỉ chạy seed trên database đúng môi trường và kiểm tra dữ liệu trước khi chạy production.

## Kiểm thử và lint

```powershell
npm run test
npm run test:e2e
npm run test:cov
npm run lint
```

## Cấu trúc thư mục

```text
src/
  auth/          # Xác thực và phân quyền
  admin/         # API quản trị
  disease/       # Danh mục bệnh
  gis/           # Dữ liệu GIS
  health-info/   # Thông tin y tế
  notification/  # Thông báo
  post/          # Bài viết cộng đồng
  report/        # Báo cáo ca bệnh
  zone/          # Vùng dịch
  main.ts        # Bootstrap, CORS, validation và port
```

## Tài liệu API

- [API documentation](../../docs/API_DOCUMENTATION.md)
- [API reference](../../docs/API_REFERENCE.md)
- [Mobile API documentation](../../docs/MOBILE_API_DOCUMENTATION.md)
- [Database tables](../../docs/DB_TABLES_IN_USE.md)
- [Neon migration guide](../../docs/NEON_MIGRATION_GUIDE.md)

## Triển khai Render

Repository đã có [render.yaml](../../render.yaml) cho service API:

- Root directory: `apps/api`
- Build command: `npm ci && npm run build`
- Start command: `npm run start:prod`
- Health check: `/api/v1`

Trên Render, khai báo `DATABASE_URL`, `JWT_SECRET` và các biến tích hợp cần thiết trong Environment. Render tự cấp `PORT`; ứng dụng đã lắng nghe `process.env.PORT`.

Chi tiết xem [RENDER_DEPLOY.md](../../docs/RENDER_DEPLOY.md).

## Bảo mật

- Không commit `.env`, mật khẩu database, JWT secret, Firebase private key hoặc API key.
- Production phải dùng `JWT_SECRET` mạnh và database có SSL khi provider yêu cầu.
- `synchronize` đang tắt; thay đổi schema cần migration hoặc quy trình database được kiểm soát.

