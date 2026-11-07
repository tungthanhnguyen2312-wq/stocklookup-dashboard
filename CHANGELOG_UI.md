# CHANGELOG UI — Refactor giao diện toàn dự án

## Cập nhật 2026-11-07 — Hai lăng kính, kỳ BCTC và cơ sở P/B (PR #29)

- Cơ hội: khi nhãn kỹ thuật tích cực (vd. Sẵn sàng bứt phá → Mở vị thế khi xác nhận) nằm dưới
  Quyết định tích hợp không tích cực (vd. Tránh), thẻ nêu rõ lăng kính nào là quyết định chính,
  mức kích hoạt chưa thỏa, điều kiện thay đổi nhận định và mức vô hiệu; gắn nhãn Không phải tín hiệu mua.
- Cơ bản & định giá: luôn hiện kỳ BCTC dùng trong phân tích; “Đạt chuẩn chính thức” là thẩm quyền nguồn,
  không phải độ mới; liệt kê kỳ chính thức mới hơn đã được chấp nhận (chỉ là bối cảnh).
- P/B nghiên cứu: nêu mẫu số (tổng vốn chủ sở hữu gồm lợi ích CĐ không kiểm soát), kỳ sổ sách và độ trễ.

## Cập nhật 2026-10-07 — Giao diện ưu tiên nhà đầu tư V1

Milestone: `INVESTOR_FIRST_DASHBOARD_UX_AND_LANGUAGE_CONVERGENCE_V1`.

- Điều hướng chính thống nhất: Tổng quan, Cơ hội, Danh mục, Vĩ mô, Lịch sử.
  Bàn quyết định đổi tên hiển thị thành Cơ hội; đường dẫn kỹ thuật giữ nguyên.
  Bộ lọc, Tín hiệu và Phân tích tiếp tục chuyển đến chế độ xem tương ứng,
  giữ mã, tham số và liên kết neo. Giới thiệu trở thành điều hướng phụ.
- Tổng quan còn nhịp thị trường, nhóm ngành, cổ phiếu đáng xem và rủi ro.
  Loại bỏ nút mở Cơ hội lặp lại, bộ lọc tương thích, báo cáo AI dài,
  kế hoạch hành động và thẻ quảng bá lịch sử khỏi trang chủ.
- Phân bố quyết định, phạm vi dữ liệu, thanh khoản tham khảo và giới hạn
  thực hiện lệnh nằm trong Dữ liệu & phương pháp, thu gọn mặc định.
- Cơ hội có Nổi bật, Khám phá (gồm phân tích đa trục), Kỹ thuật, Theo dõi,
  Danh mục. Dải chẩn đoán thị trường chuyển vào phương pháp; thẻ nổi bật
  chỉ xuất hiện ở chế độ Nổi bật. Trên điện thoại, danh sách mã hiển thị dạng
  thẻ có trạng thái, quan điểm, kích hoạt, vô hiệu và dữ liệu thiếu.
- Hợp đồng `VIETNAMESE_INVESTOR_FIRST`: Việt hóa điều khiển danh mục,
  thông báo lỗi và thuật ngữ bản dữ liệu. Giữ các viết tắt tài chính chuẩn.
  Trang Giới thiệu giải thích công dụng, cách đọc, giới hạn trước phương pháp.
- Bổ sung kiểm thử thuật ngữ, điều hướng, chuyển hướng thật, chọn mã và
  đối chiếu giá trị với baseline cho toàn bộ 1.683 mã. Tab dùng phím mũi tên;
  giữ Escape và khôi phục focus của ngăn chi tiết.
- Không sửa dữ liệu Daily, phép tính, chính sách hành động, định danh nguồn,
  schema hoặc thẩm quyền Producer. Danh sách đáng xem dùng đúng quy tắc
  chọn thẻ nổi bật đã có, không thêm điểm số hay xếp hạng.
- Thêm tham số phiên bản giao diện `ui=investor-first-v1` cho tài nguyên
  trang hiện hành; giữ nguyên `v` của bản dữ liệu và không sửa dữ liệu sinh sẵn.

Hợp đồng thiết kế hiện hành: [docs/INVESTOR_FIRST_UX_V1.md](docs/INVESTOR_FIRST_UX_V1.md).

