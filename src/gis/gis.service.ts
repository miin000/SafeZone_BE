import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

export interface CaseDto {
  id?: number;
  external_id?: string;
  disease_type: string;
  status: string;
  severity?: number;
  reported_time: string;
  lat: number;
  lon: number;
  region_id?: number;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  notes?: string;
}

export interface ReverseGeocodeResult {
  address: string;
  commune?: string;
  district?: string;
  province?: string;
  regionId?: number;
}

@Injectable()
export class GisService {
  constructor(
    @Inject(getDataSourceToken())
    private readonly dataSource: DataSource,
  ) { }

  async getRegionsGeoJSON() {
    const [row] = await this.dataSource.query(`
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(r.geom)::jsonb,
            'properties', to_jsonb(r) - 'geom'
          )
        ), '[]'::jsonb)
      ) AS geojson
      FROM regions r;
    `);

    return row.geojson;
  }

  async getCasesGeoJSON(params: { diseaseType?: string; status?: string; from?: string; to?: string }) {
    const { diseaseType, status, from, to } = params;

    const where: string[] = [];
    const values: any[] = [];

    if (diseaseType) {
      values.push(diseaseType);
      where.push(`c.disease_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`c.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [row] = await this.dataSource.query(
      `
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(c.geom)::jsonb,
            'properties', jsonb_build_object(
              'id', c.id,
              'external_id', c.external_id,
              'disease_type', c.disease_type,
              'status', c.status,
              'reported_time', c.reported_time,
              'region_id', c.region_id,
              'severity', c.severity,
              'region_name', r."TinhThanh",
              'patient_name', c.patient_name,
              'patient_age', c.patient_age,
              'patient_gender', c.patient_gender,
              'notes', c.notes,
              'lat', ST_Y(c.geom::geometry),
              'lon', ST_X(c.geom::geometry)
            )
          )
        ), '[]'::jsonb)
      ) AS geojson
      FROM cases c
      LEFT JOIN regions r ON r.id = c.region_id
      ${whereSql};
      `,
      values,
    );

    return row.geojson;
  }

  async getCaseById(id: string) {
    const rows = await this.dataSource.query(
      `
    SELECT
      c.id,
      c.external_id,
      c.disease_type,
      c.status,
      c.severity,
      c.reported_time,
      c.region_id,
      c.patient_name,
      c.patient_age,
      c.patient_gender,
      c.notes,
      ST_Y(c.geom) AS lat,
      ST_X(c.geom) AS lon,
      r."TinhThanh" AS region_name
    FROM cases c
    LEFT JOIN regions r ON r.id = c.region_id
    WHERE c.id = $1
    `,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Case with ID ${id} not found`);
    }

    return rows[0];
  }


  async getCasesList(params: {
    diseaseType?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { diseaseType, status, from, to, page = 1, limit = 50, search } = params;

    const where: string[] = [];
    const values: any[] = [];

    if (diseaseType) {
      values.push(diseaseType);
      where.push(`c.disease_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`c.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }
    if (search) {
      values.push(`%${search}%`);
      where.push(`(c.external_id ILIKE $${values.length} OR c.patient_name ILIKE $${values.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM cases c ${whereSql}`,
      values,
    );

    // Get paginated data
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id,
        c.external_id,
        c.disease_type,
        c.status,
        c.severity,
        c.reported_time,
        c.region_id,
        c.patient_name,
        c.patient_age,
        c.patient_gender,
        c.notes,
        ST_Y(c.geom::geometry) AS lat,
        ST_X(c.geom::geometry) AS lon,
        r."TinhThanh" AS region_name
      FROM cases c
      LEFT JOIN regions r ON r.id = c.region_id
      ${whereSql}
      ORDER BY c.reported_time DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, limit, offset],
    );

    return {
      data: rows,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit),
    };
  }

  async createCase(dto: CaseDto) {
    const { disease_type, status, severity = 1, reported_time, lat, lon, region_id, patient_name, patient_age, patient_gender, notes } = dto;

    const [result] = await this.dataSource.query(
      `
      INSERT INTO cases (disease_type, status, severity, reported_time, geom, region_id, patient_name, patient_age, patient_gender, notes)
      VALUES ($1, $2, $3, $4::timestamptz, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8, $9, $10, $11)
      RETURNING id, external_id, disease_type, status, severity, reported_time, region_id, patient_name, patient_age, patient_gender, notes
      `,
      [disease_type, status, severity, reported_time, lon, lat, region_id || null, patient_name || null, patient_age || null, patient_gender || null, notes || null],
    );

    return result;
  }

  async updateCase(id: string, dto: Partial<CaseDto>) {
    const existing = await this.getCaseById(id);
    if (!existing) throw new NotFoundException(`Case with ID ${id} not found`);

    const updates: string[] = [];
    const values: any[] = [];

    const push = (val: any) => {
      values.push(val);
      return `$${values.length}`;
    };

    if (dto.disease_type !== undefined) updates.push(`disease_type = ${push(dto.disease_type)}`);
    if (dto.status !== undefined) updates.push(`status = ${push(dto.status)}`);
    if (dto.severity !== undefined) updates.push(`severity = ${push(dto.severity)}`);

    if (dto.reported_time !== undefined) {
      updates.push(`reported_time = ${push(dto.reported_time)}::timestamptz`);
    }

    // notes/patient
    if (dto.patient_name !== undefined) updates.push(`patient_name = ${push(dto.patient_name)}`);
    if (dto.patient_age !== undefined) updates.push(`patient_age = ${push(dto.patient_age)}`);
    if (dto.patient_gender !== undefined) updates.push(`patient_gender = ${push(dto.patient_gender)}`);
    if (dto.notes !== undefined) updates.push(`notes = ${push(dto.notes)}`);

    // geom + region_id logic
    const hasLat = dto.lat !== undefined;
    const hasLon = dto.lon !== undefined;

    let newPointSql: string | null = null;

    if (hasLat && hasLon) {
      const lonParam = push(dto.lon);
      const latParam = push(dto.lat);
      newPointSql = `ST_SetSRID(ST_MakePoint(${lonParam}, ${latParam}), 4326)`;

      updates.push(`geom = ${newPointSql}`);

      // Nếu user không truyền region_id, tự gán theo ST_Within(newPoint)
      if (dto.region_id === undefined) {
        updates.push(`
        region_id = (
          SELECT r.id
          FROM regions r
          WHERE ST_Within(${newPointSql}, r.geom)
          LIMIT 1
        )
      `.trim());
      }
    } else if (hasLat !== hasLon) {
      // tránh update nửa vời
      throw new Error('Please provide both lat and lon to update location.');
    }

    // nếu region_id được truyền explicit thì ưu tiên theo dto
    if (dto.region_id !== undefined) updates.push(`region_id = ${push(dto.region_id)}`);

    if (updates.length === 0) return existing;

    // WHERE id
    const idParam = push(id);

    await this.dataSource.query(
      `UPDATE cases SET ${updates.join(', ')} WHERE id = ${idParam}`,
      values,
    );

    return this.getCaseById(id);
  }


  async deleteCase(id: string) {
    const existing = await this.getCaseById(id);
    if (!existing) throw new NotFoundException(`Case with ID ${id} not found`);

    await this.dataSource.query(`DELETE FROM cases WHERE id = $1`, [id]);
    return { deleted: true, id };
  }


  async getStats(params: { diseaseType?: string; status?: string; from?: string; to?: string }) {
    const { diseaseType, status, from, to } = params;

    const where: string[] = [];
    const values: any[] = [];

    if (diseaseType) {
      values.push(diseaseType);
      where.push(`c.disease_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`c.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Tổng quan
    const [summary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total_cases,
        COUNT(*) FILTER (WHERE c.region_id IS NOT NULL)::int AS matched_region,
        COUNT(*) FILTER (WHERE COALESCE(c.severity, 1) >= 3)::int AS high_severity,
        COUNT(*) FILTER (WHERE COALESCE(c.severity, 1) = 2)::int AS medium_severity,
        COUNT(*) FILTER (WHERE COALESCE(c.severity, 1) <= 1)::int AS low_severity,
        MIN(c.reported_time) AS min_time,
        MAX(c.reported_time) AS max_time
      FROM cases c
      ${whereSql};
      `,
      values,
    );

    // Top tỉnh
    const topRegions = await this.dataSource.query(
      `
      SELECT r.id, r."TinhThanh" AS name, COUNT(*)::int AS total
      FROM cases c
      JOIN regions r ON r.id = c.region_id
      ${whereSql}
      GROUP BY r.id, r."TinhThanh"
      ORDER BY total DESC
      LIMIT 10;
      `,
      values,
    );

    // Theo ngày (time series)
    const byDay = await this.dataSource.query(
      `
      SELECT
        date_trunc('day', c.reported_time)::date AS day,
        COUNT(*)::int AS total
      FROM cases c
      ${whereSql}
      GROUP BY day
      ORDER BY day ASC;
      `,
      values,
    );

    // Theo disease_type
    const byDisease = await this.dataSource.query(
      `
      SELECT c.disease_type, COUNT(*)::int AS total
      FROM cases c
      ${whereSql}
      GROUP BY c.disease_type
      ORDER BY total DESC;
      `,
      values,
    );

    // Theo status
    const byStatus = await this.dataSource.query(
      `
      SELECT c.status, COUNT(*)::int AS total
      FROM cases c
      ${whereSql}
      GROUP BY c.status
      ORDER BY total DESC;
      `,
      values,
    );

    // Theo tháng (monthly trend)
    const byMonth = await this.dataSource.query(
      `
      SELECT
        date_trunc('month', c.reported_time)::date AS month,
        COUNT(*)::int AS total
      FROM cases c
      ${whereSql}
      GROUP BY month
      ORDER BY month ASC;
      `,
      values,
    );

    // Theo tuần (weekly trend - last 12 weeks)
    const byWeek = await this.dataSource.query(
      `
      SELECT
        date_trunc('week', c.reported_time)::date AS week,
        COUNT(*)::int AS total
      FROM cases c
      ${whereSql}
      GROUP BY week
      ORDER BY week DESC
      LIMIT 12;
      `,
      values,
    );

    // So sánh với kỳ trước (comparison)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [comparison] = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE c.reported_time >= $1)::int AS current_period,
        COUNT(*) FILTER (WHERE c.reported_time >= $2 AND c.reported_time < $1)::int AS previous_period
      FROM cases c
      `,
      [thirtyDaysAgo.toISOString(), sixtyDaysAgo.toISOString()],
    );

    return { summary, topRegions, byDay, byDisease, byStatus, byMonth, byWeek: byWeek.reverse(), comparison };
  }

  /**
   * Get grid-based density data for risk visualization
   * Uses PostGIS to aggregate cases into grid cells
   */
  async getGridDensity(params: {
    diseaseType?: string;
    status?: string;
    from?: string;
    to?: string;
    gridSize?: number; // Grid cell size in degrees (default 0.1 ~ 11km)
    bounds?: { north: number; south: number; east: number; west: number };
  }) {
    const { diseaseType, status, from, to, gridSize = 0.1, bounds } = params;

    const where: string[] = [];
    const values: any[] = [];

    if (diseaseType) {
      values.push(diseaseType);
      where.push(`c.disease_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`c.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }

    // Optional bounds filter
    if (bounds) {
      values.push(bounds.west, bounds.south, bounds.east, bounds.north);
      where.push(`ST_X(c.geom::geometry) >= $${values.length - 3}`);
      where.push(`ST_Y(c.geom::geometry) >= $${values.length - 2}`);
      where.push(`ST_X(c.geom::geometry) <= $${values.length - 1}`);
      where.push(`ST_Y(c.geom::geometry) <= $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Grid size parameter
    values.push(gridSize);
    const gridSizeParam = `$${values.length}`;

    // Use PostGIS snap-to-grid for aggregation
    const rows = await this.dataSource.query(
      `
      WITH grid_cases AS (
        SELECT
          c.id,
          c.disease_type,
          c.status,
          COALESCE(c.severity, 1) AS severity,
          FLOOR(ST_X(c.geom::geometry) / ${gridSizeParam}) * ${gridSizeParam} AS grid_x,
          FLOOR(ST_Y(c.geom::geometry) / ${gridSizeParam}) * ${gridSizeParam} AS grid_y
        FROM cases c
        ${whereSql}
      )
      SELECT
        grid_x,
        grid_y,
        COUNT(*)::int AS count,
        SUM(severity)::int AS total_severity,
        ROUND(AVG(severity)::numeric, 2)::float AS avg_severity,
        MAX(severity)::int AS max_severity,
        ARRAY_AGG(DISTINCT disease_type) AS diseases,
        ARRAY_AGG(DISTINCT status) AS statuses,
        jsonb_object_agg(
          disease_type,
          COALESCE(disease_counts.cnt, 0)
        ) AS disease_breakdown
      FROM grid_cases g
      LEFT JOIN LATERAL (
        SELECT disease_type AS dt, COUNT(*)::int AS cnt
        FROM grid_cases g2
        WHERE g2.grid_x = g.grid_x AND g2.grid_y = g.grid_y
        GROUP BY disease_type
      ) disease_counts ON TRUE
      GROUP BY grid_x, grid_y
      ORDER BY count DESC
      `,
      values,
    );

    // Alternative simpler query if the above has issues
    const simplifiedRows = await this.dataSource.query(
      `
      WITH grid_cases AS (
        SELECT
          c.id,
          c.disease_type,
          c.status,
          COALESCE(c.severity, 1) AS severity,
          FLOOR(ST_X(c.geom::geometry) / ${gridSizeParam}) * ${gridSizeParam} AS grid_x,
          FLOOR(ST_Y(c.geom::geometry) / ${gridSizeParam}) * ${gridSizeParam} AS grid_y
        FROM cases c
        ${whereSql}
      )
      SELECT
        grid_x,
        grid_y,
        COUNT(*)::int AS count,
        SUM(severity)::int AS total_severity,
        ROUND(AVG(severity)::numeric, 2)::float AS avg_severity,
        MAX(severity)::int AS max_severity,
        ARRAY_AGG(DISTINCT disease_type) AS diseases,
        ARRAY_AGG(DISTINCT status) AS statuses
      FROM grid_cases
      GROUP BY grid_x, grid_y
      ORDER BY count DESC
      `,
      values,
    );

    // Calculate risk levels based on count and severity
    const processedGrid = simplifiedRows.map((cell: any) => {
      const riskScore = cell.count * (cell.avg_severity || 1);
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      
      if (riskScore >= 15 || cell.count >= 10) {
        riskLevel = 'critical';
      } else if (riskScore >= 8 || cell.count >= 5) {
        riskLevel = 'high';
      } else if (riskScore >= 3 || cell.count >= 2) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'low';
      }

      return {
        bounds: {
          south: cell.grid_y,
          west: cell.grid_x,
          north: cell.grid_y + gridSize,
          east: cell.grid_x + gridSize,
        },
        count: cell.count,
        totalSeverity: cell.total_severity,
        avgSeverity: cell.avg_severity,
        maxSeverity: cell.max_severity,
        diseases: cell.diseases,
        statuses: cell.statuses,
        riskScore,
        riskLevel,
      };
    });

    return {
      gridSize,
      totalCells: processedGrid.length,
      cells: processedGrid,
      stats: {
        totalCases: processedGrid.reduce((sum: number, c: any) => sum + c.count, 0),
        criticalCells: processedGrid.filter((c: any) => c.riskLevel === 'critical').length,
        highCells: processedGrid.filter((c: any) => c.riskLevel === 'high').length,
        mediumCells: processedGrid.filter((c: any) => c.riskLevel === 'medium').length,
        lowCells: processedGrid.filter((c: any) => c.riskLevel === 'low').length,
      },
    };
  }

  /**
   * Get clustered cases for proper severity visualization
   * Uses PostGIS clustering to group nearby cases
   */
  async getClusteredCases(params: {
    diseaseType?: string;
    status?: string;
    from?: string;
    to?: string;
    clusterDistance?: number; // Distance in degrees for clustering (default 0.05 ~ 5km)
  }) {
    const { diseaseType, status, from, to, clusterDistance = 0.05 } = params;

    const where: string[] = [];
    const values: any[] = [];

    if (diseaseType) {
      values.push(diseaseType);
      where.push(`c.disease_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`c.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    values.push(clusterDistance);
    const distParam = `$${values.length}`;

    // Use ST_ClusterDBSCAN for spatial clustering
    const clusters = await this.dataSource.query(
      `
      WITH clustered AS (
        SELECT
          c.id,
          c.disease_type,
          c.status,
          COALESCE(c.severity, 1) AS severity,
          c.geom,
          c.reported_time,
          ST_ClusterDBSCAN(c.geom::geometry, eps := ${distParam}, minpoints := 1) OVER () AS cluster_id
        FROM cases c
        ${whereSql}
      )
      SELECT
        cluster_id,
        COUNT(*)::int AS count,
        ST_X(ST_Centroid(ST_Collect(geom::geometry)))::float AS center_lon,
        ST_Y(ST_Centroid(ST_Collect(geom::geometry)))::float AS center_lat,
        SUM(severity)::int AS total_severity,
        ROUND(AVG(severity)::numeric, 2)::float AS avg_severity,
        MAX(severity)::int AS max_severity,
        ARRAY_AGG(DISTINCT disease_type) AS diseases,
        ARRAY_AGG(DISTINCT status) AS statuses,
        MIN(reported_time) AS earliest_case,
        MAX(reported_time) AS latest_case
      FROM clustered
      GROUP BY cluster_id
      ORDER BY count DESC
      `,
      values,
    );

    // Calculate cluster severity based on count and individual severities
    const processedClusters = clusters.map((cluster: any) => {
      // Combined severity considers both count and average severity
      const combinedScore = cluster.count * (cluster.avg_severity || 1);
      let clusterSeverity: number;
      
      if (combinedScore >= 15 || cluster.max_severity >= 3) {
        clusterSeverity = 3; // High
      } else if (combinedScore >= 5 || cluster.avg_severity >= 2) {
        clusterSeverity = 2; // Medium
      } else {
        clusterSeverity = 1; // Low
      }

      return {
        id: cluster.cluster_id,
        count: cluster.count,
        center: {
          lat: cluster.center_lat,
          lon: cluster.center_lon,
        },
        severity: {
          total: cluster.total_severity,
          average: cluster.avg_severity,
          max: cluster.max_severity,
          combined: clusterSeverity,
        },
        diseases: cluster.diseases,
        statuses: cluster.statuses,
        timeRange: {
          earliest: cluster.earliest_case,
          latest: cluster.latest_case,
        },
      };
    });

    return {
      clusterDistance,
      totalClusters: processedClusters.length,
      totalCases: processedClusters.reduce((sum: number, c: any) => sum + c.count, 0),
      clusters: processedClusters,
    };
  }

  /**
   * Reverse geocode coordinates to get address (commune, district, province)
   * First tries to match with local regions database for province, then uses Nominatim for full address
   */
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
    let regionId: number | undefined;
    let provinceName: string | undefined;

    // First, try to find matching region in our database (only has province level)
    try {
      const regionResult = await this.dataSource.query(
        `
        SELECT 
          r.id,
          r."TinhThanh" AS province
        FROM regions r
        WHERE ST_Within(
          ST_SetSRID(ST_MakePoint($1, $2), 4326),
          r.geom
        )
        LIMIT 1
        `,
        [lon, lat],
      );

      if (regionResult.length > 0) {
        regionId = regionResult[0].id;
        provinceName = regionResult[0].province;
      }
    } catch (error) {
      console.error('Database region lookup failed:', error);
    }

    // Use Nominatim (OpenStreetMap) for detailed reverse geocoding
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=vi`,
        {
          headers: {
            'User-Agent': 'SafeZone/1.0',
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const addr = data.address || {};
        
        // Extract Vietnamese administrative divisions
        const commune = addr.village || addr.suburb || addr.quarter || addr.hamlet;
        const district = addr.county || addr.city_district || addr.town || addr.municipality;
        const province = provinceName || addr.state || addr.province || addr.city;

        const parts = [commune, district, province].filter(Boolean);
        
        return {
          address: parts.length > 0 ? parts.join(', ') : (data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`),
          commune,
          district,
          province,
          regionId,
        };
      }
    } catch (error) {
      console.error('Nominatim reverse geocode failed:', error);
    }

    // Final fallback: return coordinates as address with province if available
    return {
      address: provinceName || `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      province: provinceName,
      regionId,
    };
  }
}
