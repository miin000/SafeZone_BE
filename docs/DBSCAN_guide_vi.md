# Giới thiệu thuật toán DBSCAN (chi tiết) cho dự án SafeZone

Tài liệu này giải thích DBSCAN từ nền tảng lý thuyết đến cách đã triển khai trong SafeZone, kèm các đoạn code trọng yếu để dễ đọc, dễ mở rộng và dễ bảo trì.

## 1. DBSCAN là gì?

DBSCAN (Density-Based Spatial Clustering of Applications with Noise) là thuật toán gom cụm dựa trên mật độ điểm.

Khác với các thuật toán cần định trước số cụm (ví dụ K-Means), DBSCAN:
- Không cần biết trước số cụm.
- Tìm được cụm có hình dạng bất kỳ.
- Tự nhiên phát hiện outlier/noise.

DBSCAN phù hợp với bài toán bản đồ dịch tễ như SafeZone, vì ca bệnh thường phân bố theo "cụm nóng" không đều và có nhiều điểm lẻ.

---

## 2. Định nghĩa cốt lõi

DBSCAN dùng 2 tham số:
- eps: bán kính lân cận (mức gần nhau).
- minPoints: số điểm tối thiểu trong eps để được xem là đủ dày.

Với mỗi điểm $p$:

$$
N_{eps}(p) = \{q \mid dist(p, q) \le eps\}
$$

### 2.1 3 loại điểm

1. Core point:
- $|N_{eps}(p)| \ge minPoints$

2. Border point:
- Không đủ điều kiện core, nhưng nằm trong lân cận của 1 core point

3. Noise point:
- Không phải core và cũng không thuộc vùng mở rộng của cụm nào

---

## 3. Trực giác trong bài toán dịch tễ

- Cụm dày đặc nhiều ca bệnh gần nhau -> được gom thành 1 ổ dịch/cụm dịch.
- Các ca lẻ tách biệt -> noise.
- Nếu 1 điểm nặng (severity cao) nhưng chỉ có 1 mình -> không nên tự động làm cả cụm thành "mức độ cao".

Do đó trong SafeZone:
- DBSCAN dùng để xác định cấu trúc không gian (mật độ).
- Severity dùng để đánh giá tác động y tế bổ sung cho cụm.

---

## 4. Luồng dữ liệu DBSCAN trong SafeZone

### 4.1 Backend API

Endpoint:
- `GET /gis/clusters`

Tham số chính:
- `clusterDistanceKm`: eps theo km (dễ dùng hơn cho nghiệp vụ)
- `minPoints`: ngưỡng mật độ
- `includeNoise`: trả về danh sách noise points
- các filter khác: `diseaseType`, `status`, `from`, `to`

### 4.2 Frontend Admin

Chế độ map:
- `clusters_dbscan`

UI có:
- chọn eps (km)
- chọn minPoints
- bật/tắt hiện noise points

Layer hiển thị:
- Cụm: CircleMarker tại tâm cụm, màu theo mức độ cụm, radius theo số ca
- Noise: marker xám, có tooltip và popup khi click

---

## 5. Đoạn code trọng yếu (backend)

File: `src/gis/gis.service.ts`

### 5.1 Chạy DBSCAN bằng PostGIS

```ts
ST_ClusterDBSCAN(
  f.geom::geometry,
  eps := ${distParam},
  minpoints := ${minPointsParam}
) OVER () AS cluster_id
```

Ý nghĩa:
- PostGIS tự gán `cluster_id` cho từng điểm theo DBSCAN.
- Điểm nào không thuộc cụm sẽ có `cluster_id IS NULL` (noise).

### 5.2 Phân loại core/border/noise

```ts
CASE
  WHEN a.cluster_id IS NULL THEN 'noise'
  WHEN n.neighbor_count >= ${minPointsParam} THEN 'core'
  ELSE 'border'
END AS point_type
```

Trong đó `neighbor_count` được tính bằng `ST_DWithin(...)` trong bán kính eps.

### 5.3 Tổng hợp thông tin cụm