## Cập nhật 2026-09-03 — Hợp nhất Phân tích vào Bàn quyết định (Unified Decision Workspace V2)

Tiếp nối đợt hội tụ trước (đã gộp Decision Cockpit vào Bàn quyết định): gộp nốt trang Phân tích đa trục
độc lập vào Bàn quyết định duy nhất, giảm điều hướng chính từ 8 xuống 7 mục.

- **Điều hướng chính còn 7 mục**: Tổng quan, Bộ lọc, Tín hiệu, Bàn quyết định, Danh mục, Vĩ mô, Giới thiệu
  — bỏ "Phân tích" khỏi điều hướng chính trên toàn bộ 8 trang sản phẩm và `assets/js/shell.js`.
- **`analysis.html` trở thành redirect tương thích** (cùng mẫu với `decision-cockpit.html` trước đây):
  chuyển hướng JS tức thì sang `investment-workspace.html?view=analysis`, bảo toàn `?ticker=` và hash qua
  `URLSearchParams`. Xóa `analysis.js` và `assets/js/analysis-product.js` (không còn nơi dùng) — bao gồm cả
  cơ chế `conflictReasons()` suy luận xung đột phía trình duyệt, không mang sang nơi khác.
- **Bàn quyết định có 3 chế độ xem nội bộ** (`?view=opportunities|analysis|watchlist`, mặc định
  `opportunities`), dùng chung một lần tải dữ liệu, một vũ trụ thẻ mã, một trạng thái mã đã chọn và một bộ
  lọc/tìm kiếm:
  - **Cơ hội**: bảng cơ hội rút gọn còn 5 cột (bỏ cột "Thao tác" — ô mã đã có sẵn nút mở chi tiết).
  - **Phân tích**: kế thừa vai trò trang Phân tích cũ nhưng còn ~6 cột (Mã/Tư thế/Cơ bản/Định giá/Kỹ
    thuật/Bằng chứng) thay vì bảng 10 cột cũ; cột Bằng chứng chỉ hiển thị bằng chứng thật từ Producer
    (lý do xác định + phản luận), không suy luận thêm.
  - **Theo dõi**: danh sách theo dõi (owner focus, không phải danh mục nắm giữ) chuyển từ khối tổng quan thị
    trường cũ sang thành một chế độ xem riêng.
- **Tổng quan thị trường** rút gọn thành dải KPI cô đọng luôn hiển thị (không còn khối lớn có thể thu gọn
  gộp chung với cohorts/watchlist). **Khám phá cơ hội theo nhóm (Cockpit cohorts)** — danh sách chip khổng lồ
  — bị loại bỏ hoàn toàn, thay bằng bộ lọc chip Bàn quyết định sẵn có (cùng vũ trụ thẻ mã duy nhất).
- **Một bề mặt chi tiết mã duy nhất trên màn hình**: "Thẻ quyết định" hiển thị trong trang trước đây nay chỉ
  còn phục vụ in ấn (`d-none d-print-block`), ngăn trượt bên phải là nơi tương tác duy nhất.
- **"Dữ liệu & phương pháp"**: hợp nhất khoảng trống dữ liệu, nội dung cần kiểm chứng, nguồn dữ liệu/bằng
  chứng và bối cảnh rủi ro danh mục tổng hợp vào một khối progressive disclosure thu gọn mặc định, thay cho
  3 thẻ độc lập trước đây.
- **Ngăn trượt chi tiết mã được tổ chức lại** theo tên thay vì chữ cái: Quyết định, Doanh nghiệp, Định giá,
  Kỹ thuật, Kích hoạt / Vô hiệu, Danh mục, Dữ liệu (progressive disclosure) — toàn bộ dữ liệu và cơ chế hiển
  thị giữ nguyên, chỉ đổi cách nhóm và tiêu đề.
- **Rút gọn cảnh báo**: đoạn cảnh báo lớn lặp lại thay bằng một dòng ngắn gọn cạnh tiêu đề, cộng với dòng
  disclaimer chân trang sẵn có.
- **Kiểm thử**: bổ sung `tests/unified-decision-workspace-v2.test.js` chứng minh hợp đồng kiến trúc (7 mục
  điều hướng, redirect bảo toàn tham số, 3 chế độ xem dùng chung dữ liệu, một bề mặt chi tiết duy nhất...);
  cập nhật các test hồi quy điều hướng/hội tụ đã có theo kiến trúc mới. Toàn bộ 225/227 test JS thuộc CI
  (2 skip có từ trước) và 83/83 test Python thuộc CI đều PASS.

