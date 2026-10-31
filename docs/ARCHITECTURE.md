# Kiến trúc hệ thống

> Tài liệu này mô tả kiến trúc tổng thể của Stock Look Up: 2 nửa Backend/Frontend, luồng dữ liệu,
> các tầng dữ liệu, và ranh giới rõ ràng giữa những gì chạy **local** và những gì lên
> **GitHub Pages**. Tách ra từ README ngày 12/07/2026 khi dọn repo cho bản public.

**Mục lục:** [Tổng quan](#tổng-quan) · [Sơ đồ luồng dữ liệu](#sơ-đồ-luồng-dữ-liệu) · [Nhánh BCTC](#nhánh-bctc) · [Các tầng dữ liệu](#các-tầng-dữ-liệu) · [Local ↔ Web: cái gì được đẩy](#từ-máy-local-lên-web--cái-gì-được-đẩy-cái-gì-không) · [File trong repo web](#file-trong-repo-web)

---

## Tổng quan

### Product surfaces hiện hành (2026-09-01)

`data/investment_decision_workspace.json` là projection Workspace do Producer tạo và publish;
frontend chỉ validate/render, không tự tính lại research state. Đây là nguồn hiện hành cho tóm
tắt Home, Analysis, Tactical Signals, liên kết từ Screener, Workspace detail và ngữ cảnh
Portfolio. Mỗi record giữ research stance, tactical state, confirmation boundary tách với actual
trigger state, invalidation, valuation method, catalyst/downside, liquidity research proxy và
freshness. Không có score tổng hợp, xếp hạng, target price, xác suất, sizing hay lệnh thực hiện.
Candlestick/sector artifacts là sidecar legacy tùy chọn, không thay thế Workspace khi thiếu.

`publish_dashboard.py` thuộc Producer private là publisher duy nhất: nó kiểm tra schema,
session, producer identity, denominator và zero-silent-drop của projection trước khi copy atomic
vào Dashboard. Repository này chỉ là target static, không phát sinh quyền publish.

**Ranh giới công khai hiện nay:** website và mã nguồn trong repository này là công khai. Hệ thống tạo dữ
liệu (Producer) và phần nghiên cứu AI (Consumer) là hạ tầng riêng tư, không được phát hành tại đây. Phần
"Backend" và sơ đồ luồng dữ liệu bên dưới mô tả pipeline cục bộ VNSTOCK trước đây và được giữ làm thông tin
kỹ thuật lịch sử; chúng không phải mô tả hệ thống tạo dữ liệu hiện hành.

Hệ thống (giai đoạn VNSTOCK, lịch sử) gồm 2 nửa:

**Backend (local, không lên GitHub)** — 7 chân kiềng quanh kho `vn_stock.db` (hiện **1.686 mã**, ~1,9 triệu dòng giá + metadata + macro + news + cổ đông):

| Chân kiềng | Script | Ghi chú |
|---|---|---|
| Giá OHLCV | `vn_stock_pipeline.py` | update hằng ngày sau 15h |
| Metadata cơ bản + luật | `meta_sync.py`, `blacklist_sync.py` | PE/PB/ROE, room ngoại, án margin |
| Mixer chỉ báo + mẫu nến | `vn_indicators.py`, `candle_scan.py` | trộn tất cả ra snapshot + tín hiệu |
| Vĩ mô | `macro_sync.py` | Fed, US10Y, DXY, dầu, vàng, VIX, tỷ giá, CPI/GDP |
| Tin tức | `news_sync.py` | RSS thế giới + VN |
| Cổ đông lớn | `shareholders_sync.py` | bảng `shareholders`/`shareholders_progress`, 1 lần/tháng |
| Báo cáo AI | `ai_analyzer.py` | ⚠️ chân **duy nhất TỐN PHÍ** — xem [DATA_PIPELINE.md §Tiền](DATA_PIPELINE.md#tiền--ai_analyzerpy) |

**Frontend (GitHub Pages)** — terminal tĩnh (sidebar + top bar dùng chung, khung `assets/`), không cần build, thư viện load qua CDN:
- `dashboard.html` — trang chính: báo cáo AI + KPI + watchlist + bảng thị trường (`index.html` chỉ redirect sang đây để giữ URL gốc).
- `screener.html` — bảng lọc đầy đủ, có panel chi tiết mã (`company-panel.js`).
- `analysis.html` — bảng research đa trục từ Workspace hiện hành; `analysis_latest.json` chỉ là legacy artifact, không phải nguồn render chính.
- `signals.html` — Tactical V2 từ Workspace, hiển thị setup/confirmation/actual-trigger/invalidation; candle/SMC là sidecar tùy chọn.
- `investment-workspace.html` — chi tiết Workspace theo ticker, bao gồm deep link từ Analysis/Screener/Signals.
- `portfolio.html` — editor dữ liệu portfolio local, giữ ranh giới portfolio fit khác với security stance.
- `shadow-recommendations.html` — read-only shadow research stance table and security detail, backed by a compact serialized projection; it does not create trade controls or recommendation policy.
- `macro.html` — dashboard vĩ mô đọc web snapshot đã chuẩn hóa; `about.html`, `archive.html` — giới thiệu dự án và kho báo cáo tĩnh.

## Sơ đồ luồng dữ liệu

```
[BACKEND — local]                                      [FRONTEND — GitHub Pages]

vn_stock_pipeline / meta_sync / macro_sync / news_sync / shareholders_sync
        │ ghi vào
        ▼
   vn_stock.db ──► vn_indicators.py ──► screen_snapshot.csv + market_breadth.csv ─┐
              └──► macro_sync.py ──► data/macro_snapshot.json + .js ──────────────┤
              └──► candle_scan.py  ──► ta_signals.* + candle_signals.* ──────────┤
                                      + candlestick_patterns.json/.js (1D/1W/1M) ┤
   ai_analyzer.py ──► ai_report_YYYYMMDD.md/.json ──► ai_report_latest.md/.json ──┤
                                                                                  ▼
                                              python publish_dashboard.py --live
                                              (whitelist tự bóc, không git add .)
                                                                                  ▼
                                              git push ──► Dashboard CI ──► Deploy Pages
                                              (deploy + cache-busted public byte verification)
```

## Nhánh BCTC

Độc lập với 7 chân kiềng trên, tần suất **quý** thay vì ngày, gộp vào VNSTOCK từ dự án
`FINANCIAL_REPORT` riêng (12/07/2026). KHÔNG ghi vào `vn_stock.db`, KHÔNG lên GitHub Pages —
chi tiết đầy đủ ở [FINANCIAL_REPORT.md](FINANCIAL_REPORT.md).

```
[NHÁNH BCTC — local, tần suất QUÝ, KHÔNG lên web]

bctc_sync.py ──► data_bctc/*.parquet+*.csv ──► bctc_processor.py ──► financial_snapshot.csv/.parquet
 (cào BCTC thô,      (BCĐK/KQKD/LCTT,             (chuẩn hóa item_id +      (gitignore — KHÔNG nằm
  KBS/VCI failover)    ~650+ mã)                    audit công thức)          trong whitelist publish)
```

> *Dữ liệu sinh tự động, chỉ mang tính tham khảo — **không phải khuyến nghị đầu tư**.*

## Các tầng dữ liệu

Đừng trộn lẫn các tầng dữ liệu sau (nguồn phổ biến của bug khi thêm tính năng mới):

| Tầng | File | Vai trò |
|---|---|---|
| **Kho** | `vn_stock.db` (172 MB) | Lưu trữ gốc, script ghi vào. Không mở tay, không gửi AI. Bảng: `ohlcv` (giá) · `meta` (tiến độ backfill — ĐỪNG nhầm với metadata) · `metadata` (cơ bản+luật) · `macro` · `news` |
| **Truyền tải** | `screen_snapshot.csv` / `market_breadth.csv` / `macro_snapshot.csv` / `news_latest.csv` / `ohlcv_flat.parquet` / `financial_snapshot.csv` / `.parquet` | Script xuất ra. Gửi AI phân tích + Excel link tới. `financial_snapshot.*` ra theo **quý** (nhánh BCTC), không cập nhật hằng ngày như các file khác trong dòng này. |
| **Nhập tay** | `blacklist.csv` | 2 lớp: dòng Auto (máy tái sinh — đừng sửa) + dòng tay (margin_cut theo quý — máy giữ nguyên, thắng khi trùng mã). |
| **Báo cáo AI** | `ai_report_YYYYMMDD.md` / `.json` | `ai_analyzer.py` sinh qua API Claude — **TỐN PHÍ mỗi lần chạy**. `ai_prompt_preview.txt` là bản xem trước miễn phí (`--dry-run`). |
| **Phân tích offline** | `analysis_latest.json` / `.md` + bảng `watchlist_history` trong DB | `stock_analyzer.py` sinh — MIỄN PHÍ, 0 request. Xem [STOCK_ANALYZER.md](STOCK_ANALYZER.md). |
| **Web** | `data/*.json` + `data/*.js`, `ai_report_latest.md/.json` | `candle_scan.py` giữ output legacy và sinh riêng `candlestick_patterns.json/.js` từ cùng một object; `macro_sync.py` sinh `macro_snapshot.json/.js`; `ai_report_latest.*` phục vụ `dashboard.html`. |
| **Xem** | `screener.xlsx` | Chỉ *link* tới file truyền tải + filter/sort. **Không chứa** data. |

Nguyên tắc: dữ liệu nằm im trong parquet/db; Excel chỉ trỏ tới, nên workbook luôn nhẹ.

## Từ máy local lên web — cái gì được đẩy, cái gì không

- **Được đẩy** (whitelist `publish_dashboard.py` tự bóc từ web references, cộng artifact đã duyệt tay): mọi trang `.html` ở gốc, css/js được tham chiếu, `screen_snapshot.csv`, `market_breadth.csv`, `ai_report_latest.*`, hai artifact vĩ mô và `data/candlestick_patterns.json/.js`.
- **KHÔNG bao giờ lên remote** (2 lớp phòng thủ: publish chỉ add theo tên file cụ thể — không bao giờ `git add .` / `git add -A` / `push -f`; cộng `.gitignore` chặn hộ khi lỡ add tay): `vn_stock.db`, `*.parquet`, `ohlcv_flat.csv`, toàn bộ `*.py`, `blacklist.csv`, `tickers.txt`, `ai_report_2*.md/.json` (bản cá nhân có ngày), `ai_prompt_preview.txt`, `news_latest.csv`, `macro_snapshot.csv`, `ta_signals.*`, `*.xlsx`, `logs/`, `publish_log.txt`, `data_bctc/`, `financial_snapshot.csv`, `financial_snapshot.parquet`, `tickers_bctc.txt`, `config.json`, internal qualification evidence (outside this repository).
- `data/*.json` dùng khi web chạy qua HTTP/GitHub Pages; file `.js` cùng tên là fallback cho `file://`. Với Macro, `macro_sync.py` serialize một object duy nhất rồi ghi nguyên tử cả hai file để schema không lệch và không để lại JSON dở dang.
- `ai_report_latest.md/.json`: sau khi chạy `ai_analyzer.py`, copy bản `ai_report_YYYYMMDD.*` mới nhất đè lên tên `_latest`. **Không sửa tay** file `_latest`.

## File trong repo web

| File | Vai trò |
|---|---|
| `index.html` | CHỈ redirect (`meta refresh` + `location.replace`) sang `dashboard.html` — giữ nguyên URL gốc GitHub Pages, không còn chứa nội dung |
| `dashboard.html` | Trang chính: báo cáo AI + KPI + watchlist + bảng thị trường + lối tắt kho lưu trữ |
| `screener.html` | Bảng lọc SMC/nến đầy đủ (đọc `data/screener_data.*` + CSV) + panel chi tiết mã khi bấm vào dòng |
| `analysis.html` + `analysis.js` | Workspace research đa trục: fetch `data/investment_decision_workspace.json`, filter bản sao projection, deep link ticker sang Workspace; không dùng score/rank legacy làm corpus chính |
| `signals.html` + `assets/js/signals-product.js` | Tactical V2 từ Workspace: stance, tactical/entry state, setup tags, confirmation boundary, actual trigger state, invalidation, market/sector, liquidity/freshness; candle sidecars là optional |
| `investment-workspace.html` + `assets/js/investment-workspace.js` | Chi tiết decision Workspace; nhận `?ticker=HPG` hoặc hash ticker và vẫn giữ contract filter/detail hiện hữu |
| `portfolio.html` + `portfolio.js` | Portfolio local editor hiện hữu; UI không biến portfolio availability thành security stance hay execution instruction |
| `shadow-recommendations.html` + `assets/js/shadow-recommendations.js` | Surface nghiên cứu stance/readiness; chỉ render Producer/Consumer serialized contracts, với trạng thái unavailable rõ ràng khi packet/narrative không được gắn. |
| `assets/js/candlestick-patterns.js` + `assets/css/candlestick-patterns.css` | Loader/validation/render và layout responsive riêng cho bảng mẫu nến |
| `data/candlestick_patterns.json` + `.js` | Snapshot schema v1: 1D/1W/1M, lịch sử gần đây, trạng thái, confidence, confirmations/warnings; không chứa OHLCV thô/path local |
| `macro.html` + `assets/js/macro.js` | Dashboard vĩ mô: ưu tiên fetch JSON, fallback `window.MACRO_SNAPSHOT`; chỉ vẽ chart khi chuỗi có ít nhất hai điểm |
| `assets/css/macro.css` | Layout responsive riêng của Macro, dùng lại token/card/badge từ design system chung |
| `data/macro_snapshot.json` + `.js` | Snapshot public đã chuẩn hóa; không chứa DB path, SQL, credential hoặc log nội bộ |
| `about.html` | Giới thiệu dự án, tech stack, liên kết |
| `archive.html` + `assets/js/archive.js` | Kho lưu trữ báo cáo tĩnh — danh sách ghi tay trong `archive.js` (GitHub Pages không có API liệt kê thư mục) |
| `app.js` | Logic trang chính: marked.js render `ai_report_latest.md`, PapaParse + DataTables cho bảng, `COLUMN_LABELS` Việt hóa 31 tên cột |
| `style.css` | Design system dark mode bằng CSS variables — dùng chung mọi trang |
| `assets/css/shell.css` + `assets/js/shell.js` | Khung sườn dùng chung (sidebar/top bar): CSS + hành vi (toggle mobile, active-link, thu gọn sidebar) cho cả 7 trang |
| `assets/js/resizable-panels.js` | Kéo giãn tỷ lệ cột nội dung chính/phụ (`dashboard.html`, `analysis.html`) |
| `assets/js/company-panel.js` | Panel trượt chi tiết mã dùng chung cho dòng Screener và mẫu hình nến |
| `nav.css` | **Legacy** — chỉ còn dùng bởi báo cáo tĩnh lưu trữ (`playbook-*.html`, `report-*.html`), không dùng ở 7 trang chính (đã thay bằng `assets/css/shell.css`) |
| `publish_dashboard.py` | Script đẩy web an toàn (dry-run mặc định, whitelist tự bóc) — *chỉ nằm local, gitignore `*.py`* |
| `sync_and_push.bat` | **Legacy** — chỉ còn dùng bước copy `ai_report_latest`; phần git đã bị `publish_dashboard.py` thay thế |
| `ai_report_latest.md/.json` | Báo cáo AI mới nhất (bản copy, **không sửa tay**) |
| `screen_snapshot.csv` | Snapshot thị trường (~1.500 mã) |
| `data/` | `candle_signals` / `candlestick_patterns` / `sector_heatmap` / `screener_data` dạng `.json` (fetch) + `.js` (fallback file://) |
| `playbook-*.html`, `report-*.html`, `vn*.html` | Báo cáo HTML tĩnh cũ, link ở kho lưu trữ (`archive.html`) |

Thư viện frontend load qua CDN (Bootstrap 5, Tailwind CDN chỉ cho khung sườn — tắt Preflight để không xung đột với Bootstrap, jQuery, DataTables, PapaParse, marked.js, Chart.js, Lucide Icons) — không cần build, không cần cài đặt gì.

### Quy ước UI (giữ khi sửa giao diện)

- Dark mode theo palette CSS variables trong `:root` (`style.css`): nền `#0F172A`, card `#1E293B`, border `#334155`, chữ `#F8FAFC`, phụ `#94A3B8`, primary `#3B82F6`, success `#22C55E`, warning `#F59E0B`, danger `#EF4444` — đổi theme chỉ sửa một chỗ. Font Inter, số dùng `tabular-nums`.
- **Các ID mà `app.js` phụ thuộc, KHÔNG đổi tên:** `ai-report`, `report-date`, `last-updated`, `filter-exchange`, `filter-industry`, `market-table`, `table-status`.
- **Khung sườn dùng chung**: mỗi trang khai `<body data-page="...">` + link sidebar khai `data-nav="..."` — `shell.js` dựa vào 2 attribute này để tô sáng trang hiện tại, KHÔNG đổi tên/xoá. Bảng DataTables style qua class dùng chung `.vs-datatable` (không phải id riêng như `#market-table` trước đây) để áp được cho mọi bảng trong site.
- Layout 2 cột co giãn dùng `data-resizable` + `data-resize-key="..."` (đọc bởi `resizable-panels.js`) — key phải riêng biệt mỗi trang vì state lưu chung trong `localStorage`.
- Escape HTML mọi dữ liệu động trước khi chèn DOM (chống vỡ layout/XSS từ dữ liệu).
- Tên cột hiển thị tiếng Việt qua `COLUMN_LABELS` trong `app.js` — field gốc CSV giữ nguyên nên lọc/sort không đổi. Giá đóng cửa định dạng `15.400`, ngày `dd/mm/yyyy`.
- Lịch sử refactor chi tiết: xem [CHANGELOG_UI.md](../CHANGELOG_UI.md).

---

*Xem thêm: [CLI_REFERENCE.md](CLI_REFERENCE.md) · [DATA_PIPELINE.md](DATA_PIPELINE.md) · [USER_GUIDE.md](USER_GUIDE.md)*
