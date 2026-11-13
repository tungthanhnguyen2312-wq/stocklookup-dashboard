<a id="security-policy"></a>
# Chính sách bảo mật

<a id="scope"></a>
## Phạm vi

Repository này phát hành **dashboard tĩnh** (HTML/CSS/JS được phục vụ qua GitHub
Pages) và tài liệu công khai. Repository không vận hành backend nhận thông tin đăng nhập tài khoản giao dịch. Trang Danh mục có thể lưu dữ liệu người dùng tự nhập (mã cổ phiếu, khối lượng/tỷ trọng, tiền mặt) vào `localStorage` ngay trên trình duyệt thông qua `portfolio.js`; dữ liệu này không được đồng bộ lên máy chủ bởi chức năng Danh mục hiện tại. Người dùng nên tránh nhập thông tin nhận dạng cá nhân, mật khẩu hay bí mật tài khoản. Xóa dữ liệu trang web/trình duyệt có thể xóa danh mục đã lưu. Website cũng lưu một số tùy chọn giao diện (độ rộng cột, trạng thái thu gọn thanh bên, bộ lọc mẫu nến) trong `localStorage`. Hệ thống tạo các file CSV/JSON mà dashboard
sử dụng là hạ tầng riêng tư và **không** thuộc repository này
(xem [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Vấn đề bảo mật liên quan đến dữ liệu hiển thị trên website vẫn được báo qua issue của repository này; không đính kèm dữ liệu nhạy cảm.

<a id="reporting-a-vulnerability"></a>
## Báo cáo lỗ hổng

Nếu phát hiện vấn đề bảo mật trên website đã phát hành (ví dụ nguy cơ XSS trong
cách dashboard hiển thị dữ liệu CSV/JSON/Markdown hoặc dependency từ CDN có CVE
đã biết), hãy mở [GitHub issue](https://github.com/tungthanhnguyen2312-wq/stocklookup-dashboard/issues)
với mô tả rõ ràng và các bước tái hiện. Không đưa dữ liệu danh mục/tài chính
thực vào báo cáo — dữ liệu mẫu/tổng hợp là đủ để tái hiện lỗi hiển thị.

Không có chương trình thưởng phát hiện lỗi; đây là dự án cá nhân/hồ sơ năng lực,
được duy trì trong khả năng của người phụ trách.

<a id="supported-versions"></a>
## Phiên bản được hỗ trợ

Chỉ branch `main` được duy trì. Hiện không có bản phát hành gắn tag nào được hỗ
trợ bảo mật độc lập.