## Cập nhật 2026-09-03 — Rà soát sửa lỗi hậu hội tụ (Post-Convergence Corrective Pass)

Sửa 9 lỗi trình bày/hợp đồng dữ liệu phát hiện qua audit độc lập trên bản hội tụ bên dưới, không đổi luồng UX:

- Ngăn `decision-cockpit.js` tự fetch/render khi được nạp lại làm thư viện hàm thuần cho Bàn quyết định (tránh ghi đè `#session-line`, `#ticker-select`, `location.hash`).
- Rủi ro danh mục nay xét đúng theo `status` hợp đồng thay vì `is_actionable` (trường này luôn `false` theo thiết kế, kể cả khi danh mục đã được cung cấp và đánh giá đầy đủ).
- Mã không xác định trong deep-link (`?ticker=` hoặc hash) không còn tự động mở HPG; hash tương thích cũ (`#lineage`, `#market-overview`...) không còn bị hiểu nhầm là mã.
- Hợp nhất tông màu ngữ nghĩa: Bàn quyết định và Cockpit dùng chung `getSemanticTone()` theo domain thay vì bộ quy tắc từ khóa cũ độc lập (từng khiến `TRIGGERED` luôn đỏ bất kể domain).
- Tách "Định giá nghiêm ngặt sẵn sàng" ra khỏi danh sách khoảng trống dữ liệu thiếu.
- Sửa nhãn "SHA-256" chỉ hiển thị khi có mã băm thật; nếu không chỉ có định danh thì ghi "Định danh thao tác/sản phẩm".
- Ô theo dõi thiếu context Cockpit không còn lấy nhầm trường từ thẻ Bàn quyết định.
- Sửa bản dịch `NOT_AUTHORITATIVE_ACTIVE_UNIVERSE` cho đúng nghĩa gốc (phạm vi vũ trụ hoạt động chưa authoritative, không phải mã không thuộc vũ trụ niêm yết).
- Khi phiên Cockpit lệch phiên Bàn quyết định, toàn bộ khối lấy dữ liệu từ Cockpit đều bị xóa/thay cảnh báo — trước đây bỏ sót 3 khối.

## Cập nhật 2026-09-03 — Hội tụ bề mặt sản phẩm Dashboard & Củng cố UX V1 (MARKET_DASHBOARD_PRODUCT_SURFACE_CONVERGENCE_AND_UX_HARDENING_V1)

- **Hợp nhất Bàn quyết định (Canonical Decision Surface Convergence)**:
  - Hợp nhất bề mặt quyết định từ `decision-cockpit.html` sang bề mặt chính thức duy nhất tại `investment-workspace.html` với tên hiển thị chuẩn hóa toàn diện: **BÀN QUYẾT ĐỊNH** (loại bỏ khái niệm phân mảnh "Không gian quyết định").
  - Thiết lập meta-refresh tức thì và Javascript redirect trên `decision-cockpit.html`, bảo lưu đầy đủ tham số tìm kiếm (`?ticker=XYZ`) và neo hash (`#lineage`).
  - Hợp nhất toàn bộ khối thông tin từ Cockpit vào Bàn quyết định: Tổng quan thị trường & Cảnh báo, Khám phá cơ hội theo nhóm (Cohorts) với cơ chế mở rộng/thu gọn (progressive disclosure cho nhóm >8 mã), Danh sách theo dõi (Watchlist), Rủi ro danh mục, Khoảng trống dữ liệu và Nguồn bằng chứng (Lineage).
  - Tinh gọn bảng cơ hội (Opportunity table) từ 11 cột xuống 6 cột cô đọng: `Mã`, `Ngành`, `Tư thế`, `Kỹ thuật`, `Định giá`, `Thao tác`.
  - Bổ sung ngăn trượt bên phải (Sliding Right Drawer `#decision-drawer`) xem thẻ quyết định 7 phần cho từng mã, hỗ trợ đồng bộ URL (`?ticker=XYZ`), phím Escape, click backdrop và bẫy/khôi phục tiêu điểm bàn phím.
