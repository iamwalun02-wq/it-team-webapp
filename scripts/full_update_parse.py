# -*- coding: utf-8 -*-
from pathlib import Path
import re, json, html
from datetime import datetime
from zoneinfo import ZoneInfo

HK = ZoneInfo("Asia/Hong_Kong")
# Priority eight — always listed first (rank 1–8). Others follow.
PRIORITY_STAFF = [
    ("ngkf", "吳國鋒"),
    ("ipch", "葉志濠"),
    ("tolina", "陶理諾"),
    ("leeoz", "李靄晴"),
    ("lungyw", "龍躍雲"),
    ("tangwl", "鄧偉林"),
    ("manyc", "文婉貞"),
    ("ngks", "吳啟舜"),
]
PRIORITY_RANK = {sid: i + 1 for i, (sid, _) in enumerate(PRIORITY_STAFF)}
PRIORITY_NAME = {sid: name for sid, name in PRIORITY_STAFF}
# Back-compat alias
STAFF = list(PRIORITY_STAFF)
WEEKDAYS = "一二三四五六日"

def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)

def cell_text(td):
    return strip_tags(td).strip()

def period_rank(period):
    if not period: return 9000
    s = str(period).upper().replace(" ", "")
    if s.startswith("全日"): return -1
    if s.startswith("AS") or "AFTERSCHOOL" in s: return 8000
    if s.startswith("CL"): return 7000
    if s.startswith("LH") or "LUNCH" in s: return 5500
    if s.startswith("RS") or "RECESS" in s: return 3500
    m = re.search(r"P\s*(\d+)", s)
    if m:
        n = int(m.group(1))
        return {0:0,1:1000,2:2000,3:3000,4:4000,5:5000,6:6000,7:6500,8:6800}.get(n, 1000+n*100)
    return 8500

def normalize_period(p):
    p = (p or "").strip().replace(",", "–").replace("、", "–")
    p = re.sub(r"\s*–\s*", "–", p)
    return re.sub(r"\s+", "", p)

def earliest_period(period):
    s = normalize_period(period)
    return s.split("–")[0] if s else s

def is_all_day_period(p):
    s = normalize_period(p)
    return s.startswith("P0") and "AS" in s and s.count("P") >= 5

def parse_one_time(tok):
    tok = tok.strip().replace("：", ":").replace(".", ":")
    if re.fullmatch(r"\d{1,2}:\d{2}", tok):
        a,b = tok.split(":"); h,m = int(a), int(b)
        if 0 <= h <= 23 and 0 <= m <= 59: return f"{h:02d}:{m:02d}"
    if re.fullmatch(r"\d{4}", tok):
        h,m = int(tok[:2]), int(tok[2:])
        if 0 <= h <= 23 and 0 <= m <= 59: return f"{h:02d}:{m:02d}"
    if re.fullmatch(r"[7-9]\d{2}", tok):
        h,m = int(tok[0]), int(tok[1:])
        if m <= 59: return f"{h:02d}:{m:02d}"
    return None

def extract_clock(s):
    s = s or ""
    pat = re.compile(r"(\d{1,2}[:：.]\d{2}|\d{4}|[7-9]\d{2})\s*[-–~〜至到]\s*(\d{1,2}[:：.]\d{2}|\d{4}|[7-9]\d{2})")
    found = None
    for m in pat.finditer(s):
        a = parse_one_time(m.group(1).replace("：",":").replace(".",":"))
        b = parse_one_time(m.group(2).replace("：",":").replace(".",":"))
        if a and b:
            found = f"{a}–{b}"
    return found or ""

