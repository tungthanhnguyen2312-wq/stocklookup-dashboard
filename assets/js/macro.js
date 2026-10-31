/* Dashboard vĩ mô: fetch JSON qua HTTP, fallback biến global khi mở file://. */
(function () {
  "use strict";

  var JSON_PATH = "data/macro_snapshot.json";
  var KPI_PRIORITY = [
    "usdvnd_vcb", "us_fedfunds", "vn_cpi_yoy", "us_10y",
    "dxy", "vix", "brent", "gold_world",
  ];
  var chartInstances = [];

  var CHART_GROUPS = [
    { title: "Lãi suất và lợi suất", subtitle: "Fed Funds · TPCP Mỹ 10 năm", keys: ["us_fedfunds", "us_10y"] },
    { title: "Tỷ giá và sức mạnh USD", subtitle: "USD/VND · DXY broad", keys: ["usdvnd_vcb", "usdvnd_mkt", "dxy"] },
    { title: "Lạm phát và tăng trưởng", subtitle: "CPI/GDP Việt Nam · CPI Mỹ", keys: ["vn_cpi_yoy", "vn_gdp_yoy", "us_cpi"] },
    { title: "Rủi ro quốc tế", subtitle: "VIX · DXY broad", keys: ["vix", "dxy"] },
    { title: "Năng lượng", subtitle: "Brent · WTI", keys: ["brent", "wti"] },
    { title: "Vàng", subtitle: "Vàng quốc tế · SJC", keys: ["gold_world", "gold_sjc"] },
  ];

  /* Màu CỐ ĐỊNH theo khoá chỉ báo (Objective D, Phase 4B) — trước đây gán theo vị trí
   * trong mảng ĐÃ LỌC (index % CHART_COLORS.series.length): nếu 1 chỉ báo trong nhóm
   * tạm thời "unavailable" ở lần cập nhật này, mọi chỉ báo sau nó dịch màu — cùng 1 chỉ
   * báo (vd us_10y) có thể đổi màu giữa các lần tải tuỳ chỉ báo nào khác có mặt. Bảng
   * dưới đây khoá màu theo CHÍNH khoá chỉ báo nên ổn định qua mọi lần tải/nhóm/thứ tự;
   * đã chọn để phân biệt tốt trên nền dark-slate và không chỉ dựa vào đỏ/xanh lá. */
  var INDICATOR_COLORS = {
    us_fedfunds: "#4C9AFF", us_10y: "#FF8A3D",
    usdvnd_vcb: "#36D399", usdvnd_mkt: "#C084FC", dxy: "#F5D547",
    vn_cpi_yoy: "#FF6B9D", vn_gdp_yoy: "#4ADEDE", us_cpi: "#9D7FE8",
    vix: "#E85D75",
    brent: "#E8975D", wti: "#7DD3E8",
    gold_world: "#E8C468", gold_sjc: "#B8935F",
  };
  var FALLBACK_COLOR_POOL = ["#20e7cf", "#5deBff", "#27e6a1", "#f0c45a", "#ff5d73"];

  // Chỉ báo mới thêm sau này (chưa có trong INDICATOR_COLORS) vẫn có màu ổn định:
  // hash xác định trên CHÍNH chuỗi khoá, không phụ thuộc thứ tự/số lượng chỉ báo khác
  // đang hiển thị — khác hẳn cách cũ dùng vị trí trong mảng đã lọc.
  function colorForIndicator(key) {
    if (INDICATOR_COLORS[key]) return INDICATOR_COLORS[key];
    var hash = 0;
    for (var i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return FALLBACK_COLOR_POOL[hash % FALLBACK_COLOR_POOL.length];
  }

  function byId(id) { return document.getElementById(id); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function icon(name) {
    var node = element("i");
    node.setAttribute("data-lucide", name);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function safeExternalUrl(value) {
    try {
      var url = new URL(String(value));
      return (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function externalLink(label, url, className) {
    var safe = safeExternalUrl(url);
    if (!safe) return element("span", "val-muted", label || "Không có liên kết");
    var link = element("a", className || "macro-source-link", label);
    link.href = safe;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", label + " (mở trong tab mới)");
    return link;
  }

  function isFiniteOrNull(value) {
    return value === null || (typeof value === "number" && Number.isFinite(value));
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (snapshot.schema_version !== 1 || !Array.isArray(snapshot.indicators)) return false;
    if (!snapshot.series || typeof snapshot.series !== "object") return false;
    if (!snapshot.generated_at || Number.isNaN(Date.parse(snapshot.generated_at))) return false;
    return snapshot.indicators.every(function (item) {
      if (!item || typeof item.key !== "string" || typeof item.label !== "string") return false;
      if (!isFiniteOrNull(item.value) || !isFiniteOrNull(item.previous_value)) return false;
      if (!isFiniteOrNull(item.change) || !isFiniteOrNull(item.change_pct)) return false;
      var points = snapshot.series[item.key];
      return Array.isArray(points) && points.every(function (point) {
        return point && typeof point.date === "string" &&
          typeof point.value === "number" && Number.isFinite(point.value);
      });
    });
  }

  async function loadMacroData(fetchImpl) {
    var doFetch = fetchImpl || window.fetch.bind(window);
    // Ưu tiên fetch JSON qua http(s); file:// (fetch luôn bị CORS chặn) hoặc fetch lỗi thì
    // nạp fallback data/macro_snapshot.js CHỈ lúc đó, không tải song song.
    if (!isFileProtocol()) {
      try {
        var response = await doFetch(JSON_PATH, { cache: "no-store" });
        if (!response.ok) throw new Error("HTTP response not ok");
        return { snapshot: await response.json(), source: "json" };
      } catch (_) { /* rơi xuống fallback bên dưới */ }
    }
    await loadFallbackScript("data/macro_snapshot.js", "MACRO_SNAPSHOT");
    return { snapshot: window.MACRO_SNAPSHOT || null, source: "fallback" };
  }

  function formatNumber(value, unit) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    var decimals = 2;
    if (/đồng/i.test(unit || "")) decimals = 0;
    if (/điểm/i.test(unit || "") && Math.abs(Number(value)) >= 1000) decimals = 0;
    return new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(Number(value));
  }

  function signed(value, decimals) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    var number = Number(value);
    var prefix = number > 0 ? "+" : "";
    return prefix + new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(number);
  }

  function deltaText(item) {
    if (item.change === null || item.change === undefined) return "Chưa có lần ghi trước";
    if (item.change_basis === "percentage_point") return signed(item.change, 2) + " điểm %";
    return item.change_pct === null ? "Chưa tính được %" : signed(item.change_pct, 2) + "%";
  }

  function directionClass(item) {
    if (item.change === null || item.direction === "unknown") return "is-missing";
    if (item.direction === "up") return "is-up";
    if (item.direction === "down") return "is-down";
    return "is-flat";
  }

  function directionIcon(item) {
    if (item.direction === "up") return "arrow-up-right";
    if (item.direction === "down") return "arrow-down-right";
    if (item.direction === "flat") return "minus";
    return "circle-help";
  }

  function formatPeriod(item) {
    if (!item.period) return "Chưa có";
    if (item.frequency === "annual") return item.period.slice(0, 4);
    var date = new Date(item.period + "T00:00:00+07:00");
    if (Number.isNaN(date.getTime())) return item.period;
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
    }).format(date);
  }

  function formatGeneratedAt(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(date);
  }

  function setStatusBadge(text, className) {
    var badge = byId("macro-status");
    badge.textContent = text;
    badge.className = "badge-soft " + className;
  }

  function setNotice(kind, text, iconName) {
    var notice = byId("macro-notice");
    notice.className = "macro-notice is-" + kind;
    notice.replaceChildren(icon(iconName), element("span", "", text));
  }

  function freshnessBadge(item) {
    var state = item.freshness && item.freshness.status;
    if (item.status !== "available") return { text: "Thiếu dữ liệu", className: "bs-gray" };
    if (state === "stale") return { text: "Cần cập nhật", className: "bs-amber" };
    if (state === "current") return { text: "Trong ngưỡng", className: "bs-green" };
    return { text: "Chưa xác định", className: "bs-gray" };
  }

  function detailRow(label, content) {
    var row = element("div", "macro-detail");
    row.append(element("span", "", label));
    if (content instanceof Node) row.append(content);
    else row.append(element("strong", "", content));
    return row;
  }

  function renderKpis(snapshot) {
    var container = byId("macro-kpis");
    container.replaceChildren();
    var byKey = new Map(snapshot.indicators.map(function (item) { return [item.key, item]; }));
    var selected = KPI_PRIORITY.map(function (key) { return byKey.get(key); }).filter(function (item) {
      return item && item.status === "available" && item.value !== null;
    });

    if (!selected.length) {
      container.append(element("div", "macro-empty-chart", "Snapshot chưa có chỉ báo trọng tâm khả dụng."));
      return;
    }

    selected.forEach(function (item) {
      var card = element("article", "kpi macro-kpi");
      var top = element("div", "macro-kpi-top");
      top.append(element("div", "macro-kpi-name", item.label));
      var fresh = freshnessBadge(item);
      top.append(element("span", "badge-soft " + fresh.className, fresh.text));

      var valueRow = element("div", "macro-kpi-value-row");
      valueRow.append(element("div", "kpi-value", formatNumber(item.value, item.unit)));
      valueRow.append(element("span", "macro-unit", item.unit || ""));

      var delta = element("div", "macro-delta " + directionClass(item));
      delta.append(icon(directionIcon(item)), element("span", "", deltaText(item)));
      delta.setAttribute("aria-label", "Thay đổi: " + deltaText(item));

      var details = element("div", "macro-kpi-details");
      // Frequency and per-indicator update time stay in "Toàn bộ chỉ báo"; the card keeps
      // only what changes how the value is read: its period and its source.
      details.append(detailRow("Kỳ dữ liệu", formatPeriod(item)));
      details.append(detailRow("Nguồn", externalLink(item.source || "Nguồn", item.source_url)));
      if (item.history_scope) details.append(detailRow("Phạm vi", item.history_scope.replace("pipeline bắt đầu chạy đều", "quy trình cập nhật bắt đầu hoạt động đều")));

      card.append(top, valueRow, delta, details);
      container.append(card);
    });
  }

  function axisKey(unit) {
    if (/đồng/i.test(unit || "")) return "vnd";
    if (/^%/i.test(unit || "")) return "percent";
    if (/USD/i.test(unit || "")) return "usd";
    if (/index/i.test(unit || "")) return "index";
    if (/điểm/i.test(unit || "")) return "points";
    return "value";
  }

  function chartScaleOptions(datasets) {
    var axes = [];
    datasets.forEach(function (dataset) {
      if (!axes.includes(dataset.yAxisID)) axes.push(dataset.yAxisID);
    });
    var scales = {
      x: {
        grid: { color: "rgba(118, 160, 166, 0.08)" },
        ticks: { color: CHART_COLORS.tickText, maxTicksLimit: 8, maxRotation: 0 },
      },
    };
    axes.forEach(function (axis, index) {
      scales[axis] = {
        type: "linear",
        position: index % 2 === 0 ? "left" : "right",
        display: true,
        grid: { color: index === 0 ? "rgba(118, 160, 166, 0.10)" : "rgba(0,0,0,0)", drawOnChartArea: index === 0 },
        ticks: { color: CHART_COLORS.tickText, callback: function (value) { return formatNumber(value, datasets.find(function (d) { return d.yAxisID === axis; }).unit); } },
      };
    });
    return scales;
  }

  /* ============================================================
   * DOM legend / toggle chuỗi (Objective D, Phase 4B) — logic quyết định thuần (không
   * đụng DOM/Chart.js) tách riêng để test được: cho mảng "đang ẩn" của từng dataset
   * trong 1 nhóm, xác định còn bao nhiêu chuỗi đang hiện và bấm ẩn tiếp 1 chuỗi có bị
   * ẩn hết (0 chuỗi hiện) hay không — nếu có thì chặn, giữ lại chuỗi cuối cùng.
   * ============================================================ */
  function countVisible(hiddenFlags) {
    return hiddenFlags.filter(function (hidden) { return hidden !== true; }).length;
  }

  function wouldHideLastVisible(hiddenFlags, index) {
    if (hiddenFlags[index] === true) return false; // đang ẩn -> bấm là để HIỆN lại, không chặn
    return countVisible(hiddenFlags) <= 1;
  }

  function soleVisibleIndex(hiddenFlags) {
    return countVisible(hiddenFlags) === 1 ? hiddenFlags.indexOf(false) : -1;
  }

  // Đọc trạng thái ẩn/hiện qua API công khai isDatasetVisible() (không tự suy ra từ
  // biến JS riêng) — luôn khớp CHÍNH XÁC trạng thái Chart.js đang vẽ trên canvas.
  function currentHiddenFlags(chart, count) {
    var flags = [];
    for (var i = 0; i < count; i += 1) flags.push(!chart.isDatasetVisible(i));
    return flags;
  }

  /* Bấm 1 chỉ báo phải ẩn/hiện ĐÚNG dataset Chart.js tương ứng (Objective A, Phase 4C) —
   * trước đây tự gán chart.getDatasetMeta(index).hidden rồi update(): API nội bộ, không
   * phải API hiển thị công khai Chart.js khuyến nghị cho custom HTML legend. Dùng
   * setDatasetVisibility()/isDatasetVisible() (đúng cặp API công khai) rồi update() —
   * canvas vẽ lại đúng đường đang ẩn/hiện. Trả về false nếu bị bảo vệ "chuỗi cuối" chặn
   * (không gọi setDatasetVisibility/update, không đổi trạng thái). */
  function toggleDatasetVisibility(chart, count, index) {
    var flags = currentHiddenFlags(chart, count);
    if (wouldHideLastVisible(flags, index)) return false;
    chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
    chart.update();
    return true;
  }

  function buildLegend(container, chart, datasets) {
    function hiddenFlags() { return currentHiddenFlags(chart, datasets.length); }
    function refreshLockState() {
      var locked = soleVisibleIndex(hiddenFlags());
      Array.from(container.children).forEach(function (btn, i) {
        var isLocked = i === locked;
        btn.classList.toggle("is-locked", isLocked);
        btn.setAttribute("aria-disabled", String(isLocked));
      });
    }
    // Đồng bộ nút TỪ trạng thái Chart.js thật (isDatasetVisible) — không phải từ 1
    // boolean UI-only riêng, nên không bao giờ lệch với đường đang vẽ trên canvas.
    function syncButtonState(btn, index) {
      var visible = chart.isDatasetVisible(index);
      btn.classList.toggle("is-active", visible);
      btn.setAttribute("aria-pressed", String(visible));
    }
    datasets.forEach(function (dataset, index) {
      var btn = element("button", "macro-legend-item is-active");
      btn.type = "button";
      btn.setAttribute("aria-pressed", "true");
      var swatch = element("span", "macro-legend-swatch");
      swatch.style.backgroundColor = dataset.borderColor;
      btn.append(swatch, element("span", "macro-legend-label", dataset.label));
      // 1 listener "click" xử lý cả chuột, chạm và bàn phím (Enter/Space) vì <button>
      // gốc tự phát sinh sự kiện click cho cả 3 — không cần thêm keydown riêng.
      btn.addEventListener("click", function () {
        if (btn.getAttribute("aria-disabled") === "true") return;
        if (!toggleDatasetVisibility(chart, datasets.length, index)) return;
        syncButtonState(btn, index);
        refreshLockState();
      });
      container.append(btn);
    });
    refreshLockState();
  }

  function renderCharts(snapshot) {
    applyChartTheme();
    chartInstances.forEach(function (instance) { instance.destroy(); });
    chartInstances = [];
    var container = byId("macro-charts");
    container.replaceChildren();
    var indicators = new Map(snapshot.indicators.map(function (item) { return [item.key, item]; }));
    var rendered = 0;

    CHART_GROUPS.forEach(function (group) {
      var members = group.keys.map(function (key) {
        return { item: indicators.get(key), points: snapshot.series[key] || [] };
      }).filter(function (entry) {
        return entry.item && entry.item.status === "available" && entry.points.length >= 2;
      });
      if (!members.length) return;

      var dates = Array.from(new Set(members.flatMap(function (entry) {
        return entry.points.map(function (point) { return point.date; });
      }))).sort();
      var card = element("article", "card macro-chart-card");
      var header = element("div", "card-header");
      var titleWrap = element("div");
      titleWrap.append(element("h3", "", group.title), element("p", "", group.subtitle));
      header.append(titleWrap, element("span", "badge-soft bs-gray", dates.length + " mốc"));

      var body = element("div", "card-body");
      var wrap = element("div", "macro-chart-wrap");
      var canvas = element("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Biểu đồ " + group.title + ". Dữ liệu từ " + dates[0] + " đến " + dates[dates.length - 1] + ".");
      wrap.append(canvas);
      var legend = element("div", "macro-legend");
      legend.setAttribute("role", "group");
      legend.setAttribute("aria-label", "Bật/tắt chỉ báo trong biểu đồ " + group.title);
      body.append(wrap, legend, element("p", "macro-chart-note", "Dữ liệu từ " + dates[0] + " đến " + dates[dates.length - 1] + ". Xem bảng chỉ báo để đọc giá trị và thông tin nguồn."));
      card.append(header, body);
      container.append(card);

      if (!window.Chart) {
        wrap.replaceChildren(element("div", "macro-empty-chart", "Không tải được thư viện biểu đồ. Dữ liệu vẫn có trong bảng bên dưới."));
        rendered += 1;
        return;
      }

      var datasets = members.map(function (entry) {
        var values = new Map(entry.points.map(function (point) { return [point.date, point.value]; }));
        var color = colorForIndicator(entry.item.key);
        return {
          label: entry.item.label,
          data: dates.map(function (date) { return values.has(date) ? values.get(date) : null; }),
          unit: entry.item.unit,
          yAxisID: "y_" + axisKey(entry.item.unit),
          borderColor: color,
          backgroundColor: color + "22",
          borderWidth: 1.7,
          pointRadius: dates.length > 80 ? 0 : 1.5,
          pointHoverRadius: 4,
          tension: 0.18,
          spanGaps: true,
        };
      });
      // animation màu đã theo Chart.defaults (applyChartTheme ở đầu hàm, có tôn trọng
      // prefers-reduced-motion). Legend canvas mặc định TẮT (display:false) — chú giải
      // DOM thật ở dưới (buildLegend) thay thế hoàn toàn, không dùng song song 2 legend.
      var chart = new window.Chart(canvas, {
        type: "line",
        data: { labels: dates, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          normalized: true,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return context.dataset.label + ": " + formatNumber(context.parsed.y, context.dataset.unit) + " " + context.dataset.unit;
                },
              },
            },
          },
          scales: chartScaleOptions(datasets),
        },
      });
      chartInstances.push(chart);
      buildLegend(legend, chart, datasets);
      rendered += 1;
    });

    if (!rendered) {
      container.append(element("div", "macro-empty-chart", "Chưa đủ lịch sử để vẽ biểu đồ. Cần ít nhất hai điểm dữ liệu hợp lệ cho một chuỗi."));
    }
  }

  function foreignMetric(label, value) {
    var card = element("div", "kpi");
    card.append(element("div", "kpi-label", label));
    card.append(element("div", "kpi-value", formatNumber(value, "tỷ đồng")));
    card.append(element("div", "kpi-sub", "tỷ đồng"));
    return card;
  }

  function renderForeign(snapshot) {
    var data = snapshot.foreign_flow || { status: "unavailable", reference_links: [] };
    var status = byId("foreign-status");
    var content = byId("foreign-content");
    content.replaceChildren();

    if (data.status === "available") {
      status.textContent = "Có dữ liệu";
      status.className = "badge-soft bs-green";
      var grid = element("div", "macro-kpi-grid");
      [
        ["Mua", data.buy_value_billion], ["Bán", data.sell_value_billion],
        ["Mua bán ròng", data.net_value_billion], ["Tích lũy 5 phiên", data.cumulative_5d_billion],
        ["Tích lũy 20 phiên", data.cumulative_20d_billion],
      ].forEach(function (metric) {
        if (metric[1] !== null && metric[1] !== undefined && Number.isFinite(Number(metric[1]))) {
          grid.append(foreignMetric(metric[0], Number(metric[1])));
        }
      });
      if (grid.childElementCount) content.append(grid);
      else content.append(element("p", "val-muted", "Dữ liệu được ghi nhận là có sẵn nhưng chưa có giá trị giao dịch để hiển thị."));
      return;
    }

    status.textContent = "Chưa có trong bản dữ liệu";
    status.className = "badge-soft bs-gray";
    var empty = element("div", "macro-foreign-empty");
    empty.append(icon("database-zap"));
    var copy = element("div");
    copy.append(element("h3", "", "Chưa có dữ liệu giao dịch khối ngoại trong bản dữ liệu"));
    copy.append(element("p", "", "Room ngoại còn lại không phải giá trị mua, bán hay mua bán ròng nên không được dùng để suy diễn dòng tiền."));
    var links = element("div", "macro-reference-links");
    (data.reference_links || []).forEach(function (item) {
      var link = externalLink("Xem " + item.label, item.url, "macro-reference-link");
      if (link.tagName === "A") link.append(icon("external-link"));
      links.append(link);
    });
    if (links.childElementCount) copy.append(links);
    empty.append(copy);
    content.append(empty);
  }

  function tableStatus(item) {
    var fresh = freshnessBadge(item);
    return element("span", "badge-soft " + fresh.className, fresh.text);
  }

  function td(content, className) {
    var cell = element("td", className || "");
    if (content instanceof Node) cell.append(content);
    else cell.textContent = content;
    return cell;
  }

  function renderTable(snapshot) {
    var body = byId("macro-table-body");
    body.replaceChildren();
    snapshot.indicators.forEach(function (item) {
      var row = element("tr");
      var name = element("span", "macro-table-indicator", item.label);
      var unit = element("span", "macro-table-sub", item.unit || "Không có đơn vị");
      var nameWrap = element("div");
      nameWrap.append(name, unit);
      var valueText = item.value === null ? "—" : formatNumber(item.value, item.unit) + " " + (item.unit || "");
      var delta = element("span", "macro-delta " + directionClass(item), deltaText(item));
      var source = externalLink(item.source || "—", item.source_url);
      row.append(
        td(nameWrap), td(valueText), td(delta), td(formatPeriod(item)),
        td(item.frequency_label || item.frequency || "—"), td(source),
        td(formatGeneratedAt(item.pipeline_updated_at || snapshot.pipeline_completed_at)), td(tableStatus(item))
      );
      body.append(row);
    });
    var quality = snapshot.quality || {};
    byId("table-summary").textContent = (quality.available_count || 0) + "/" +
      (quality.catalog_count || snapshot.indicators.length) + " chỉ báo có dữ liệu trong lần cập nhật này.";
  }

  function renderSnapshot(snapshot, source) {
    byId("snapshot-date").textContent = snapshot.data_as_of || "—";
    byId("pipeline-time").textContent = formatGeneratedAt(snapshot.pipeline_completed_at || snapshot.generated_at);
    var quality = snapshot.quality || {};
    if (quality.is_partial || quality.missing_count > 0) {
      setStatusBadge("Snapshot thiếu một phần", "bs-amber");
      setNotice("warning", "Snapshot đã tải nhưng còn " + quality.missing_count + " chỉ báo chưa có giá trị.", "triangle-alert");
    } else if (quality.stale_count > 0) {
      setStatusBadge("Có dữ liệu cần cập nhật", "bs-amber");
      setNotice("warning", "Đã tải " + quality.available_count + " chỉ báo. Có " + quality.stale_count + " chỉ báo vượt ngưỡng độ mới theo tần suất riêng.", "clock-alert");
    } else {
      setStatusBadge("Tải thành công", "bs-green");
      setNotice("success", "Đã tải " + quality.available_count + " chỉ báo từ " + (source === "json" ? "lần publish gần nhất" : "dữ liệu cục bộ") + ".", "circle-check");
    }
    renderKpis(snapshot);
    renderCharts(snapshot);
    renderForeign(snapshot);
    renderTable(snapshot);
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }

  function renderUnavailable(kind) {
    var invalid = kind === "invalid";
    setStatusBadge(invalid ? "Dữ liệu không hợp lệ" : "Chưa có dữ liệu", "bs-red");
    setNotice("error", invalid ? "Dữ liệu vĩ mô không hợp lệ nên chưa thể hiển thị. Vui lòng thử lại." : "Tạm chưa có dữ liệu vĩ mô cho phiên hiện tại.", "circle-x");
    byId("macro-kpis").replaceChildren(element("div", "macro-empty-chart", "Không có chỉ báo khả dụng để hiển thị."));
    byId("macro-charts").replaceChildren(element("div", "macro-empty-chart", "Chưa đủ dữ liệu lịch sử để vẽ biểu đồ."));
    byId("macro-table-body").replaceChildren((function () {
      var row = element("tr");
      var cell = element("td", "macro-table-empty", "Chưa có dữ liệu.");
      cell.colSpan = 8;
      row.append(cell);
      return row;
    })());
    byId("table-summary").textContent = "Không có chỉ báo hợp lệ trong lần tải này.";
    renderForeign({ foreign_flow: { status: "unavailable", reference_links: [] } });
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }

  async function init() {
    var result = await loadMacroData();
    if (!result.snapshot) {
      renderUnavailable("missing");
      return;
    }
    if (!validateSnapshot(result.snapshot)) {
      renderUnavailable("invalid");
      return;
    }
    renderSnapshot(result.snapshot, result.source);
  }

  // Guard typeof window/document: cho phép require() file này trong Node để unit
  // test các hàm thuần (colorForIndicator/countVisible/wouldHideLastVisible/...)
  // mà không cần DOM/Chart.js giả lập — cùng mẫu company-panel.js đã dùng.
  if (typeof window !== "undefined") {
    window.MacroPage = {
      loadMacroData: loadMacroData,
      validateSnapshot: validateSnapshot,
      renderSnapshot: renderSnapshot,
      formatPeriod: formatPeriod,
    };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      colorForIndicator: colorForIndicator,
      countVisible: countVisible,
      wouldHideLastVisible: wouldHideLastVisible,
      soleVisibleIndex: soleVisibleIndex,
      currentHiddenFlags: currentHiddenFlags,
      toggleDatasetVisibility: toggleDatasetVisibility,
      buildLegend: buildLegend,
      INDICATOR_COLORS: INDICATOR_COLORS,
      CHART_GROUPS: CHART_GROUPS,
    };
  }
})();