- **Hợp đồng điều hướng chính thống (Canonical Navigation Contract)**:
  - Thống nhất thanh điều hướng trên toàn bộ 8 trang sản phẩm chính (`dashboard.html`, `screener.html`, `signals.html`, `analysis.html`, `investment-workspace.html`, `portfolio.html`, `macro.html`, `about.html`) với 8 điểm đến chuẩn hóa theo đúng thứ tự:
    1. `Tổng quan` (`dashboard.html`, `data-nav="dashboard"`)
    2. `Bộ lọc` (`screener.html`, `data-nav="screener"`)
    3. `Tín hiệu` (`signals.html`, `data-nav="signals"`)
    4. `Phân tích` (`analysis.html`, `data-nav="analysis"`)
    5. `Bàn quyết định` (`investment-workspace.html`, `data-nav="investment-workspace"`)
    6. `Danh mục` (`portfolio.html`, `data-nav="portfolio"`)
    7. `Vĩ mô` (`macro.html`, `data-nav="macro"`)
    8. `Giới thiệu` (`about.html`, `data-nav="about"`)
    và điểm đến tiện ích phụ `Lịch sử` (`archive.html`, `data-nav="archive"`).
  - Đồng nhất hoàn toàn nhãn hiển thị và trạng thái active giữa desktop topbar và mobile drawer.
- **Hệ thống màu sắc ngữ nghĩa (Semantic Tone Mapping Contract)**:
  - Thiết lập `SEMANTIC_TONES` tập trung trong `assets/js/value-format.js` với 5 nhóm tone: `constructive` (xanh), `watch` (vàng hổ phách), `adverse` (đỏ), `info` (xanh dương), `neutral` (xám).
  - Sửa lỗi hiển thị trạng thái `UNAVAILABLE`: chuyển từ màu đỏ `#fca5a5` (adverse) sang màu xám trung tính (`tone-neutral`, `bs-gray`), phản ánh khách quan trạng thái thiếu dữ liệu.
- **Trải nghiệm bảng biểu & Khả năng phản hồi (Responsive Tables)**:
  - Thêm cột dính bên trái (`.sticky-col`) cho cột Mã cổ phiếu trên các bảng Screener, Signals, Analysis và Workspace.
  - Bọc bảng trong các container cuộn ngang có giới hạn chiều cao và thuộc tính trợ năng (`tabindex="0"`, `aria-label`).
- **Sản phẩm hóa Trình biên tập Danh mục (`portfolio.html` & `portfolio.js`)**:
  - Việt hóa 100% các điều khiển form, nút bấm và tiêu đề bảng.
  - Thêm thanh trực quan hóa phân bổ tỷ trọng danh mục (weights allocation bar) khi có dữ liệu `explicit_weight`.
  - Thêm giải thích trung thực khi nhập khối lượng (`quantity-only`): tỷ trọng phân bổ đòi hỏi giá trị vốn hóa theo giá thị trường (mark-to-market).
  - Thêm cảnh báo `"Chưa có phân tích danh mục"` khi chưa có context đánh giá rủi ro liên hợp từ Producer.
- **Chuẩn hóa ngôn ngữ & Tinh gọn disclaimer**:
  - Loại bỏ hoàn toàn các chuỗi lệnh Python CLI nội bộ (`tools/run_...`, `--portfolio-input`) trên UI.
  - Chuẩn hóa thương hiệu thành **Stock Lookup** (loại bỏ biến thể có dấu cách `Stock Look Up`).
  - Tinh gọn footer disclaimer trên toàn bộ trang: *"Phục vụ nghiên cứu, không phải lệnh giao dịch. Dữ liệu và phân tích là bản snapshot phục vụ nghiên cứu độc lập."*
  - Viết lại toàn bộ trang `about.html` sang tiếng Việt mô tả luồng evidence-first, ý nghĩa các tư thế nghiên cứu và các giới hạn phương pháp luận.
  - Thay thế thuật ngữ nội bộ tại `macro.html` và `assets/js/macro.js`: "Pipeline sinh dữ liệu" &rarr; "Thời điểm tạo", "Pipeline tải" &rarr; "Cập nhật".
