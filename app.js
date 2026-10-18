(function () {
  "use strict";

  var DATA_URL = "data/latest.json";

  var IT_MAINT_RE =
    /電腦|投影|音響|喇叭|擴音|影音|螢幕|遙控|iPad|ipad|LED|顯示器|喇叭|mic|麥克風|amplifier|projector|TV|電視/;

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

  function isItMaintenance(r) {
    var blob = [r.category, r.issue, r.place, r.id].join(" ");
    return IT_MAINT_RE.test(blob);
  }

  function applyDisplayMode(data) {
    var next = isNextWorkday(data);
    var label = data.displayLabel || "";
    var banner = document.getElementById("displayBanner");
    var titleEl = document.getElementById("eq-title");
    var subEl = document.getElementById("eqSubtitle");

    if (next && label) {
      banner.textContent = label;
      banner.hidden = false;
      titleEl.textContent = "借器材";
      subEl.textContent = label;
      subEl.hidden = false;
    } else {
      banner.textContent = "";
      banner.hidden = true;
      titleEl.textContent = "借器材";
      subEl.textContent = "";
      subEl.hidden = true;
    }
  }

  function renderEquipment(list, nextMode) {
    var el = document.getElementById("equipmentBody");
    var countEl = document.getElementById("eqCount");
    list = list || [];
    countEl.textContent = String(list.length);
    if (!list.length) {
      el.innerHTML = emptyHtml(
        nextMode ? "該日暫無借器材" : "今日暫無借器材"
      );
      return;
    }
    el.innerHTML = list
      .map(function (r) {
        return (
          '<article class="item-card">' +
          '<div class="card-top">' +
          '<span class="card-period">' +
          esc(r.period || "—") +
          "</span>" +
          '<span class="card-item">' +
          esc(r.item || "—") +
          "</span>" +
          "</div>" +
          '<div class="card-who">' +
          esc(r.who || "—") +
          "</div>" +
          (r.note
            ? '<div class="card-note">' + esc(r.note) + "</div>"
            : "") +
          "</article>"
        );
      })
      .join("");
  }

  function renderMaintenance(list) {
    var el = document.getElementById("maintenanceBody");
    var countEl = document.getElementById("maintCount");
    list = (list || []).filter(isItMaintenance);
    countEl.textContent = String(list.length);
    if (!list.length) {
      el.innerHTML = emptyHtml("暫無電腦／投影機／音響維修");
      return;
    }
    el.innerHTML = list
      .map(function (r) {
        return (
          '<article class="item-card">' +
          '<div class="card-top">' +
          '<span class="card-id">' +
          esc(r.id || "") +
          "</span>" +
          '<span class="status-pill">' +
          esc(r.status || "跟進中") +
          "</span>" +
          "</div>" +
          '<div class="card-item">' +
          esc(r.issue || "—") +
          "</div>" +
          '<div class="card-who">' +
          esc(r.place || "—") +
          "</div>" +
          (r.category
            ? '<div class="card-note">' + esc(r.category) + "</div>"
            : "") +
          "</article>"
        );
      })
      .join("");
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
    badge.hidden = !data.isExample;
    applyDisplayMode(data);
    var next = isNextWorkday(data);
    renderEquipment(data.equipment, next);
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
            "）。"
        );
        renderEquipment([]);
        renderMaintenance([]);
      });
  }

  load();
})();