```sql
SELECT
  cluster_id,
  COUNT(*)::int AS count,
  ST_X(ST_Centroid(ST_Collect(geom::geometry)))::float AS center_lon,
  ST_Y(ST_Centroid(ST_Collect(geom::geometry)))::float AS center_lat,
  SUM(severity)::int AS total_severity,
  ROUND(AVG(severity)::numeric, 2)::float AS avg_severity,
  MAX(severity)::int AS max_severity,
  COUNT(*) FILTER (WHERE point_type = 'core')::int AS core_count,
  COUNT(*) FILTER (WHERE point_type = 'border')::int AS border_count
FROM classified
WHERE cluster_id IS NOT NULL
GROUP BY cluster_id
```

### 5.4 Tính mức độ cụm (đã chỉnh theo hướng density-first)

Mục tiêu:
- Cụm nhỏ, ít điểm không bị đội mức chỉ vì có 1 ca severity cao.
- Không dùng max severity để ép cụm lên mức cao.

```ts
const count = Number(cluster.count || 0);
const avgSeverity = Number(cluster.avg_severity || 1);
const coreCount = Number(cluster.core_count || 0);

// Density score: count (primary) + core ratio (secondary)
const countScore = Math.min(3, count / 4);
const coreRatio = count > 0 ? coreCount / count : 0;
const coreRatioScore = Math.min(3, 1 + coreRatio * 2);
const densityScore = 0.7 * countScore + 0.3 * coreRatioScore;

// Clinical score: average severity (not max severity)
const clinicalScore = Math.min(3, Math.max(1, avgSeverity));

// Final score is density-first
const severityScore = 0.75 * densityScore + 0.25 * clinicalScore;

let clusterSeverity: number;
if (count >= 8 && severityScore >= 2.35) {
  clusterSeverity = 3; // High
} else if (count >= 3 && severityScore >= 1.6) {
  clusterSeverity = 2; // Medium
} else {
  clusterSeverity = 1; // Low
}
```

Kết luận:
- Số điểm trong cụm và độ "dày" (core ratio) là quyết định chính.
- Severity trung bình chỉ là yếu tố bổ sung.

---

## 6. Đoạn code trọng yếu (frontend)

### 6.1 Layer hiển thị cụm và noise

File: `src/components/map/DBSCANClusterLayer.tsx`

Cụm:
- CircleMarker theo tâm cụm
- Màu theo `cluster.severity.combined`
- Radius theo `count`

Noise:
- Marker xám
- Có `Tooltip`
- Có `Popup`
- Có click handler mở popup trực tiếp

```tsx
<CircleMarker
  key={`noise-${point.id}`}
  center={[point.lat, point.lon]}
  radius={6}
  bubblingMouseEvents={false}
  eventHandlers={{
    click: (e) => {
      e.target.openPopup();
    },
  }}
  pathOptions={{
    color: '#111827',
    weight: 1,
    fillColor: '#9ca3af',
    fillOpacity: 0.85,
  }}
>
  <Tooltip>...</Tooltip>
  <Popup>...</Popup>
</CircleMarker>
```

### 6.2 Chuyển mode map

File: `src/components/map/MapLayerControl.tsx`

```ts
{ value: 'clusters_dbscan', icon: '🧩', label: 'DBSCAN Clusters', labelVi: 'Cụm DBSCAN' }
```

### 6.3 Truyền tham số DBSCAN từ dashboard

File: `src/app/(map)/MapDashboardNew.tsx`

- State:
  - `dbscanEpsKm`
  - `dbscanMinPoints`
  - `dbscanIncludeNoise`
- Gọi API với query params tương ứng

---

## 7. Cách chọn tham số DBSCAN trong thực tế

### 7.1 minPoints

Gợi ý ban đầu trong SafeZone:
- 4 đến 6 cho mức nhạy vừa phải
- 8+ nếu muốn chỉ bắt cụm thật dày

### 7.2 eps (km)

Gợi ý theo quy mô:
- Đô thị dày đặc: 1-3 km
- Thành phố lớn: 3-5 km
- Vùng dân cư thưa: 5-10 km

Nếu eps quá nhỏ:
- Nhiều noise
- Cụm bị vỡ vụn

Nếu eps quá lớn:
- Cụm bị gộp quá mức
- Mất ý nghĩa ổ dịch địa phương

---

## 8. So sánh DBSCAN với K-Means

## 8.1 So sánh nhanh

