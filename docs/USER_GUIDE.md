# User Guide — Bắt đầu với Stock Look Up

> **Tài liệu lịch sử — không phải cách dùng Dashboard hiện nay.** Trang này mô tả pipeline cục bộ VNSTOCK trước đây; việc thu thập trực tiếp qua vnstock đã ngừng và dữ liệu hiện do hệ thống nghiên cứu riêng (Producer) phát hành. Để dùng Stock Lookup, chỉ cần mở <https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/>. Các lệnh bên dưới được giữ làm bằng chứng lịch sử và có thể không còn chạy được.


> Hướng dẫn setup lần đầu + các lỗi thường gặp khi mới chạy. Tách ra từ README ngày
> 12/07/2026. Muốn xem toàn bộ lệnh hằng ngày/tuần/tháng → [CLI_REFERENCE.md](CLI_REFERENCE.md).

**Mục lục:** [Quick Start](#quick-start-windows) · [Lỗi PowerShell thường gặp](#️-lỗi-thường-gặp-powershell-báo-không-nhận-diện-lệnh) · [Ghi chú đa nền tảng](#ghi-chú-đa-nền-tảng-tùy-chọn) · [Phụ lục thuật ngữ](#phụ-lục--đọc-hiểu-báo-cáo-ai-thuật-ngữ)

---

## Quick Start (Windows)

> Mọi lệnh dưới đây dùng cú pháp **PowerShell** (`python .\script.py`) — script đứng cùng thư
> mục nên luôn chạy được nguyên văn, copy-paste là chạy.

**Lần đầu setup (chạy 1 lần, xem đầy đủ ở [CLI_REFERENCE.md](CLI_REFERENCE.md#cheatsheet)):**

```powershell
cd VNSTOCK
pip install -r requirements.txt
python -c "from vnstock import vnai; vnai.setup_api_key('KEY_CUA_BAN')"
python .\vn_stock_pipeline.py universe
python .\vn_stock_pipeline.py backfill
python .\meta_sync.py
python .\macro_sync.py --full
python .\vn_indicators.py
```

**Quy trình hằng ngày (chạy sau 15h, đúng thứ tự — xem đầy đủ ở [CLI_REFERENCE.md](CLI_REFERENCE.md#thứ-tự-trong-ngày-quan-trọng)):**

```powershell
cd VNSTOCK
python .\vn_stock_pipeline.py update
python .\macro_sync.py
python .\news_sync.py
python .\vn_indicators.py
python .\stock_analyzer.py --strategy all
python .\publish_dashboard.py
```

Muốn setup nhánh BCTC (báo cáo tài chính quý)? Xem [FINANCIAL_REPORT.md](FINANCIAL_REPORT.md).

## ⚠️ Lỗi thường gặp: PowerShell báo "không nhận diện lệnh"

Gõ tên script mà không có `python` phía trước sẽ báo lỗi kiểu:

```
vn_stock_pipeline.py : The term 'vn_stock_pipeline.py' is not recognized as the name of a
cmdlet, function, script file, or operable program. Check the spelling of the name...
```

**Nguyên nhân:** PowerShell (và CMD) không tự biết mở file `.py` bằng chương trình nào —
gõ thẳng tên file dù đứng đúng thư mục (`vn_stock_pipeline.py update`) **hoặc** thêm `.\`
mà thiếu `python` (`.\vn_stock_pipeline.py update`) đều bị từ chối như nhau.

**Cách sửa — LUÔN có `python` đứng trước tên file:**

| ❌ Sai (PowerShell từ chối) | ✅ Đúng |
|---|---|
| `vn_stock_pipeline.py update` | `python .\vn_stock_pipeline.py update` |
| `.\vn_stock_pipeline.py update` | `python .\vn_stock_pipeline.py update` |

Lưu ý kỹ thuật: `python .\script.py` và `python script.py` (không có `.\`) chạy **giống hệt
nhau** một khi đã có `python` phía trước — `.\` chỉ là cách ghi tường minh "file nằm trong
thư mục hiện tại", không bắt buộc, không phải nguyên nhân gây lỗi.

**Kiểm tra `python` đã cài & vào PATH chưa:**

```powershell
Set-Location <dashboard-repository>
python --version
```

Nếu dòng này cũng báo "not recognized" → cài Python tại
[python.org/downloads](https://www.python.org/downloads/), nhớ tick **"Add python.exe to PATH"**
lúc cài, rồi mở cửa sổ PowerShell **mới** (cửa sổ đang mở không tự nhận PATH vừa đổi).

## Ghi chú đa nền tảng (tùy chọn)

Repo này vận hành chính trên **Windows** (đường dẫn tuyệt đối, Task Scheduler, OneDrive),
nhưng bản thân các lệnh Python thì chạy giống nhau mọi nơi:

| Shell | Cú pháp | Ghi chú |
|---|---|---|
| **PowerShell** (mặc định) | `python .\script.py` | |
| **CMD** | `python .\script.py` hoặc `python script.py` | cả 2 đều chạy được |
| **Linux/macOS (bash/zsh)** | `python script.py` (bỏ `.\`) | dùng `python3` nếu hệ thống chưa alias `python` |

2 chỗ **thật sự** khác nhau theo hệ điều hành (không chỉ là cách gõ):
- **Biến môi trường API key** ([DATA_PIPELINE.md § Tiền](DATA_PIPELINE.md#tiền--ai_analyzerpy)):
  Windows dùng `setx ANTHROPIC_API_KEY "..."`; Linux/macOS dùng `export ANTHROPIC_API_KEY="..."`
  (thêm vào `~/.bashrc`/`~/.zshrc` để giữ lâu dài qua các phiên terminal).
- **Tự động hóa hằng ngày** ([CLI_REFERENCE.md § Tự động hóa](CLI_REFERENCE.md#tự-động-hóa-tùy-chọn--windows-task-scheduler)):
  Windows dùng Task Scheduler; Linux/macOS dùng `cron` — repo chưa có cấu hình cron sẵn.

## Phụ lục — Đọc hiểu báo cáo AI (thuật ngữ)

| Thuật ngữ | Nghĩa ngắn gọn |
|---|---|
| **Regime** (BULL/NEUTRAL/BEAR) | Chế độ thị trường. NEUTRAL = chưa đủ mạnh để mua quyết liệt, chưa xấu để bán hết — giữ tỷ trọng vừa phải, không all-in. |
| **Market Breadth** | Độ rộng thị trường. VNINDEX tăng không có nghĩa đa số mã tăng — VD chỉ 31,5% mã trên MA200 = phần lớn vẫn yếu, chỉ số bị vài trụ (VIC, VHM, VCB) kéo. |
| **avg_ret_1m âm** | Lợi nhuận trung bình toàn thị trường 1 tháng âm dù chỉ số tăng → dòng tiền chỉ tập trung vào số ít cổ phiếu. |
| **GTGD20** | Giá trị giao dịch trung bình 20 phiên — cao = thanh khoản tốt, có dòng tiền lớn tham gia. |
| **VIX** | "Chỉ số sợ hãi" — VIX tăng → nhà đầu tư toàn cầu giảm rủi ro (bán cổ phiếu, mua USD/trái phiếu). |
| **DXY** | Sức mạnh USD — USD mạnh thường gây áp lực rút vốn khỏi thị trường mới nổi như VN. |
| **RS (Relative Strength)** | RS 98 = mạnh hơn ~98% cổ phiếu khác. Càng cao càng mạnh so với thị trường. |
| **SMC (Smart Money Concept)** | Ưu tiên mua gần vùng giá thấp (discount) — VD giá cách swing low ~4% thì rủi ro thấp hơn; không mua khi đã tăng quá cao. |
| **Mua thăm dò** | Mở vị thế nhỏ kiểm tra thị trường, chỉ tăng tỷ trọng khi xu hướng xác nhận tiếp. |
| **Chờ setup** | Yếu tố cơ bản tốt nhưng kỹ thuật chưa xác nhận (VD PE thấp + tin hỗ trợ nhưng cấu trúc vẫn giảm) — chờ. |
| **Tránh** | Không mua chỉ vì giá tăng mạnh (VD tăng gần 10% nhưng PE rất cao, ROE thấp, xu hướng xấu). |

Báo cáo kết hợp: vĩ mô + breadth + RS + CANSLIM + SMC + phân tích ngành + quản trị rủi ro —
đưa ra đánh giá tổng thể và kế hoạch hành động, kèm phân loại tin tức Positive/Negative/Mixed.

---

*Dữ liệu sinh tự động, chỉ mang tính tham khảo — không phải khuyến nghị đầu tư.*

*Xem thêm: [ARCHITECTURE.md](ARCHITECTURE.md) · [CLI_REFERENCE.md](CLI_REFERENCE.md) · [DATA_PIPELINE.md](DATA_PIPELINE.md)*
