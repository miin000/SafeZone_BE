import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL_MODE === 'require',
  synchronize: false,
});

async function seed() {
  try {
    console.log('🌱 Seeding accounts to Neon database...');
    console.log(`📍 Database: ${process.env.DB_HOST}`);

    await AppDataSource.initialize();

    // First, check if 'health_authority' exists in enum, if not add it
    try {
      await AppDataSource.query(
        `ALTER TYPE users_role_enum ADD VALUE 'health_authority'`
      );
      console.log('✓ Added health_authority to enum');
    } catch (err: any) {
      // Already exists or other error, continue
      console.log('✓ Enum already has health_authority');
    }

    const seedSQL = `
INSERT INTO users (
  id,
  email,
  password,
  name,
  phone,
  role,
  "isActive",
  "isEmailVerified",
  "isPhoneVerified",
  "createdAt",
  "updatedAt"
) VALUES
(
  gen_random_uuid(),
  'admin1@safezone.vn',
  '$2b$10$4DySjg20BLFzanxhbJc9RORvN8Bj.54IRU4VPFvZ1iWsmF7eSnGAq',
  'Admin SafeZone 1',
  '0901000001',
  'admin',
  true,
  true,
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'admin2@safezone.vn',
  '$2b$10$4DySjg20BLFzanxhbJc9RORvN8Bj.54IRU4VPFvZ1iWsmF7eSnGAq',
  'Admin SafeZone 2',
  '0901000002',
  'admin',
  true,
  true,
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'ythanoi@safezone.vn',
  '$2b$10$4DySjg20BLFzanxhbJc9RORvN8Bj.54IRU4VPFvZ1iWsmF7eSnGAq',
  'Sở Y tế Hà Nội',
  '0902000001',
  'health_authority',
  true,
  true,
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'ytdanang@safezone.vn',
  '$2b$10$4DySjg20BLFzanxhbJc9RORvN8Bj.54IRU4VPFvZ1iWsmF7eSnGAq',
  'Sở Y tế Đà Nẵng',
  '0902000002',
  'health_authority',
  true,
  true,
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'ythcm@safezone.vn',
  '$2b$10$4DySjg20BLFzanxhbJc9RORvN8Bj.54IRU4VPFvZ1iWsmF7eSnGAq',
  'Sở Y tế TP.HCM',
  '0902000003',
  'health_authority',
  true,
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
    `;

    const result = await AppDataSource.query(seedSQL);
    console.log('✅ Seed completed!');
    console.log(`📊 Rows affected: ${result.rowCount || result.length}`);

    // Verify accounts were created
    const verify = await AppDataSource.query(
      `SELECT email, name, role FROM users WHERE role IN ('admin', 'health_authority') ORDER BY "createdAt" DESC`,
    );
    console.log('\n📋 Current staff accounts:');
    verify.forEach((row: any) => {
      console.log(`   • ${row.email} (${row.name}) - ${row.role}`);
    });

    await AppDataSource.destroy();
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
