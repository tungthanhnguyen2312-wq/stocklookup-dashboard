<a id="stock-look-up-dashboard"></a>
# Dashboard Stock Look Up

Repository này chứa dashboard hiển thị trên GitHub và các tài nguyên có thể phát hành của dashboard. Repository không chứa pipeline Producer, cơ sở dữ liệu runtime, bản sao lưu hoặc artifact AI riêng tư.

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
bản chiếu Workspace được tuần tự hóa do Producer quản lý. Trang Tổng quan,
Phân tích, Tín hiệu kỹ thuật, liên kết từ bộ lọc cổ phiếu, chi tiết Workspace và
Danh mục dùng bản chiếu này làm ngữ cảnh nghiên cứu mô tả. Dashboard không tính
điểm, xếp hạng, giá mục tiêu, xác suất, quy mô vị thế hay lệnh thực thi. Các tài
nguyên nến giá và ngành cũ vẫn là phần bổ trợ tùy chọn; authority phát hành vẫn
thuộc repository Producer riêng.

<a id="stock-lookup-repositories"></a>
## Các repository của Stock Lookup

| Repository | Vai trò | Thư mục cục bộ |
|---|---|---|
| [stocklookup-engine](https://github.com/tungthanhnguyen2312-wq/stocklookup-engine) | Producer: thu thập evidence, chuẩn hóa, phân tích tài chính/định giá/quyết định, phát hành | `stock-core-private` |
| [stocklookup-ai-research](https://github.com/tungthanhnguyen2312-wq/stocklookup-ai-research) | Consumer: ngữ cảnh và báo cáo nghiên cứu AI | `ai-core-private` |
| [stocklookup-dashboard](https://github.com/tungthanhnguyen2312-wq/stocklookup-dashboard) (repository này) | Website công khai | `market-dashboard` |

Website: <https://tungthanhnguyen2312-wq.github.io/stocklookup-dashboard/>

<a id="repository-boundary"></a>
## Ranh giới repository

- Lưu mã nguồn dashboard, tài nguyên tĩnh và tài liệu phát triển có thể tái sử dụng trong repository này.
- Đặt quy trình riêng của từng máy, dữ liệu runtime, báo cáo sinh cục bộ và bản sao lưu bên ngoài repository.
- Tích hợp cục bộ dùng `STOCK_LOOKUP_RUNTIME_ROOT` do người vận hành hoặc cấu hình triển khai cung cấp. Không giả định runtime nằm cạnh checkout này.

<a id="local-preview"></a>
## Xem trước cục bộ

Chạy từ thư mục gốc của repository:

```powershell
Set-Location <dashboard-repository>
python -m http.server 8017
```

Sau đó mở `http://localhost:8017/dashboard.html`.

<a id="documentation"></a>
## Tài liệu

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) mô tả ranh giới dashboard và luồng dữ liệu.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) và [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md) là tài liệu tham khảo dành cho người phát triển.
- Các bản đánh giá lịch sử trong `docs/` được giữ làm bằng chứng tại thời điểm ghi nhận; chúng không phải hướng dẫn vận hành hiện tại.

Thông tin đóng góp và bảo mật nằm tại [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md).
