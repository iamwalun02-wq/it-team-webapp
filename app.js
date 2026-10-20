(function () {
  "use strict";

  var DATA_URL = "data/latest.json?v=20261020c";

  var IT_MAINT_RE =
    /電腦|投影|音響|喇叭|擴音|影音|螢幕|遙控|iPad|ipad|LED|顯示器|mic|麥克風|amplifier|projector|TV|電視/;

  var IGNORE_MAINT_RE =
    /空氣清新|清新機|冷氣|空調|微波爐|雪櫃|冰箱|洗衣機|抽濕|風扇|鮮風|電熱水|雪櫃|雪種|抽油煙|雪櫃/;

  function nlToBr(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

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
    if (IGNORE_MAINT_RE.test(blob)) return false;
    // 以問題／類別為準；唔好因為「電腦室」地點就當 IT（避免家電誤中）
    var core = [r.category, r.issue].join(" ");
    return IT_MAINT_RE.test(core);
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

  // School order: P0→P1–P3→RS→P4–P5→LH→P6–P8→CL→AS; ranges use earliest
  function periodRank(period) {
    if (period == null || period === "") return 9000;
    var s = String(period).toUpperCase().replace(/\s+/g, "");
    if (s.indexOf("AS") === 0 || s.indexOf("AFTERSCHOOL") !== -1)
      return 8000;
    if (s.indexOf("CL") === 0) return 7000;
    if (s.indexOf("LH") === 0 || s.indexOf("LUNCH") !== -1) return 5500;
    if (s.indexOf("RS") === 0 || s.indexOf("RECESS") !== -1) return 3500;
    var m = s.match(/P\s*(\d+)/);
    if (m) {
      var n = parseInt(m[1], 10);
      var map = {
        0: 0,
        1: 1000,
        2: 2000,
        3: 3000,
        4: 4000,
        5: 5000,
        6: 6000,
        7: 6500,
        8: 6800,
      };
      return map.hasOwnProperty(n) ? map[n] : 1000 + n * 100;
    }
    return 8500;
  }

  function sortEquipment(list) {
    return (list || []).slice().sort(function (a, b) {
      var ra = periodRank(a && a.period);
      var rb = periodRank(b && b.period);
      if (ra !== rb) return ra - rb;
      var pa = String((a && a.period) || "");
      var pb = String((b && b.period) || "");
      if (pa !== pb) return pa < pb ? -1 : 1;
      var wa = String((a && a.who) || "");
      var wb = String((b && b.who) || "");
      if (wa !== wb) return wa < wb ? -1 : 1;
      return 0;
    });
  }


  // Pull booking remarks (指定機／英文備註) out of note for a louder card block
  function splitEquipNote(r) {
    var remark = (r && r.remark) || "";
    var note = (r && r.note) || "";
    var REMARK_RE = /指定|Please\s+arrange|B\d{1,3}\s*[-–]\s*\d{1,3}|特定/i;
    if (!remark && note) {
      var parts = note.split(/[；;]/);
      var keep = [];
      var found = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p) continue;
        if (REMARK_RE.test(p)) found.push(p);
        else keep.push(p);
      }
      if (found.length) {
        remark = found.join("；");
        note = keep.join("；");
      }
    }
    return { note: note, remark: remark };
  }


  function itemCardClass(r) {
    return r && r.cancelled ? "item-card item-card--cancelled" : "item-card";
  }

  function renderEquipment(list, nextMode) {
    var el = document.getElementById("equipmentBody");
    var countEl = document.getElementById("eqCount");
    list = sortEquipment(list || []);
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
          '<article class="' + itemCardClass(r) + '">' +
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
          (function () {
            var sn = splitEquipNote(r);
            return (
              (sn.note
                ? '<div class="card-note">' + esc(sn.note) + "</div>"
                : "") +
              (sn.remark
                ? '<div class="card-remark"><span class="card-remark-label">備註</span>' +
                  nlToBr(sn.remark) +
                  "</div>"
                : "")
            );
          })() +
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


  function formatArrived(v) {
    if (!v) return "—";
    try {
      var d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("zh-HK", {
          timeZone: "Asia/Hong_Kong",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    } catch (e) {}
    // already a time string like "08:12"
    return String(v);
  }

  function renderStaff(list) {
    var el = document.getElementById("staffBody");
    if (!el) return;
    list = list || [];
    if (!list.length) {
      el.innerHTML = emptyHtml("暫未有在校資料");
      return;
    }
    el.innerHTML = list
      .map(function (r) {
        var inSchool = r.status === "在校";
        var pillClass = inSchool ? "in" : "out";
        var status = inSchool ? "在校" : "不在校";
        return (
          '<article class="staff-card">' +
          '<div class="staff-name">' +
          esc(r.name || r.id || "—") +
          "</div>" +
          '<div class="staff-arrived">到校 <strong>' +
          esc(formatArrived(r.arrivedAt)) +
          "</strong></div>" +
          '<span class="status-pill ' +
          pillClass +
          '">' +
          esc(status) +
          "</span>" +
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
    renderStaff(data.staffPresence);
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
        renderStaff([]);
      });
  }

  load();
})();