def parse_staff(text):
    """Parse ALL staff rows from 教職員在校情況 (Choice=X).

    Returns list of dicts: id, name, role, raw (在校/沒回校/已離校/---).
    """
    out = []
    seen = set()
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr\s*>", text, re.I | re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td\s*>", tr, re.I | re.S)
        if len(tds) < 3:
            continue
        role_login = cell_text(tds[0]).replace("\n", " ").strip()
        name = cell_text(tds[1]).replace("\n", " ").strip()
        raw = cell_text(tds[2]).replace("\n", " ").strip()
        m = re.match(r"^(.+?)-([A-Za-z0-9_]+)$", role_login)
        if not m:
            continue
        role, sid = m.group(1).strip(), m.group(2).strip()
        if not sid or sid in seen:
            continue
        if not name or name in ("姓名", "-"):
            continue
        seen.add(sid)
        out.append({"id": sid, "name": name, "role": role, "raw": raw})
    # Guarantee priority eight even if a row was missing from HTML
    have = {r["id"] for r in out}
    for sid, name in PRIORITY_STAFF:
        if sid not in have:
            out.append({"id": sid, "name": name, "role": "", "raw": None})
    return out

def map_status(raw):
    if not raw:
        return "不在校"
    s = str(raw).strip()
    if s in ("---", "-", "—"):
        return "不在校"
    return "在校" if ("在校" in s and "沒" not in s and "離" not in s) else "不在校"

def staff_sort_key(row):
    pr = row.get("priority")
    if pr is None:
        pr = 9999
    return (pr, row.get("name") or "", row.get("id") or "")

def build_staff_presence(raw_rows, prev_staff, same_day, checked_at, approx_time):
    """Merge scraped rows with previous arrivedAt; return (staff_out, first_arrivals)."""
    prev_map = {s["id"]: s for s in (prev_staff or [])}
    first_arrivals = []
    staff_out = []
    for row in raw_rows:
        sid = row["id"]
        name = row.get("name") or PRIORITY_NAME.get(sid) or sid
        st = map_status(row.get("raw"))
        old = prev_map.get(sid) or {}
        arrived = old.get("arrivedAt") if same_day else None
        if st == "在校":
            if not arrived:
                arrived = checked_at
                first_arrivals.append([name, approx_time, sid])
        else:
            # Keep first-arrival time for the day even after leave
            arrived = old.get("arrivedAt") if (same_day and old.get("arrivedAt")) else None
        pr = PRIORITY_RANK.get(sid)
        staff_out.append({
            "id": sid,
            "name": name,
            "role": row.get("role") or old.get("role") or "",
            "status": st,
            "arrivedAt": arrived,
            "checkedAt": checked_at,
            "priority": pr,  # 1–8 for priority eight; null for others
        })
    staff_out.sort(key=staff_sort_key)
    return staff_out, first_arrivals

def parse_equipment(text):
    body = re.search(r"<table[^>]*>(.*?)</table>", text, re.I|re.S).group(1)
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr\s*>", body, re.I|re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td\s*>", tr, re.I|re.S)
        if len(tds) < 8: continue
        lines = [ln.strip() for ln in cell_text(tds[0]).split("\n") if ln.strip()]
        if not lines: continue
        item_name = lines[0]
        if len(lines) >= 2:
            cand = re.match(r"^([^\[\]]+)", lines[1])
            cand = (cand.group(1) if cand else lines[1]).strip()
            if re.search(r"[\u4e00-\u9fff]", cand): item_name = cand
        qty, period, who = cell_text(tds[2]), normalize_period(cell_text(tds[3])), cell_text(tds[4])
        place, remark, approval = cell_text(tds[5]), cell_text(tds[6]).strip(), cell_text(tds[7])
        if not who or not period or period.startswith("2026") or not re.search(r"[A-Za-z]", who): continue
        item = f"{item_name} ×{qty}" if qty.isdigit() else item_name
        place_norm = place.replace(" / ", "／").replace("技術員送、技術員收", "技術員送收").replace("自已取、自已還", "自己取還")
        note_parts = [place_norm] if place_norm else []
        if approval and approval not in ("---","-",""): note_parts.append(approval)
        if remark in ("---","-","—"): remark = ""
        rows.append({"period": period, "item": item, "who": who, "note": "；".join(note_parts), "remark": remark})
    rows.sort(key=lambda e: (period_rank(earliest_period(e["period"])), e["period"], e["who"], e["item"]))
    return rows

