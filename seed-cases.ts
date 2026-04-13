import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL_MODE === 'require'
    ? { rejectUnauthorized: false }
    : false,
  synchronize: false,
});

type RegionSeedRow = {
  id: number;
  name: string | null;
  lat: number;
  lon: number;
};

function parseCountArg(): number {
  const raw = process.env.SEED_CASES_COUNT || process.argv[2];
  const n = raw ? parseInt(String(raw), 10) : 150;
  if (!Number.isFinite(n) || n <= 0) return 150;
  return Math.min(Math.max(n, 1), 2000);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomIsoWithinDays(daysBack: number): string {
  const now = Date.now();
  const backMs = daysBack * 24 * 60 * 60 * 1000;
  const t = now - Math.floor(Math.random() * backMs);
  return new Date(t).toISOString();
}

function offsetCoords(lat: number, lon: number): { lat: number; lon: number } {
  // ~0.02 degrees ≈ 2.2km in latitude; keep points close to region centroid.
  const latDelta = (Math.random() - 0.5) * 0.04;
  const lonScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonDelta = ((Math.random() - 0.5) * 0.04) / lonScale;
  const nextLat = Math.max(-89.999999, Math.min(89.999999, lat + latDelta));
  const nextLon = Math.max(-179.999999, Math.min(179.999999, lon + lonDelta));
  return { lat: nextLat, lon: nextLon };
}

function mapSeverity(level: string | null | undefined): number {
  switch (String(level || '').toLowerCase()) {
    case 'critical':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    case 'low':
    default:
      return 1;
  }
}

function pickCaseStatus(): string {
  // Weighted distribution that still shows on zones/map.
  const r = Math.random();
  if (r < 0.45) return 'suspected';
  if (r < 0.65) return 'probable';
  if (r < 0.78) return 'confirmed';
  if (r < 0.9) return 'under observation';
  if (r < 0.97) return 'under treatment';
  return 'recovered';
}

async function seed() {
  const count = parseCountArg();
  console.log(`🌱 Seeding ${count} cases...`);
  console.log(`📍 Database: ${process.env.DB_HOST}`);

  await AppDataSource.initialize();

  try {
    const diseaseRows = await AppDataSource.query(
      `SELECT name, risk_level
       FROM diseases
       WHERE COALESCE("isActive", true) = true
       ORDER BY name ASC`,
    );

    const diseases = (diseaseRows || [])
      .map((r: any) => ({
        name: String(r?.name || '').trim(),
        riskLevel: (r?.risk_level ?? r?.riskLevel ?? null) as string | null,
      }))
      .filter((d: any) => d.name.length > 0);

    if (diseases.length === 0) {
      throw new Error('No active diseases found in `diseases` table');
    }

    // Pull a pool of random region centroids to generate valid VN-ish coordinates.
    const regionRows = (await AppDataSource.query(
      `SELECT
         id,
         COALESCE("TinhThanh", NULL) AS name,
         ST_Y(ST_Centroid(geom))::float8 AS lat,
         ST_X(ST_Centroid(geom))::float8 AS lon
       FROM regions
       WHERE geom IS NOT NULL
       ORDER BY random()
       LIMIT 80`,
    )) as RegionSeedRow[];

    if (!regionRows || regionRows.length === 0) {
      throw new Error('No regions with geometry found in `regions` table');
    }

    let inserted = 0;

    for (let i = 0; i < count; i++) {
      const disease = diseases[i % diseases.length];
      const region = pickOne(regionRows);
      const baseLat = Number(region.lat);
      const baseLon = Number(region.lon);
      const { lat, lon } = offsetCoords(baseLat, baseLon);

      const reportedTime = randomIsoWithinDays(120);
      const status = pickCaseStatus();
      const severity = mapSeverity(disease.riskLevel);

      const patientAge = randomInt(1, 85);
      const gender = pickOne(['male', 'female', 'other']);

      const patientName = `BN Seed ${String(i + 1).padStart(3, '0')}`;
      const notes = `seeded_case; disease=${disease.name}; region=${region.name || region.id};`;

      await AppDataSource.query(
        `INSERT INTO cases (
          disease_type,
          status,
          severity,
          reported_time,
          geom,
          region_id,
          admin_unit_text,
          patient_name,
          patient_age,
          patient_gender,
          notes
        ) VALUES (
          $1,
          $2,
          $3,
          $4::timestamptz,
          ST_SetSRID(ST_MakePoint($5, $6), 4326),
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )`,
        [
          disease.name,
          status,
          severity,
          reportedTime,
          lon,
          lat,
          region.id,
          region.name,
          patientName,
          patientAge,
          gender,
          notes,
        ],
      );

      inserted++;
    }

    console.log(`✅ Done. Inserted: ${inserted}`);
    console.log(`ℹ️ Diseases used: ${diseases.length}`);

    const topDisease = await AppDataSource.query(
      `SELECT disease_type, COUNT(*)::int AS count
       FROM cases
       GROUP BY disease_type
       ORDER BY count DESC
       LIMIT 10`,
    );

    console.log('\n📊 Top diseases (cases table):');
    for (const row of topDisease) {
      console.log(`   • ${row.disease_type}: ${row.count}`);
    }

    await AppDataSource.destroy();
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Seed failed:', err?.message || err);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

seed();
