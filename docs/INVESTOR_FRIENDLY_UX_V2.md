# Investor-friendly UX V2 (2026-11-08)

Presentation-only redesign of reading order and wording. The glass visual system
(`GLASSY_SHELL_V1.md`, `MINIMAL_GLASS_UX_V1.md`) is unchanged; no Producer value, decision,
identity, count, schema or generated data file is modified.

## Two-layer stock dossier (`investment-workspace.html?view=dossier`)

**Layer 1 — default view, readable in about 30 seconds**

| Block | Source in the dossier model | Rule |
|---|---|---|
| Tình hình hiện tại | `posture` + fixed one-line meaning per posture | Restates the published posture; never upgrades it. "Lý do chính" lists only neutral/pending reasons so it never repeats a positive or a caution. |
| Cần lưu ý trước tiên | `adverse` when posture is AVOID / REDUCE / HOLD_DO_NOT_ADD, no current evidence, or a reported trigger | Shown above all cards, never collapsed. |
| Điểm tích cực / Điểm cần thận trọng | `evidence.support` / `adverse` | Up to four each, then a link into layer 2. A shared context tag is stated once. Counts do not say which side wins. |
| Điều cần theo dõi | `conditions` | Each row carries "Chưa xảy ra", "Đã xảy ra theo dữ liệu" (only on a Producer-reported trigger), "Mốc tham chiếu" or "Đang ghi nhận". |
| Định giá cho biết gì? | `valuation` | Fair value: stated as not established unless the Producer admits it. Research multiples are shown with their period; the same method at two dates gets an explicit "do not compare directly" note. No target price. |
| Giá đang diễn biến thế nào? | `technical` | Price trend and relative strength are explained as two lenses when they disagree. |
| Những gì chưa biết | `fundamentals.unavailable` + `valuation.unavailable` | Grouped by theme with one root reason; not-applicable methods are counted separately and never called missing. |
| Mức độ tin cậy của dữ liệu | session, financial period, freshness, PIT limitation | Dates every figure family (for example "kỳ 2026-Q1"). |

**Layer 2 — collapsible sections**: full positives/cautions, conditions, posture and
scenarios, technical, financial figures (grouped by theme and reason), valuation detail,
verification questions (five with the widest root cause first, the rest one click away;
ids and texts unchanged), freshness, public history, and "Chi tiết dữ liệu và phương pháp"
(label legend, reason-category legend, provenance, and every raw status/reason code).

### Reason categories

Reading aids for an original reason code, not new states: Chưa có dữ liệu · Có dữ liệu
nhưng chưa đủ để tính · Số liệu không khớp nhau · Chỉ dùng để tham khảo · Không áp dụng ·
Đang chờ xác nhận · Chưa đủ căn cứ để kết luận · Số liệu cũ. Every row keeps its raw
reason in `data-reason-code` / `title` and in the methodology section.

## Other pages

- Home: page lede, "Các mã đang ở trạng thái nào?", post-hoc VN-Index block in plain words
  with source ids behind "Chi tiết kỹ thuật về nguồn"; market-close block likewise.
- Workspace: lede, "Hồ sơ cổ phiếu" tab, "trạng thái hành động" instead of "tư thế".
- Macro: "Số liệu còn mới / cần cập nhật" instead of "Trong ngưỡng"; each headline card has
  "Chỉ số này là gì?" (general knowledge, explicitly not a forecast).
- Portfolio, Archive: shorter ledes that say what the page is and is not.
- Shared labels (`value-format.js`): plain wording for frequent rule conditions
  (for example `WAIT_FOR_CONFIRMATION` → "Chưa có đủ tín hiệu xác nhận xu hướng").

Acceptance: `tests/investor-friendly-dossier.test.js` (runs in Dashboard CI).