def parse_venues(text):
    body = re.search(r"<table[^>]*>(.*?)</table>", text, re.I|re.S).group(1)
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr\s*>", body, re.I|re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td\s*>", tr, re.I|re.S)
        if len(tds) < 5: continue
        cells = [cell_text(td) for td in tds]
        venue_code = ([ln.strip() for ln in cells[0].split("\n") if ln.strip()] or [cells[0]])[0]
        if venue_code == "場地" or "借用時段" in (cells[1] or ""): continue
        period_raw, who, gear, remark = cells[1], cells[2], cells[3], cells[4]
        approval = cells[6] if len(cells) > 6 else ""
        admin = cells[7] if len(cells) > 7 else ""
        if not who: continue
        remark_flat = remark.replace("\n", "")
        parts = [p.strip() for p in re.split(r"[;；]", remark_flat) if p.strip()]
        clock = extract_clock(remark_flat)
        if venue_code == "CR":
            if parts and re.match(r"^[\d,\-–／/\s]+$", parts[0]):
                venue = parts[0].replace(",", "／").replace("/", "／").replace(" ", "")
                rest = parts[1:]
            else:
                venue, rest = "CR", parts
            event_bits = []
            for p in rest:
                if extract_clock(p) and re.fullmatch(r"[\d:：.\s\-–~〜至到]+", p):
                    continue
                p2 = re.sub(r"(\d{1,2}[:：.]\d{2}|\d{4}|[7-9]\d{2})\s*[-–~〜至到]\s*(\d{1,2}[:：.]\d{2}|\d{4}|[7-9]\d{2})", "", p).strip()
                if p2: event_bits.append(p2)
            event = "；".join(event_bits)
            event = event.replace("一人一體藝_", "一人一體藝：").replace("一人一體藝:", "一人一體藝：")
        else:
            venue = venue_code
            event = parts[0] if parts else remark
            if venue_code == "Lobby" and "普通話" in remark: event = "普通話電視"
            if "摸擬" in event: event = event.replace("摸擬", "模擬")
        if is_all_day_period(period_raw):
            time = "全日"
        else:
            period = normalize_period(period_raw)
            time = f"{period} {clock}".strip() if clock else period
        note_bits = [who]
        if approval == "未能借用":
            dest = re.sub(r"^轉用?", "", admin).strip() if admin and admin not in ("---","-") else ""
            note_bits.append(f"未能借用→轉 {dest}" if dest else "未能借用")
        elif admin and admin not in ("---","-",""):
            note_bits.append(admin)
        if who == "chukl" and ("電腦" in gear or "LED" in gear):
            note_bits = [who, "電腦／LED"]
        rows.append({"time": time, "venue": venue, "event": event, "note": "；".join(note_bits)})
    rows.sort(key=lambda r: (period_rank(earliest_period((r["time"].split() or [""])[0])), r["time"], r["venue"]))
    return rows

def clean_issue(s):
    s = html.unescape(s or "")
    s = re.sub(r"&#\d+;?", "", s)
    s = re.sub(r"[\U00010000-\U0010ffff]", "", s)
    return s.strip(" ，,")

def parse_maintenance(text):
    rows = []
    # both follow-up colors
    for tr in re.findall(r"<tr[^>]*(?:bgcolor=#CCFFFF|bgcolor=#FFFF99)[^>]*>(.*?)</tr\s*>", text, re.I|re.S):
        fm = re.search(r"#(\d+):(.*?)</font>", tr, re.I|re.S)
        if not fm: continue
        cid, block = fm.group(1), fm.group(2)
        lines = [strip_tags(x).strip() for x in re.split(r"<br\s*/?>", block, flags=re.I)]
        lines = [re.split(r"刪除|修改|上載", ln)[0].strip() for ln in lines]
        lines = [ln for ln in lines if ln]
        place = cat = issue = ""
        if len(lines) >= 2:
            pc = lines[1]
            pm = re.match(r"(.*?)\s*-\s*(\S+)\s*$", pc)
            if pm:
                place = re.sub(r"\s+", " ", pm.group(1)).strip()
                place = re.sub(r"\s*-\s*", " - ", place)
                place = re.sub(r"([A-Za-z0-9])\s+課室", r"\1課室", place)
                place = place.replace("課室 (", "課室(")
                place = re.sub(r"(\d)\s+樓", r"\1樓", place)
                cat = pm.group(2).strip()
            else:
                place = pc.strip()
        if len(lines) >= 3:
            im = re.match(r"[^:]+:\s*(.*)", lines[2], re.S)
            issue = clean_issue(im.group(1) if im else lines[2])
        if cid == "11209": issue = "空氣清新機開啟後沒有風、閃 L 燈"
        if cid == "11283": issue = "課室後方鮮風機有怪聲"
        if "搖控" in issue: issue = issue.replace("搖控", "遙控")
        status = "跟進中" if "跟進中" in tr else "待跟進"
        rows.append({"id": f"#{cid}", "place": place, "issue": issue, "status": status, "category": cat})
    return rows

