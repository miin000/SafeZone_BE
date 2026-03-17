const { Client } = require('pg');
require('dotenv').config({path: '.env'});

const c = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

c.connect().then(()=> {
  console.log('Connected to DB. Starting backfill...');
  return c.query(`
    UPDATE cases
    SET 
        region_id = subquery.region_id,
        admin_unit_text = subquery.tinh_thanh
    FROM (
        SELECT c.id as case_id, r.id as region_id, r."TinhThanh" as tinh_thanh
        FROM cases c
        JOIN regions r ON ST_Contains(r.geom::geometry, c.geom::geometry)
        WHERE (c.region_id IS NULL OR c.admin_unit_text IS NULL)
          AND c.geom IS NOT NULL
    ) AS subquery
    WHERE cases.id = subquery.case_id;
  `);
}).then(r=>{
  console.log('Update result:', r.rowCount, 'rows updated.');
  return c.query('SELECT id, region_id, admin_unit_text FROM cases WHERE admin_unit_text IS NOT NULL LIMIT 5;');
}).then(r => {
  console.log('Sample updated cases:', r.rows);
  return c.end();
}).catch(console.error);