<a id="contributing"></a>
# Đóng góp

Cảm ơn bạn quan tâm đến dự án. Hãy đọc tài liệu này trước khi mở issue hoặc PR —
phạm vi của repository hẹp hơn những gì bạn có thể hình dung ban đầu.

<a id="what-this-repository-actually-contains"></a>
## Repository này thực sự chứa những gì

Repository (`stocklookup-dashboard`, thư mục cục bộ `market-dashboard`) là **website dashboard công khai** của một dự án
dữ liệu thị trường chứng khoán Việt Nam cá nhân. Repository được chủ động tách
khỏi toàn bộ dự án:

- Hệ thống tạo dữ liệu nghiên cứu (Producer) và phần nghiên cứu AI (Consumer) là
  **hạ tầng riêng tư**: không được công bố tại đây và không nhận đóng góp bên ngoài.
  Đóng góp công khai chỉ áp dụng cho Dashboard trong repository này.
- Cơ sở dữ liệu nền và các tập dữ liệu sinh ra là tài sản dữ liệu cá nhân,
  được chủ động loại khỏi Git bằng gitignore
  (xem phân tách đầy đủ tại [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

Phần **có trong repository** và tiếp nhận đóng góp: giao diện tĩnh (`dashboard.html`,
`screener.html`, `analysis.html`/`analysis.js`, `signals.html`, `about.html`, `archive.html`,
`macro.html`, file chuyển hướng `index.html`, `app.js`, `style.css`, các file khung trong
`assets/css/` và `assets/js/`) cùng tài liệu trong `docs/`. `nav.css` là thành phần cũ —
chỉ các báo cáo tĩnh được lưu trữ (`playbook-*.html`, `report-*.html`) còn sử dụng nó.

<a id="ways-to-contribute"></a>
## Cách đóng góp

- **Báo lỗi dashboard** (hiển thị, bộ lọc, liên kết hỏng, chế độ tối) — mở issue
  kèm trình duyệt/hệ điều hành và các bước tái hiện.
- **Sửa tài liệu** trong `docs/` hoặc `README.md` — lỗi chính tả, bước hướng dẫn
  chưa rõ, liên kết hỏng.
- **Cải thiện giao diện** (`app.js`, `style.css`, `nav.css`, các trang `.html`) —
  giữ nguyên các ID mà `app.js` phụ thuộc (`ai-report`, `report-date`, `last-updated`,
  `filter-exchange`, `filter-industry`, `market-table`, `table-status`) và hệ biến CSS
  cho chế độ tối trong `style.css`; xem [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#quy-ước-ui-giữ-khi-sửa-giao-diện).

<a id="whats-out-of-scope-for-prs"></a>
## Những nội dung ngoài phạm vi PR

- Thay đổi pipeline dữ liệu, bộ xử lý báo cáo tài chính hoặc bộ phân tích cổ
  phiếu — mã nguồn đó thuộc hạ tầng riêng tư, không nằm trong repository này, nên
  không có phần tương ứng để gửi PR tại đây. Nếu nghi ngờ dữ liệu hiển thị sai, hãy
  mở issue mô tả trang, mã cổ phiếu và phiên dữ liệu.
- Sửa trực tiếp các tệp dữ liệu đã phát hành (`data/*.json`, `data/*.js`) — các tệp
  này do hệ thống riêng tạo và sẽ bị ghi đè ở lần phát hành sau.
- Tư vấn đầu tư, tín hiệu giao dịch hoặc bất cứ nội dung nào hàm ý đầu ra của
  dashboard là khuyến nghị — dự án cung cấp công cụ dữ liệu, không phải tư vấn tài chính.

<a id="submitting-a-change"></a>
## Gửi thay đổi

1. Fork repository và tạo branch từ `main`.
2. Giữ thay đổi tập trung — một bản sửa lỗi/tính năng cho mỗi PR.
3. Kiểm tra cục bộ bằng cách phục vụ website (`python -m http.server 8000`) và
   xem các trang đã sửa trong trình duyệt, cả khi dữ liệu ít/trống/thiếu CSV lẫn
   khi dữ liệu bình thường.
4. Mở PR mô tả nội dung thay đổi và lý do.

Khi đóng góp, bạn đồng ý cấp phép phần đóng góp của mình theo
[MIT License](LICENSE) của repository này.
