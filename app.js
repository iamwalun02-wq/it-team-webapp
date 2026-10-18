(function () {
  "use strict";

  var DATA_URL = "data/latest.json";

  function esc(s) {
    if (s == null || s === "") return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUpdatedAt(iso) {
    if (!iso) return "更新時間不詳";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return esc(iso);
      return (
        "更新：" +
        d.toLocaleString("zh-HK", {
          timeZone: "Asia/Hong_Kong",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    } catch (e) {
      return "更新：" + esc(iso);
    }
  }

  function emptyHtml(msg) {
    return '<div class="empty">' + esc(msg) + "</div>";
  }

  function isNextWorkday(data) {
    return data && data.displayMode === "next_workday";
  }

  function setSectionTitle(titleId, subtitleId, titleText, subtitleText) {
    var titleEl = document.getElementById(titleId);
    var subEl = document.getElementById(subtitleId);
    if (titleEl) titleEl.textContent = titleText;
    if (!subEl) return;
    if (subtitleText) {
      subEl.textContent = subtitleText;
      subEl.hidden = false;
    } else {
      subEl.textContent = "";
      subEl.hidden = true;
    }
  }

  function applyDisplayMode(data) {
    var next = isNextWorkday(data);
    var label = data.displayLabel || "";
    var banner = document.getElementById("displayBanner");

    if (next && label) {
      banner.textContent = label;
      banner.hidden = false;
    } else {
      banner.textContent = "";
      banner.hidden = true;
    }

    if (next) {
      setSectionTitle(
        "eq-title",
        "eqSubtitle",
        "工作天課室器材借用",
        label || null
      );
      setSectionTitle(
        "venue-title",
        "venueSubtitle",
        "工作天場地借用",
        label || null
      );
    } else {
      setSectionTitle("eq-title", "eqSubtitle", "今日課室器材借用", null);
      setSectionTitle("venue-title", "venueSubtitle", "今日場地借用", null);
    }
  }

  function renderEquipment(list, nextMode) {
    var el = document.getElementById("equipmentBody");
    var countEl = document.getElementById("eqCount");
    list = list || [];
    countEl.textContent = String(list.length);
    if (!list.length) {
      el.innerHTML = emptyHtml(
        nextMode ? "該日暫無器材借用" : "今日暫無器材借用"
      );
      return;
    }
    var rows = list
      .map(function (r) {
        var note = r.note ? esc(r.note) : "—";
        return (
          "<tr>" +
          '<td class="period">' +
          esc(r.period) +
          "</td>" +
          '<td class="item">' +
          esc(r.item) +
          "</td>" +
          '<td class="who">' +
          esc(r.who) +
          "</td>" +
          '<td class="note">' +
          note +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    el.innerHTML =
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>時段</th><th>器材</th><th>對象</th><th>備註</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>";
  }

  function renderVenues(list, nextMode) {
    var el = document.getElementById("venuesBody");
    var countEl = document.getElementById("venueCount");
    list = list || [];
    countEl.textContent = String(list.length);
    if (!list.length) {
      el.innerHTML = emptyHtml(
        nextMode ? "該日暫無場地借用" : "今日暫無場地借用"
      );
      return;
    }
    var rows = list
      .map(function (r) {
        var note = r.note ? esc(r.note) : "—";
        return (
          "<tr>" +
          '<td class="time">' +
          esc(r.time) +
          "</td>" +
          '<td class="venue">' +
          esc(r.venue) +
          "</td>" +
          '<td class="event">' +
          esc(r.event) +
          "</td>" +
          '<td class="note">' +
          note +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    el.innerHTML =
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>時段</th><th>場地</th><th>活動</th><th>備註</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>";
  }

  function renderMaintenance(list) {
    var el = document.getElementById("maintenanceBody");
    var countEl = document.getElementById("maintCount");
    list = list || [];
    countEl.textContent = String(list.length);
    if (!list.length) {
      el.innerHTML = emptyHtml("暫無跟進中維修");
      return;
    }
    var rows = list
      .map(function (r) {
        return (
          "<tr>" +
          '<td class="id-cell">' +
          esc(r.id) +
          "</td>" +
          "<td>" +
          esc(r.place) +
          "</td>" +
          "<td>" +
          esc(r.issue) +
          (r.category
            ? '<br><span style="color:#667085;font-size:0.8rem">' +
              esc(r.category) +
              "</span>"
            : "") +
          "</td>" +
          '<td><span class="status-pill">' +
          esc(r.status || "跟進中") +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
    el.innerHTML =
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>編號</th><th>地點</th><th>問題</th><th>狀態</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>";
  }

  function showError(msg) {
    var banner = document.getElementById("errorBanner");
    banner.textContent = msg;
    banner.classList.add("visible");
  }

  function applyData(data) {
    document.getElementById("updatedAt").textContent = formatUpdatedAt(
      data.updatedAt
    );
    var badge = document.getElementById("exampleBadge");
    if (data.isExample) {
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    applyDisplayMode(data);
    var next = isNextWorkday(data);
    renderEquipment(data.equipment, next);
    renderVenues(data.venues, next);
    renderMaintenance(data.maintenance);
  }

  function load() {
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(applyData)
      .catch(function (err) {
        document.getElementById("updatedAt").textContent = "無法載入資料";
        showError(
          "讀取 data/latest.json 失敗（" +
            (err && err.message ? err.message : "未知錯誤") +
            "）。請用本機伺服器開啟，或檢查 JSON 路徑。"
        );
        renderEquipment([]);
        renderVenues([]);
        renderMaintenance([]);
      });
  }

  load();
})();
