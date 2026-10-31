<a id="stock-look-up-dashboard"></a>
# Stock Lookup — Dashboard nghiên cứu cổ phiếu Việt Nam

Stock Lookup là website nghiên cứu thị trường chứng khoán Việt Nam dùng trực tiếp trên trình duyệt. Repository này chứa mã nguồn công khai của website đó và các tệp dữ liệu nghiên cứu đã được phát hành cho website. Repository không chứa hệ thống tạo dữ liệu, cơ sở dữ liệu runtime, bản sao lưu hoặc artifact AI riêng tư.

<a id="dung-thu-trong-mot-phut"></a>
## Dùng thử ngay trên trình duyệt

**[Mở Stock Lookup Dashboard](https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/)** — không cần cài Python, fork hay clone mã nguồn để xem dữ liệu nghiên cứu công khai.

1. **Tổng quan:** xem phiên dữ liệu, độ rộng thị trường, nhóm ngành và các rủi ro cần chú ý.
2. **Cơ hội:** chọn một mã để xem trạng thái nghiên cứu, bằng chứng, điều kiện xác nhận và vô hiệu hóa. Các trạng thái có thể thiếu hoặc cũ; xem thời điểm và giới hạn sử dụng.
3. **Danh mục:** tự nhập dữ liệu danh mục nếu muốn; phần này lưu trên trình duyệt của bạn, không đồng bộ tài khoản giao dịch.

Thông tin chỉ phục vụ nghiên cứu, không phải khuyến nghị mua/bán hay cam kết kết quả đầu tư. [Xem cách đọc dữ liệu](https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/about.html).

<a id="current-product-surfaces"></a>
## Các giao diện sản phẩm hiện tại

Thanh điều hướng dành cho nhà đầu tư: **Tổng quan | Cơ hội | Danh mục | Vĩ mô | Lịch sử**.
Cơ hội giữ route tương thích `investment-workspace.html`. Khám phá, phân tích,
evidence kỹ thuật và danh sách theo dõi là các chế độ xem bên trong; URL cũ vẫn
được chuyển hướng. Quy ước trình bày bằng tiếng Việt và hiển thị chi tiết theo
nhu cầu được mô tả tại
[docs/INVESTOR_FIRST_UX_V1.md](docs/INVESTOR_FIRST_UX_V1.md).
Hệ thống trình bày tối giản (bố cục, nút, bảng, điều hướng di động) được mô tả tại
[docs/MINIMAL_GLASS_UX_V1.md](docs/MINIMAL_GLASS_UX_V1.md).

Giao diện nghiên cứu hiện tại sử dụng `data/investment_decision_workspace.json`,
bản chiếu Workspace được tuần tự hóa do hệ thống nghiên cứu riêng (Producer) tạo. Trang Tổng quan,
Phân tích, Tín hiệu kỹ thuật, liên kết từ bộ lọc cổ phiếu, chi tiết Workspace và
Danh mục dùng bản chiếu này làm ngữ cảnh nghiên cứu mô tả. Dashboard không tính
điểm, xếp hạng, giá mục tiêu, xác suất, quy mô vị thế hay lệnh thực thi. Các tài
nguyên nến giá và ngành cũ vẫn là phần bổ trợ tùy chọn; quyền phát hành dữ liệu
thuộc hệ thống Producer riêng tư, không thuộc repository này.

<a id="ung-ho-stock-lookup"></a>
## Ủng hộ Stock Lookup

Nếu Dashboard hữu ích, hãy [bấm **Star** cho repository công khai](https://github.com/tungthanhnguyen2312-wq/stocklookup-dashboard), [gửi góp ý hoặc báo lỗi](https://github.com/tungthanhnguyen2312-wq/stocklookup-dashboard/issues). Bạn có thể sử dụng website mà không cần fork hoặc clone. Star và đóng góp đều tự nguyện; kênh tài trợ chỉ được liên kết khi đã được kích hoạt chính thức.

<a id="stock-lookup-repositories"></a>
## Phần nào công khai, phần nào riêng tư

| Thành phần | Công khai? | Nội dung |
|---|---|---|
| **Website** <https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/> | Có | Sản phẩm dành cho người dùng: Tổng quan, Cơ hội, Danh mục, Vĩ mô, Lịch sử. |
| **Mã nguồn website** — [stocklookup-dashboard](https://github.com/tungthanhnguyen2312-wq/stocklookup-dashboard) (repository này) | Có, MIT | HTML/CSS/JS tĩnh và tài liệu; nơi nhận issue, góp ý và PR. |
| **Dữ liệu nghiên cứu đã phát hành** — các tệp `data/*.json`, `data/*.js` trong repository này | Có | Bản chiếu nghiên cứu do hệ thống riêng tạo; website chỉ kiểm tra và hiển thị, không tự tính lại. |
| **Hạ tầng nghiên cứu** — engine thu thập/chuẩn hóa/phân tích (Producer) và nghiên cứu AI (Consumer) | Không | Repository riêng tư hoặc đang chuyển sang riêng tư; không phải điểm đến công khai để xem mã hay gửi PR. |

Các phiên bản trước đây đã phát hành theo giấy phép MIT vẫn giữ nguyên giấy phép đó.

<a id="repository-boundary"></a>
## Ranh giới repository

- Lưu mã nguồn dashboard, tài nguyên tĩnh và tài liệu phát triển có thể tái sử dụng trong repository này.
- Đặt quy trình riêng của từng máy, dữ liệu runtime, báo cáo sinh cục bộ và bản sao lưu bên ngoài repository.
- Tích hợp cục bộ dùng `STOCK_LOOKUP_RUNTIME_ROOT` do người vận hành hoặc cấu hình triển khai cung cấp. Không giả định runtime nằm cạnh checkout này.

<a id="local-preview"></a>
## Xem trước cục bộ (dành cho người phát triển giao diện)

Người dùng không cần bước này. Để sửa giao diện, chạy từ thư mục gốc của repository:

```powershell
Set-Location <dashboard-repository>
python -m http.server 8017
```

Sau đó mở `http://localhost:8017/dashboard.html`.

<a id="documentation"></a>
## Tài liệu

- [Cách đọc dữ liệu](https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/about.html) trên website là hướng dẫn dành cho người dùng.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) mô tả ranh giới dashboard và luồng dữ liệu.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) và [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md) mô tả pipeline cục bộ VNSTOCK trước đây; chúng được giữ làm lịch sử, không phải cách dùng Dashboard hiện nay.
- Các bản đánh giá lịch sử trong `docs/` được giữ làm bằng chứng tại thời điểm ghi nhận; chúng không phải hướng dẫn vận hành hiện tại.

Thông tin đóng góp và bảo mật nằm tại [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md).