def main():
    now = datetime.now(HK)
    today_s = now.strftime("%Y-%m-%d")
    checked_at = now.strftime("%Y-%m-%dT%H:%M:%S") + now.strftime("%z")
    checked_at = checked_at[:-2] + ":" + checked_at[-2:]
    approx_time = now.strftime("%H:%M")
    staff = Path("/tmp/it_staff.bin.utf8").read_text()
    equip = Path("/tmp/it_equip.bin.utf8").read_text()
    venue = Path("/tmp/it_venue_day.utf8").read_text()
    maint = Path("/tmp/it_maint.bin.utf8").read_text()
    prev_path = Path("/workspace/it-team-webapp/data/latest.json")
    prev = json.loads(prev_path.read_text()) if prev_path.exists() else {}
    prev_staff_list = prev.get("staffPresence") or []
    same_day = prev.get("calendarDate") == today_s
    # 週末／假期：保留已有首次到校時間（唔開新一日追蹤）
    same_day_for_staff = same_day or (now.weekday() >= 5)
    raw_rows = parse_staff(staff)
    staff_out, first_arrivals = build_staff_presence(
        raw_rows, prev_staff_list, same_day_for_staff, checked_at, approx_time
    )
    wd = WEEKDAYS[now.weekday()]
    cal_tag = ""
    try:
        for line in Path("/cursor/stores/store-8cd4716e-07ec-44cf-b5ba-98566dcec2d1/calendar-2026-2027.md").read_text(encoding="utf-8").splitlines():
            if line.startswith(today_s):
                rest = line[len(today_s):].strip()
                tok = (rest.split() or [""])[0]
                if tok and tok not in ("周末",):
                    cal_tag = tok
                break
    except Exception:
        pass
    label = f"{now.month}/{now.day}（{wd}）" + (f" {cal_tag}" if cal_tag else "")
    data = {
        "updatedAt": checked_at,
        "source": "intranet.cchpwss.edu.hk",
        "isExample": False,
        "calendarDate": today_s,
        "displayDate": today_s,
        "displayLabel": label.strip(),
        "displayMode": "today",
        "equipment": parse_equipment(equip),
        "venues": parse_venues(venue),
        "maintenance": parse_maintenance(maint),
        "staffPresence": staff_out,
    }
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    paths = [
        Path("/workspace/it-team-webapp/data/latest.json"),
        Path("/cursor/stores/store-8cd4716e-07ec-44cf-b5ba-98566dcec2d1/intranet-webapp/data/latest.json"),
    ]
    for p in paths:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(payload, encoding="utf-8")
            print("wrote", p)
        except Exception as e:
            print("write_fail", p, e)
    old_meta_p = Path("/tmp/it_update_meta.json")
    meta = {"first_arrivals": first_arrivals, "approx_time": approx_time, "checked_at": checked_at,
            "counts": {"equipment": len(data["equipment"]), "venues": len(data["venues"]), "maintenance": len(data["maintenance"]), "staff": len(staff_out)}}
    if not first_arrivals and old_meta_p.exists():
        old = json.loads(old_meta_p.read_text())
        if old.get("first_arrivals"):
            meta["first_arrivals"] = old["first_arrivals"]
    old_meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print("bad", [v for v in data["venues"] if re.search(r"AS 0[0-6]:", v["time"])])
    print("maint", [m["id"] for m in data["maintenance"]])

if __name__ == "__main__":
    main()