- **Kiểm thử hồi quy mở rộng**:
  - Cập nhật `tests/test_navigation_contract.py` theo hợp đồng 8 điểm đến chuẩn hóa.
  - Bổ sung bộ kiểm thử hồi quy `tests/product-surface-convergence-v1-regression.test.js` bao quát 16 tiêu chí từ A đến R. Toàn bộ 273 node tests và 48 python tests đều PASS.

---

## Cập nhật 2026-07-14 — Bảng mẫu hình nến

- `signals.html` có tab “Mẫu hình nến” nhưng giữ nguyên Watchlist, hợp lưu, cổ tức và heatmap trong tab Tổng quan.
- Thêm summary, 11 nhóm filter, sort, sticky table, trạng thái forming/completed bằng chữ, sao SVG có accessible label và điều hướng bàn phím.
- `assets/js/candlestick-patterns.js` ưu tiên JSON, fallback global JS khi `file://`, validate schema và escape toàn bộ chuỗi động; không hiện path/file/exception trên UI.
- Layout kiểm soát tràn ngang ở 375/768/1024/1440px, focus visible và reduced-motion; company panel được mở rộng thành API dùng chung với Screener.

---

## Cập nhật 2026-07-14 — Dashboard Vĩ mô

- Thay nội dung khung `macro.html` bằng dashboard dữ liệu pipeline: overview, tối đa 8 KPI thật, biểu đồ Chart.js chỉ khi đủ lịch sử, empty state khối ngoại và bảng toàn bộ chỉ báo.
- Thêm `assets/css/macro.css` và `assets/js/macro.js`; DOM động dùng `textContent`/node API, link nguồn được kiểm tra protocol và mở tab mới an toàn.
- Responsive tại 375/768/1024/1440px, bảng cuộn ngang trên mobile, canvas có mô tả truy cập, tôn trọng `prefers-reduced-motion`.
- Delta chỉ biểu diễn hướng tăng/giảm; không tự gắn diễn giải “tốt/xấu” cho CPI, VIX, USD/VND hay US10Y.

---

## Cập nhật 2026-07-13 — Frontend Phase 1-5 (khung sườn Tailwind + redesign)

Tóm tắt kiến trúc đầy đủ: xem [CHANGELOG.md](CHANGELOG.md) mục `[1.2.0]`. Phần này ghi riêng các
thay đổi giao diện/UI cụ thể, theo đúng phạm vi của file này:

- **Sidebar + top bar dùng chung mới** (`assets/css/shell.css`, `assets/js/shell.js`) thay `nav.css`
  cho 7 trang chính; `nav.css` nay chỉ còn phục vụ báo cáo tĩnh lưu trữ (`playbook-*`/`report-*`).
  Sidebar thu gọn được (icon-only), nhớ trạng thái qua `localStorage`.
- **Tailwind CDN** thêm CHỈ cho khung sườn (Preflight tắt) — Bootstrap 5 + design system `style.css`
  cũ vẫn nguyên vẹn cho nội dung dữ liệu bên trong (card/bảng/badge), không phải một cuộc migrate.
- **Lucide Icons** (CDN) thay icon chữ/emoji ở khung sườn.
- **2 component mới**: panel 2 cột kéo giãn tỷ lệ (`assets/js/resizable-panels.js`, ở `dashboard.html`/
  `analysis.html`) và panel chi tiết mã trượt từ phải khi bấm dòng bảng (`assets/js/company-panel.js`,
  chỉ ở `screener.html`) — 3 tab Tổng quan/Biểu đồ/Báo cáo tài chính (tab BCTC báo trạng thái
  "đang chờ dữ liệu" trung thực, chưa có số vì `financial_snapshot.*` không public).
- Style bảng DataTables đổi từ id riêng (`#market-table`) sang class dùng chung `.vs-datatable`.
- Thêm `@media (prefers-reduced-motion: reduce)` áp dụng toàn site.
- 3 trang mới: `about.html`, `archive.html` (danh sách ghi tay trong `archive.js`), `macro.html`
  (đã được nối với web snapshot ở bản cập nhật 14/07/2026).
- `index.html` đổi vai trò: từ trang chính (Bootstrap, `nav.css`) thành redirect thuần sang
  `dashboard.html` (trang chính mới), giữ nguyên URL gốc GitHub Pages.

---

