/* ============================================================
 * Stock Look Up — assets/js/archive.js
 * Trang archive.html: danh sách báo cáo lịch sử tĩnh.
 * GitHub Pages không liệt kê thư mục, nên:
 *  - Báo cáo phiên (report-YYYY-MM-DD.html) do mỗi lần công bố Daily
 *    tạo ra được dò bằng HEAD cho các ngày làm việc từ phiên hiện tại
 *    lùi về DAILY_REPORT_FLOOR — không cần sửa tay khi có phiên mới.
 *  - Tài liệu cũ (playbook, đối chiếu) vẫn ghi tay trong LEGACY_ITEMS.
 * Sort theo trường `date` (ISO YYYY-MM-DD), không theo chuỗi hiển thị.
 * ============================================================ */

const LEGACY_ITEMS = [
  { file: "report-2026-08-25.html", date: "2026-08-25", kind: "report" },
  { file: "report-2026-04-21.html", date: "2026-04-21", kind: "report" },
  { file: "playbook-2026-04-09.html", date: "2026-04-09", kind: "playbook" },
  { file: "vn_crosscheck_update_2026-04-08.html", date: "2026-04-08", kind: "crosscheck" },
  { file: "playbook-2026-04-03.html", date: "2026-04-03", kind: "playbook" },
  { file: "vnindex_playbook_2026-04-03.html", date: "2026-04-03", kind: "playbook" },
  { file: "playbook-2026-04-02.html", date: "2026-04-02", kind: "playbook" },
  { file: "playbook-2026-04-01.html", date: "2026-04-01", kind: "playbook" },
];
const DAILY_REPORT_FLOOR = "2026-08-25";
const KIND_LABEL = { report: "Báo cáo phiên", playbook: "Kế hoạch phiên", crosscheck: "Đối chiếu dữ liệu" };
let ARCHIVE_ITEMS = LEGACY_ITEMS.slice();

const MONTH_LABEL_VI = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const quarterOf = (iso) => "Q" + (Math.floor((Number(iso.split("-")[1]) - 1) / 3) + 1);
const quarterKey = (iso) => `${iso.slice(0, 4)} ${quarterOf(iso)}`;

function currentSession() {
  return window.BUILD_INFO?.market_session || window.STOCK_LOOKUP_BUILD_INFO?.market_session || "";
}

// Weekdays from `latest` back to `floor`, newest first (ISO strings, UTC arithmetic).
function candidateSessions(latest, floor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latest)) return [];
  const out = [];
  const day = new Date(`${latest}T00:00:00Z`);
  while (out.length < 120) {
    const iso = day.toISOString().slice(0, 10);
    if (iso < floor) break;
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(iso);
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return out;
}

async function discoverDailyReports() {
  const known = new Set(LEGACY_ITEMS.map((it) => it.file));
  const dates = candidateSessions(currentSession(), DAILY_REPORT_FLOOR);
  const found = [];
  let next = 0;
  async function worker() {
    while (next < dates.length) {
      const date = dates[next++];
      const file = `report-${date}.html`;
      if (known.has(file)) continue;
      try {
        const response = await fetch(file, { method: "HEAD", cache: "no-cache" });
        if (response.ok) found.push({ file, date, kind: "report" });
      } catch (_) { /* offline or blocked: keep the legacy list */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return found;
}

function groupByMonth(items) {
  const groups = new Map();
  items.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((item) => {
    const [y, m] = item.date.split("-");
    const key = `${y}-${m}`;
    if (!groups.has(key)) groups.set(key, { label: `${MONTH_LABEL_VI[Number(m) - 1]}, ${y}`, items: [] });
    groups.get(key).items.push(item);
  });
  return groups;
}

function render(items) {
  const root = document.getElementById("archive-list");
  const empty = document.getElementById("archive-empty");
  if (!items.length) {
    root.innerHTML = "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";
  const latestSession = currentSession();
  const groups = groupByMonth(items);
  root.innerHTML = Array.from(groups.values()).map((g) => `
    <section class="archive-month">
      <h3 class="archive-month-label">${esc(g.label)}</h3>
      <div class="archive-month-list">
        ${g.items.map((it) => {
          const isLatest = latestSession && it.date === latestSession && it.kind === "report";
          return `
          <a href="${encodeURI(it.file)}" class="vs-list-item archive-item">
            <span class="archive-item-date">${fmtDate(it.date)}</span>
            <span class="archive-item-kind">${esc(KIND_LABEL[it.kind] || "Tài liệu")}</span>
            ${isLatest ? `<span class="badge-soft bs-green">Phiên mới nhất</span>` : `<span class="archive-item-tag">Đã lưu</span>`}
          </a>
        `;}).join("")}
      </div>
    </section>
  `).join("");
  const count = document.getElementById("archive-count");
  if (count) count.textContent = `${items.length} / ${ARCHIVE_ITEMS.length} tài liệu`;
}

// --- Bộ lọc kết hợp: tìm kiếm (text) + quý (chip) — AND với nhau ---
let activeQuarter = "";

function applyFilters() {
  const q = (document.getElementById("archive-search")?.value || "").trim().toLowerCase();
  const filtered = ARCHIVE_ITEMS.filter((it) => {
    const kind = (KIND_LABEL[it.kind] || "").toLowerCase();
    const matchesSearch = !q || it.file.toLowerCase().includes(q) || it.date.includes(q) || fmtDate(it.date).includes(q) || kind.includes(q);
    const matchesQuarter = !activeQuarter || quarterKey(it.date) === activeQuarter;
    return matchesSearch && matchesQuarter;
  });
  render(filtered);
}

function initSearch() {
  const input = document.getElementById("archive-search");
  if (!input) return;
  input.addEventListener("input", applyFilters);
}

// Chip lọc theo quý — chỉ hiện khi báo cáo trải ra ĐA quý (1 quý thì lọc không có ý nghĩa)
function initQuarterChips() {
  const box = document.getElementById("archive-quarter-chips");
  if (!box) return;
  box.replaceChildren();
  const quarters = Array.from(new Set(ARCHIVE_ITEMS.map((it) => quarterKey(it.date)))).sort().reverse();
  if (quarters.length <= 1) { box.style.display = "none"; return; }
  box.style.display = "";

  function makeChip(label, value) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (value === activeQuarter ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeQuarter = value;
      box.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
    });
    return btn;
  }

  box.appendChild(makeChip("Tất cả", ""));
  quarters.forEach((qtr) => box.appendChild(makeChip(qtr, qtr)));
}

// Lọc theo ngành/mã — ẩn hoàn toàn cho tới khi có báo cáo thật gắn industry/company
// (xem ghi chú ở ARCHIVE_ITEMS). Không dựng UI cho dữ liệu chưa tồn tại.
function initIndustryCompanyFilter() {
  const box = document.getElementById("archive-industry-filter");
  if (!box) return;
  const hasData = ARCHIVE_ITEMS.some((it) => it.industry || it.company);
  box.style.display = hasData ? "" : "none";
}

document.addEventListener("DOMContentLoaded", () => {
  render(ARCHIVE_ITEMS);
  initSearch();
  initQuarterChips();
  initIndustryCompanyFilter();
  const status = document.getElementById("archive-discovery-status");
  discoverDailyReports().then((found) => {
    if (found.length) {
      ARCHIVE_ITEMS = LEGACY_ITEMS.concat(found);
      initQuarterChips();
      applyFilters();
    }
    if (status) status.hidden = true;
  });
});
