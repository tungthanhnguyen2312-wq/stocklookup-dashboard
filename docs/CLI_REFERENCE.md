# CLI Reference

> **Tài liệu lịch sử — không phải cách dùng Dashboard hiện nay.** Trang này mô tả pipeline cục bộ VNSTOCK trước đây; việc thu thập trực tiếp qua vnstock đã ngừng và dữ liệu hiện do hệ thống nghiên cứu riêng (Producer) phát hành. Để dùng Stock Lookup, chỉ cần mở <https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/>. Các lệnh bên dưới được giữ làm bằng chứng lịch sử và có thể không còn chạy được.


> Toàn bộ lệnh chạy các script backend + web publish, thứ tự và lịch chạy khuyến nghị.
> Tách ra từ README ngày 12/07/2026. Xem [ARCHITECTURE.md](ARCHITECTURE.md) cho vai trò từng
> script, [DATA_PIPELINE.md](DATA_PIPELINE.md) cho các bẫy dữ liệu cần biết khi dùng output.

**Mục lục:** [Cheatsheet](#cheatsheet) · [Lịch chạy](#lịch-chạy--thời-điểm-số-lần-thứ-tự) · [Thứ tự trong ngày](#thứ-tự-trong-ngày-quan-trọng) · [Tự động hóa](#tự-động-hóa-tùy-chọn--windows-task-scheduler) · [Đẩy web lên GitHub Pages](#đẩy-web-lên-github-pages) · [Sự cố thường gặp](#sự-cố-thường-gặp)

---

## Cheatsheet

> **Cú pháp:** ví dụ dưới dùng PowerShell (`python .\script.py`) — copy-paste chạy thẳng.
> Dùng CMD hoặc Linux/macOS? Xem [USER_GUIDE.md § Ghi chú đa nền tảng](USER_GUIDE.md#ghi-chú-đa-nền-tảng-tùy-chọn).

```powershell
# Cài 1 lần
Set-Location <dashboard-repository>
pip install -r requirements.txt
python -c "from vnstock import vnai; vnai.setup_api_key('KEY_CUA_BAN')"

# Lần đầu (lặp backfill tới khi Còn lại = 0)
python .\vn_stock_pipeline.py universe
python .\vn_stock_pipeline.py backfill
python .\vn_stock_pipeline.py status
python .\vn_stock_pipeline.py backfill failed
python .\vn_stock_pipeline.py export
python .\meta_sync.py                  # ~2-2.5 giờ, tự resume nếu đứt
python .\macro_sync.py --full          # lấy 10 năm lịch sử Yahoo
python .\macro_sync.py --export-web-only # chỉ sinh lại JSON/JS từ DB local, không gọi mạng
python .\vn_indicators.py

# HẰNG NGÀY (sau 15h) — ĐÚNG THỨ TỰ NÀY
python .\vn_stock_pipeline.py update
python .\macro_sync.py
python .\news_sync.py
python .\vn_indicators.py
python .\candle_scan.py                # mẫu nến 1D/1W/1M + SMC + cổ tức + heatmap — cục bộ, 0 API
python .\candle_scan.py --limit 20     # smoke test; vẫn luôn kèm watchlist
# tùy chỉnh: --pattern-lookback-1d 90 --pattern-lookback-1w 78 --pattern-lookback-1m 36
#             --pattern-min-confidence 40 --pattern-max-results 3 --pattern-workers 4
# rồi mở Excel bấm Data > Refresh All; dashboard: mở dashboard.html (mở thẳng file được, đã có fallback; index.html chỉ redirect sang đây)

# HẰNG TUẦN (thêm vào trước vn_indicators.py)
python .\blacklist_sync.py
python .\meta_sync.py --blacklist-only

# HẰNG THÁNG (hoặc ngay sau mùa ĐHCĐ, quanh Q2)
python .\shareholders_sync.py          # cào cổ đông lớn toàn universe (~45-50 phút, tự resume)
python .\shareholders_sync.py --status # xem tiến độ, 0 request

# HẰNG QUÝ
python .\meta_sync.py --refresh        # cào lại toàn bộ metadata gồm cả dividend_yield (~2-2.5 giờ)
# + tự cập nhật tay danh sách CẮT MARGIN từ hsx.vn/hnx.vn vào blacklist.csv
python .\bctc_sync.py scrape --file tickers_bctc.txt --refresh   # BCTC quý mới (FINANCIAL_REPORT.md)
python .\bctc_processor.py                                       # -> financial_snapshot.csv/.parquet

# MỘT LẦN DUY NHẤT (backfill cổ tức cho DB hiện tại, 1 request/mã ~45 phút, tự resume)
python .\meta_sync.py --ratio-only

# PHÂN TÍCH OFFLINE — MIỄN PHÍ, 0 request (đọc kho local, ~2 giây, xem STOCK_ANALYZER.md)
python .\stock_analyzer.py --strategy all      # 10 chiến lược + chấm điểm 0-100 -> analysis_latest.json/.md
python .\stock_analyzer.py --tickers HPG SSI   # phân tích sâu từng mã -> Focus_Analysis.md
python .\stock_analyzer.py --scan-market       # gems / red flags / FTSE -> Market_Scan.md + .csv
python .\stock_analyzer.py --selftest          # test hồi quy trên fixture (tests/) — chạy sau khi sửa code

# KHI THẬT SỰ CẦN — ⚠️ TỐN PHÍ API (~$0,10-0,15 ≈ 2.500-4.000đ MỖI LẦN CHẠY)
python .\ai_analyzer.py --dry-run      # xem trước dữ liệu sẽ gửi đi — MIỄN PHÍ
python .\ai_analyzer.py                # gọi Claude sinh báo cáo -> ai_report_YYYYMMDD.md

# ĐẨY DASHBOARD LÊN GITHUB PAGES (repo: tungthanhnguyen2312-wq/market-dashboard)
python .\publish_dashboard.py          # dry-run mặc định: chỉ in danh sách file SẼ đẩy
python .\publish_dashboard.py --live   # đẩy thật — whitelist tự bóc từ html/js, không bao giờ add file nặng
```

## Lịch chạy — thời điểm, số lần, thứ tự

| # | File | Thời điểm chạy | Số lần | Mất bao lâu | Ghi chú |
|---|---|---|---|---|---|
| 1 | `vn_stock_pipeline.py update` | Sau **15h** (VN đóng cửa) | 1 lần/ngày | ~30-45 phút | Chạy trước 15h sẽ thiếu nến hôm nay |
| 2 | `macro_sync.py` | Sáng (sau ~7h, Mỹ đã đóng cửa) HOẶC gộp sau 15h | 1 lần/ngày | <1 phút | Cập nhật bảng `macro`, CSV local và tự sinh JSON/JS cho trang Macro |
| 3 | `news_sync.py` | Bất kỳ | **2-3 lần/ngày** (RSS chỉ giữ 10-60 tin gần nhất, chạy thưa là mất tin) | <1 phút | Chạy bao nhiêu lần cũng không trùng tin |
| 4 | `blacklist_sync.py` → `meta_sync.py --blacklist-only` | Đầu tuần hoặc trước phiên lọc quan trọng | 1 lần/**tuần** | ~1 phút | 34 request, rẻ |
| 5 | `meta_sync.py --refresh` | Sau mùa BCTC (giữa T1/T4/T7/T10) | 1 lần/**quý** | ~2-2.5 giờ | Tự resume nếu đứt mạng; PE/PB/ROE đổi chậm, chạy dày hơn là phí request |
| 6 | `blacklist.csv` (nhập tay) | Khi HOSE/HNX ra danh sách cắt margin quý | 1 lần/**quý** | 10 phút tay | Thêm dòng note KHÔNG bắt đầu bằng "Auto:" |
| 7 | `vn_indicators.py` | **Cuối cùng**, sau khi 1-2 (và 4 nếu có) xong | 1 lần/ngày | ~2 phút | Mixer — chạy sớm hơn là snapshot thiếu dữ liệu mới |
| 8 | `vn_stock_pipeline.py export` | Chỉ khi cần cập nhật `ohlcv_flat.parquet` gửi AI/backtest | khi cần | ~2 phút | Không cần chạy hằng ngày |
| 9 | `ai_analyzer.py` | SAU khi 1→7 xong (số liệu mới nhất), khi thật sự cần đọc báo cáo | **1-2 lần/TUẦN, ĐỪNG chạy hằng ngày** | ~1 phút | ⚠️ **TỐN PHÍ ~$0,10-0,15/lần**. `--dry-run` miễn phí |
| 10 | `candle_scan.py` | Sau `update` giá + `vn_indicators` (cần snapshot mới) | hằng ngày nếu muốn | xem log runtime thực tế | Một query lịch sử, 0 request; giữ `ta_signals.*` và sinh thêm `data/candlestick_patterns.json/.js` cho đúng 1D/1W/1M |
| 11 | `shareholders_sync.py` | Bất kỳ, không phụ thuộc chuỗi giá | 1 lần/**tháng**, hoặc ngay sau mùa ĐHCĐ (quanh Q2) | ~45-50 phút (full 1.683 mã) | Cơ cấu cổ đông đổi CHẬM — chạy dày hơn là phí request. Ghi bảng `shareholders` + `shareholders_progress`, KHÔNG đụng `metadata`. `--tickers`/`--limit` để test, `--resume` chỉ thử lại mã lỗi mạng, `--status` xem tiến độ (0 request) |

**Nhịp khuyến nghị cho dòng 9** (tránh tốn tiền oan): mặc định **chiều thứ 6 sau phiên** — 1 báo cáo tổng kết tuần + kế hoạch tuần mới là đủ dùng. Chạy thêm 1 lần giữa tuần CHỈ KHI thị trường biến động mạnh (VNINDEX ±2%/phiên, tin vĩ mô lớn) hoặc trước quyết định mua/bán quan trọng. So sánh tiền: chạy hằng ngày ≈ $3/tháng (~80.000đ) trong khi 90% nội dung lặp lại; chạy 1-2 lần/tuần ≈ $1/tháng (~26.000đ) mà không mất thông tin gì.

## Thứ tự trong ngày (quan trọng)

```
15h00+  vn_stock_pipeline.py update      # 1. GIÁ trước
        macro_sync.py                    # 2. vĩ mô (nếu chưa chạy buổi sáng)
        news_sync.py                     # 3. tin tức
        vn_indicators.py                 # 4. mixer CUỐI CÙNG (trộn tất cả vào snapshot)
        candle_scan.py                   # 5. (tùy chọn) tín hiệu nến + data/ cho web
        → mở screener.xlsx → Data → Refresh All
        → publish_dashboard.py --live    # nếu muốn cập nhật web
```

Lý do thứ tự: `vn_indicators.py` đọc `ohlcv` + `metadata` để trộn ra `screen_snapshot.csv` + `market_breadth.csv` — chạy nó trước khi cập nhật giá thì snapshot là số của hôm qua. `macro_sync`/`news_sync` độc lập với mixer nhưng nên xong trước để cả bộ dữ liệu cùng một lần chạy. `macro_sync.py` tự sinh `data/macro_snapshot.json` + `.js`; không có bước copy thủ công riêng.

`ai_analyzer.py` **cố tình KHÔNG nằm trong chuỗi hằng ngày** — nó là bước tốn phí, chạy tay theo nhịp ở bảng trên.

## Tự động hóa (tùy chọn — Windows Task Scheduler)

Tạo 2-3 task: **(a)** 15h15 hằng ngày chạy chuỗi trên bằng file `.bat`; **(b)** 9h/12h/18h chạy `news_sync.py`; **(c)** nếu muốn tự đẩy web, thêm task cho `publish_dashboard.py --live`:

```
Program/script : C:\Program Files\Python313\python.exe
Add arguments  : "<dashboard-repository>\publish_dashboard.py" --live
Start in       : <dashboard-repository>
Trigger        : Daily, đặt SAU giờ pipeline xong (pipeline chạy 15h15 mất ~45 phút
                 → publish 16h30 là an toàn), hoặc gọi ở DÒNG CUỐI file .bat pipeline
                 để bảo đảm tuần tự tuyệt đối.
```

Lưu ý: máy phải bật; script nào lỗi mạng cũng tự retry nên `.bat` cứ chạy tuần tự là được. **TUYỆT ĐỐI không đưa `ai_analyzer.py` vào Task Scheduler** — đó là đốt tiền API ngầm hằng ngày mà không ai đọc; báo cáo AI luôn bấm tay.

## Đẩy web lên GitHub Pages

**Cách hiện hành — `publish_dashboard.py`** (thay thế `sync_and_push.bat` từ 11/07/2026):

```powershell
Set-Location <dashboard-repository>
python .\publish_dashboard.py          # DRY-RUN (mặc định): chỉ in danh sách file SẼ đẩy
python .\publish_dashboard.py --live   # add/commit/push thật
```

Nguyên tắc sắt của script:
- Whitelist add được **bóc tự động** từ các trang `.html` (`loadData`/`loadCsv`/`fetch` + `<script src>` + `<link href>` css cục bộ) và chuỗi `.csv/.json/.md` trong `app.js` — **không bao giờ** `git add .` / `git add -A`, không `push -f`.
- Không có thay đổi trong whitelist → DỪNG, không tạo commit rỗng.
- Mọi lệnh git bọc try/except, lỗi ghi vào `publish_log.txt`, không crash.
- OneDrive sync nền có thể gây lỗi `index.lock` → script tự chờ 3 giây thử lại 1 lần.
- Hai artifact Macro public nằm trong allowlist tường minh: `data/macro_snapshot.json` và `data/macro_snapshot.js`. `macro_snapshot.csv`, `vn_stock.db`, script Python, config và log vẫn bị chặn.
- Hai artifact mẫu nến public cũng nằm trong allowlist tường minh: `data/candlestick_patterns.json` và `.js`; OHLCV thô và database không được publish.

**Quy trình cập nhật web hằng ngày:**
1. Chạy chuỗi backend (mục trên): update → macro → news → indicators → candle_scan.
2. Nếu có báo cáo AI mới: copy `ai_report_YYYYMMDD.md/.json` mới nhất thành `ai_report_latest.md/.json`.
3. `python .\publish_dashboard.py --live` → push lên `main` → Dashboard CI → Deploy Pages.
   Deploy Pages workflow SUCCESS includes deployment + cache-busted public byte verification.

> ⚠️ `sync_and_push.bat` cũ dùng `git add .` — giờ chỉ nên dùng nó cho bước copy dữ liệu; việc push để `publish_dashboard.py` lo.

### Thêm báo cáo HTML cũ vào kho lưu trữ

1. Copy file `.html` vào thư mục gốc (whitelist của publish tự nhận mọi `.html` ở gốc).
2. Mở `assets/js/archive.js`, thêm một phần tử `{ file, title, date }` vào mảng `ARCHIVE_ITEMS`.
3. Chạy `python .\publish_dashboard.py --live`.

### Xem thử ở máy local

- **Mở thẳng `dashboard.html` hoặc `macro.html` (file://) vẫn chạy được** nhờ fallback `data/*.js`; qua HTTP/GitHub Pages trang ưu tiên fetch JSON với `cache: no-store`.
- Muốn đầy đủ 100% (báo cáo AI + bảng CSV) thì chạy web server rồi mở `http://localhost:8000`:

```bash
Set-Location <dashboard-repository>
python -m http.server 8000
```

## Sự cố thường gặp

- **Khu vực báo cáo/bảng báo "Chưa tải được..."** → thiếu file dữ liệu (`ai_report_latest.*` / `screen_snapshot.csv` chưa được copy/sinh ra), hoặc đang mở `file://` mà phần đó cần fetch — chạy qua web server ở trên.
- **`publish_dashboard.py` báo lỗi git** → kiểm tra remote `origin` còn trỏ đúng repo không (`git remote -v`); lỗi `index.lock` lặp lại thường do OneDrive đang sync — chờ rồi chạy lại.
- **GitHub Pages không đổi sau khi push** → Deploy Pages SUCCESS includes deployment + cache-busted public byte verification. Nếu job đó FAIL, origin công khai chưa khớp byte với commit đã deploy. Hard-refresh (Ctrl+F5) chỉ sau khi Deploy Pages xanh.
- **PowerShell báo "không nhận diện lệnh"** khi gõ tên script mà thiếu `python` phía trước — xem [USER_GUIDE.md](USER_GUIDE.md#️-lỗi-thường-gặp-powershell-báo-không-nhận-diện-lệnh).

---

*Xem thêm: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_PIPELINE.md](DATA_PIPELINE.md) · [FINANCIAL_REPORT.md](FINANCIAL_REPORT.md) · [STOCK_ANALYZER.md](STOCK_ANALYZER.md)*