## Cập nhật 2026-07-10 — Việt hóa bảng screener

- Toàn bộ 31 tên cột chuyển sang tiếng Việt (`Mã`, `Ngày`, `Giá đóng cửa (₫)`, `% Phiên`, `GTGD 20p (tỷ)`, `RS`, `Cấu trúc`...) qua bảng ánh xạ `COLUMN_LABELS` trong `app.js` — field gốc trong CSV giữ nguyên nên lọc/sort không đổi.
- Giá đóng cửa định dạng tiền Việt: `15400` → `15.400` (chỉ đổi hiển thị, sort vẫn theo số).
- Cột ngày hiển thị `dd/mm/yyyy` theo chuẩn Việt Nam.

---

**Ngày:** 2026-07-09
**Phạm vi:** Toàn bộ 8 trang HTML + CSS + JS. Không thay đổi chức năng, logic xử lý, luồng dữ liệu hay liên kết giữa các trang.

---

## 1. Các file đã chỉnh sửa

| File | Mức độ | Nội dung |
|---|---|---|
| `index.html` | Viết lại layout | Dashboard mới: navbar + KPI + 2 cột nội dung |
| `style.css` | Viết lại | Design system dark mode bằng CSS variables |
| `nav.css` | **Mới** | Component navbar dùng chung cho cả 8 trang |
| `app.js` | Mở rộng | Giữ nguyên logic cũ, thêm lớp hiển thị UI |
| `playbook-2026-04-01.html` | Sửa nhỏ | Thay nav inline cũ bằng nav chung + link `nav.css` |
| `playbook-2026-04-02.html` | Sửa nhỏ | Như trên |
| `playbook-2026-04-03.html` | Sửa nhỏ | Như trên |
| `playbook-2026-04-09.html` | Sửa nhỏ | Như trên |
| `report-2026-04-21.html` | Sửa nhỏ | Như trên |
| `vnindex_playbook_2026-04-03.html` | Sửa nhỏ | Chèn nav chung (trước đây không có nav) |
| `vn_crosscheck_update_2026-04-08.html` | Sửa nhỏ | Như trên |
| `CHANGELOG_UI.md` | **Mới** | File này |

## 2. Theme & Design System

- Dark mode toàn trang theo palette: nền `#0F172A`, card `#1E293B`, border `#334155`, chữ `#F8FAFC`, phụ `#94A3B8`, primary `#3B82F6`, success `#22C55E`, warning `#F59E0B`, danger `#EF4444`.
- Toàn bộ màu khai báo bằng **CSS variables** trong `:root` — đổi theme chỉ cần sửa một chỗ.
- Font **Inter** (Google Fonts), heading 600–700, body 400–500, số dùng `tabular-nums` để thẳng cột.
- Bootstrap 5 chạy ở chế độ `data-bs-theme="dark"`, các component được override bằng design system riêng.

## 3. Thành phần UI mới

- **Navbar dùng chung (`nav.css`)**: sticky trên Dashboard, hiện diện đồng bộ trên cả 7 trang báo cáo cũ; đánh dấu trang hiện tại; cuộn ngang trên mobile; các trang cũ trước đây dùng nav pill inline-style mỗi trang một kiểu nay đã thống nhất.
- **5 KPI Cards** đầu trang (chỉ dùng dữ liệu có sẵn):
  - Regime thị trường (từ `ai_report_latest.json`, tô màu bull/neutral/bear)
  - Rủi ro danh mục (low/medium/high)
  - Breadth % mã trên MA200 (tính từ CSV, có progress bar)
  - % mã cấu trúc UP (tính từ CSV, có progress bar)
  - Số mã thanh khoản cao GTGD20 ≥ 50 tỷ
- **Watchlist hôm nay**: render `stock_notes` từ JSON thành danh sách mở rộng được (ticker + badge stance màu: MUA THĂM DÒ / CHỜ SETUP / THEO DÕI / TRÁNH + logic vào lệnh + cờ rủi ro).
- **Kế hoạch hành động**: render `action_plan` từ JSON.
- **2 biểu đồ Chart.js** (tính từ CSV, không thêm dữ liệu mới):
  - Bar ngang: % mã trên MA200 theo ngành (top 10, ngành ≥ 8 mã, tô màu theo ngưỡng)
  - Doughnut: phân bố cấu trúc giá UP/SIDE/DOWN
