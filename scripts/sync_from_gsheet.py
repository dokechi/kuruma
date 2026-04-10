import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import gspread


SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "1qJHYJ4rE8R-nnZPuXSkzP-kYHuZVO8_8")
WORKSHEET_GID = int(os.environ.get("WORKSHEET_GID", "699666833"))

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def now_jst_iso():
    jst = timezone(timedelta(hours=9))
    return datetime.now(jst).isoformat(timespec="seconds")


def parse_amount(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "").replace("¥", "").replace("円", "").replace(" ", "")
    if text in {"-", "—", "ナシ", "不明", "未記入"}:
        return None
    m = re.search(r"-?\d+", text)
    if not m:
        return None
    try:
        return int(m.group(0))
    except ValueError:
        return None


def normalize_header(text):
    return re.sub(r"\s+", "", (text or "").strip())


def pick(row, normalized_keys, contains=None):
    for k, v in row.items():
        nk = normalize_header(k)
        if nk in normalized_keys:
            return v
        if contains and any(token in nk for token in contains):
            return v
    return ""


def infer_status(row, section, month_headers):
    raw_text = " ".join(str(v) for v in row.values() if v)
    if "廃車" in raw_text:
        return "廃車"
    if section == "trade":
        return "売却済"
    if pick(row, {"売却先"}) or pick(row, {"売却"}) or pick(row, {"売却益"}):
        return "売却済"
    monthly_values = [parse_amount(row.get(h, "")) for h in month_headers]
    if any(v for v in monthly_values):
        return "稼働中"
    return "要確認"


def current_monthly(row, month_headers):
    values = [parse_amount(row.get(h, "")) for h in month_headers]
    nums = [v for v in values if isinstance(v, int)]
    return nums[-1] if nums else 0


def build_vehicle(row, section, month_headers, counter):
    name = pick(row, {"名前"})
    chassis = pick(row, {"車体ナンバー"}, contains=["車体ナンバー"])
    reg = pick(row, {"登録番号"}, contains=["登録番号"])
    old_no = pick(row, {"旧"})
    new_no = pick(row, {"新"})
    purchase_date = pick(row, {"購入年月日"}, contains=["購入年月日"])
    sale_to = pick(row, {"売却先"})
    purchase_amount = parse_amount(pick(row, {"取得"}))
    sale_amount = parse_amount(pick(row, {"売却"}))
    profit = parse_amount(pick(row, {"売却益"}))
    recycle_in = parse_amount(pick(row, {"仕入ﾘｻｲｸﾙ"}, contains=["仕入", "ﾘｻｲｸﾙ"]))
    recycle_out = parse_amount(pick(row, {"売上ﾘｻｲｸﾙ"}, contains=["売上", "ﾘｻｲｸﾙ"]))
    insurance = parse_amount(pick(row, {"保険"}))
    inner_purchase = parse_amount(pick(row, set(), contains=["内仕入価格"]))
    status = infer_status(row, section, month_headers)
    monthly = {}
    for h in month_headers:
        amt = parse_amount(row.get(h, ""))
        if amt:
            monthly[h] = amt
    return {
        "id": f"{'R' if section == 'rental' else 'T'}-{counter:03d}",
        "category": section,
        "status": status,
        "purchaseDate": purchase_date,
        "oldNo": old_no,
        "newNo": new_no,
        "name": name,
        "chassisNo": chassis,
        "registrationNo": reg,
        "currentMonthly": current_monthly(row, month_headers),
        "monthlyRates": monthly,
        "saleTo": sale_to,
        "purchaseAmount": purchase_amount,
        "saleAmount": sale_amount,
        "profit": profit,
        "recycleIn": recycle_in,
        "recycleOut": recycle_out,
        "insurance": insurance,
        "innerPurchase": inner_purchase,
        "note": "",
    }


def load_rows():
    gc = gspread.service_account(filename=os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
    sh = gc.open_by_key(SPREADSHEET_ID)
    target = None
    for ws in sh.worksheets():
        if ws.id == WORKSHEET_GID:
            target = ws
            break
    if target is None:
        raise RuntimeError(f"gid={WORKSHEET_GID} のシートが見つかりません")
    rows = target.get_all_values()
    if not rows:
        raise RuntimeError("シートが空です")
    headers = rows[0]
    data_rows = []
    for raw in rows[1:]:
        padded = raw + [""] * max(0, len(headers) - len(raw))
        data_rows.append(dict(zip(headers, padded)))
    return headers, data_rows


def build_data():
    headers, rows = load_rows()
    month_headers = [h for h in headers if re.fullmatch(r"\d+月", (h or "").strip())]
    vehicles = []
    section = "rental"
    count_r = 0
    count_t = 100
    for row in rows:
        first = (list(row.values())[0] if row else "").strip()
        raw_text = " ".join(str(v).strip() for v in row.values() if str(v).strip())
        if not raw_text:
            continue
        if first.startswith("レンタル計"):
            section = "trade"
            continue
        if first.startswith("総仕入") or first.startswith("車両仕入税込") or first.startswith("税抜") or first.startswith("レンタル税込"):
            continue
        if first.startswith("この番号以降"):
            continue
        name = pick(row, {"名前"})
        chassis = pick(row, {"車体ナンバー"}, contains=["車体ナンバー"])
        reg = pick(row, {"登録番号"}, contains=["登録番号"])
        if not any([name, chassis, reg]):
            continue
        if section == "rental":
            count_r += 1
            vehicles.append(build_vehicle(row, section, month_headers, count_r))
        else:
            count_t += 1
            vehicles.append(build_vehicle(row, section, month_headers, count_t))

    active = [v for v in vehicles if v["status"] == "稼働中"]
    sold = [v for v in vehicles if v["status"] == "売却済"]
    scrapped = [v for v in vehicles if v["status"] == "廃車"]
    needs = [v for v in vehicles if v["status"] == "要確認"]

    summary = {
        "totalVehicles": len(vehicles),
        "activeCount": len(active),
        "soldCount": len(sold),
        "scrappedCount": len(scrapped),
        "needsReviewCount": len(needs),
        "currentMonthlySum": sum(v["currentMonthly"] or 0 for v in active),
        "totalPurchase": sum(v["purchaseAmount"] or 0 for v in vehicles),
        "totalSale": sum(v["saleAmount"] or 0 for v in vehicles),
        "totalProfit": sum(v["profit"] or 0 for v in vehicles),
        "rentalCount": len([v for v in vehicles if v["category"] == "rental"]),
        "tradeCount": len([v for v in vehicles if v["category"] == "trade"]),
    }
    meta = {
        "title": "レンタカー台帳ダッシュボード",
        "repoMode": "github-pages-root",
        "source": f"google-sheet:{SPREADSHEET_ID}:{WORKSHEET_GID}",
        "refreshedAt": now_jst_iso(),
        "sheetLinked": True,
        "notes": "GitHub Actions で Google スプレッドシートから自動同期したJSONです。"
    }
    return vehicles, summary, meta


def main():
    DATA_DIR.mkdir(exist_ok=True)
    vehicles, summary, meta = build_data()
    (DATA_DIR / "vehicles.json").write_text(json.dumps(vehicles, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote data/*.json")


if __name__ == "__main__":
    main()