| Tiêu chí | DBSCAN | K-Means |
|---|---|---|
| Cần biết trước số cụm | Không | Có (phải chọn trước K) |
| Phát hiện noise/outlier | Tốt (tự nhiên) | Kém (mọi điểm đều bị ép vào cụm) |
| Hình dạng cụm | Linh hoạt, bất kỳ | Thường ưu tiên cụm "tròn" |
| Nhạy với thang đo | Có | Có |
| Nhạy với tham số | eps, minPoints | K, khởi tạo tâm cụm |
| Dữ liệu mật độ không đều | Có thể khó | Cũng khó |
| Ý nghĩa dịch tễ không gian | Phù hợp hơn | Dễ lệch khi ép cụm |

## 8.2 Ví dụ trực giác trong SafeZone

Giả sử có 3 ca bệnh:
- 2 ca nằm gần nhau trong cùng khu phố.
- 1 ca nằm rất xa, đơn lẻ.

Với K-Means:
- Ca đơn lẻ vẫn bị ép vào một cụm nào đó.
- Có thể làm sai trực giác nghiệp vụ (trông như vẫn thuộc ổ dịch).

Với DBSCAN:
- 2 ca gần nhau có thể thành cụm nếu đủ điều kiện mật độ.
- Ca đơn lẻ có thể trở thành noise point.
- Kết quả gần với thực tế giám sát ổ dịch hơn.

## 8.3 Khi nào nên dùng thuật toán nào?

Dùng DBSCAN khi:
- Cần nhận diện ổ dịch không gian và noise points.
- Không biết trước số cụm.
- Cụm có thể méo, kéo dài theo trục đường/khu dân cư.

Dùng K-Means khi:
- Bài toán buộc phải chia thành đúng K nhóm quản trị.
- Dữ liệu tương đối "gọn" và ít outlier.
- Mục tiêu là phân khúc đều, không ưu tiên phát hiện noise.

## 8.4 Kết luận cho dự án SafeZone

Với dữ liệu ca bệnh theo tọa độ, DBSCAN phù hợp hơn K-Means cho lớp bản đồ dịch tễ vì:
- Giữ được các điểm lẻ dưới dạng noise.
- Không ép mọi ca vào cụm.
- Thể hiện đúng các vùng mật độ cao bất thường.

K-Means vẫn có thể dùng bổ trợ cho các báo cáo quản trị (ví dụ cần chia đúng K vùng vận hành), nhưng không nên thay DBSCAN cho lớp "phát hiện ổ dịch".

---

## 9. Độ phức tạp và hiệu năng

DBSCAN thường tốn chi phí ở bước tìm lân cận.
Với PostGIS + index không gian tốt (GIST/SP-GiST), truy vấn sẽ ổn hơn nhiều so với tính toán thủ công toàn bộ cặp điểm.

Khi dữ liệu lớn:
- Nên lọc theo thời gian (`from/to`) trước
- Nên lọc theo disease/status khi cần phân tích theo ngành
- Cân nhắc cấp theo viewport map để giảm tải

---

## 10. Trường hợp nghiệp vụ cần lưu ý

1. Cụm nhỏ nhưng severity cao:
- Không nên mặc định high cluster
- Đã được khắc phục bằng density-first score

2. Nhiều noise points:
- Có thể do eps nhỏ hoặc minPoints cao
- Không phải lúc nào cũng là "sai"

3. Dữ liệu không đồng đều theo khu vực:
- 1 bộ eps/minPoints toàn quốc có thể không tối ưu
- Có thể cần tham số theo tỉnh/vùng

---

## 11. Đề xuất mở rộng tiếp theo

1. Thêm API profile tham số DBSCAN theo vùng
- ví dụ: nội thành, ngoại thành, nông thôn

2. Thêm endpoint đánh giá chất lượng cụm
- tỉ lệ core, silhouette xấp xỉ theo không gian

3. Thêm cơ chế tự động đề xuất eps/minPoints
- dựa trên lịch sử dữ liệu 30 ngày gần nhất

4. Hiển thị confidence trên UI
- high/medium/low confidence cho từng cụm

---

## 12. Tóm tắt ngắn

- DBSCAN trong SafeZone dùng để tìm cụm dịch theo mật độ không gian.
- Noise points là điểm lẻ không đủ mật độ.
- Mức độ cụm hiện tại đã được sửa để ưu tiên density, tránh tình trạng 1 điểm severe cao làm cả cụm bị đẩy mức.
- Frontend đã có mode DBSCAN riêng, popup cụm/noise và tham số tuning từ giao diện.