- **10 nút lọc nhanh (chips)** cho screener + nút xóa lọc: Top RS ≥ 90, CANSLIM, SMC UP, Gần Swing Low ≤ 10%, Thanh khoản ≥ 50 tỷ, Room ngoại > 20%, PE < 15, ROE > 15%, RSI < 30, RSI > 70. Các chip kết hợp theo logic AND và hoạt động cùng bộ lọc sàn/ngành + ô tìm kiếm.
- **Nút Xem đầy đủ / Thu gọn** cho báo cáo AI (mặc định thu gọn có hiệu ứng mờ dần).

## 4. Bảng screener (phong cách TradingView)

- Header cố định khi cuộn dọc (`scrollY` + sticky), cuộn ngang khi thiếu chỗ.
- Zebra rows + hover highlight xanh.
- **Conditional formatting**:
  - `rs_rating`: badge xanh (>90) / vàng (80–90) / xám (<80)
  - `rsi14`: xanh đậm (<30 quá bán) / đỏ (>70 quá mua)
  - `structure`: badge UP xanh / SIDE vàng / DOWN đỏ
  - `gtgd20_ty`: xanh đậm (≥100 tỷ), làm mờ (<3 tỷ)
  - Cột % biến động (`chg_today_pct`, `ret_*`, `macd_hist`...): xanh/đỏ theo dấu
  - Cột boolean (`above_sma50/200`, `golden_cross`, `near_52w_high`): ✓ / ·
  - `ticker`: in đậm màu xanh nhạt
- Sort icon của DataTables được tô màu primary; phân trang, ô tìm kiếm, select đều theo dark theme.

## 5. Tối ưu đã áp dụng

- **Gom CSS dùng chung**: nav của 8 trang trước đây là inline-style lặp lại từng trang (mỗi pill ~200 ký tự style) → một file `nav.css` + class ngữ nghĩa; đã gỡ toàn bộ inline nav cũ.
- CSS component hóa (`.kpi`, `.chip`, `.badge-soft`, `.watch-item`, `.archive-list`...), không còn style lặp.
- Escape HTML mọi dữ liệu động trước khi chèn DOM (chống vỡ layout/XSS từ dữ liệu).
- Animation nhẹ: fade-in card, hover nâng KPI card, hover đổi màu dòng bảng/nút — không dùng animation nặng.
- Responsive kiểm tra ở 375px (mobile): không tràn ngang, KPI xếp dọc, bảng và nav cuộn ngang trong container riêng.
- Class prefix `vs-` cho nav để không xung đột với Tailwind/CSS nội bộ các trang báo cáo cũ.

## 6. Không thay đổi (đúng cam kết)

- Toàn bộ ID mà JS sử dụng giữ nguyên: `ai-report`, `report-date`, `last-updated`, `filter-exchange`, `filter-industry`, `market-table`, `table-status`.
- Logic fetch/parse (marked.js, PapaParse, DataTables) và cách lọc theo sàn/ngành giữ nguyên.
- Liên kết giữa các trang giữ nguyên đường dẫn tương đối (an toàn GitHub Pages).
- Nội dung các báo cáo lịch sử không bị đụng đến (chỉ thêm navbar).

## 7. Đề xuất nâng cấp tiếp theo

1. **Cột tùy chọn cho screener**: cho phép ẩn/hiện nhóm cột (kỹ thuật / cơ bản / thanh khoản) bằng DataTables `colvis` để bớt cuộn ngang.
2. **Lưu trạng thái bộ lọc** vào `localStorage` để giữ nguyên bộ lọc giữa các lần mở trang.
3. **Trang chi tiết mã**: click ticker mở modal tổng hợp các chỉ số của mã đó từ CSV (không cần dữ liệu mới).
4. **Tự động hóa kho lưu trữ**: sinh file `reports_manifest.json` trong `sync_and_push.bat` để sidebar và navbar tự cập nhật danh sách báo cáo, khỏi sửa tay HTML.
5. **Sparkline cột ret_1m/3m/6m/12m**: vẽ mini-bar ngay trong ô để đọc xu hướng nhanh hơn.
6. **PWA nhẹ**: thêm manifest + icon để "cài" dashboard lên màn hình điện thoại.
