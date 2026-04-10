from __future__ import annotations

import json
import os
import re
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"

DEFAULT_SPREADSHEET_ID = "1qJHYJ4rE8R-nnZPuXSkzP-kYHuZVO8_8"
DEFAULT_WORKSHEET_GID = "699666833"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
MONTH_PRIORITY = ["10月", "11月", "12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月"]
SKIP_ROW_MARKERS = [
    "レンタル計",
    "総仕入",
    "総売上",
    "車両仕入税込",
    "車両売上税込",
    "レンタル税込",
    "レンタル売上税込",
    "税抜",
    "税抜き",
    "この番号以降1つの冊子で管理中",
    "取得、支払い、全て一括管理",
    "#REF!",
]


def getenv(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None:
        raise RuntimeError(f"Environment variable '{name}' is required")
    return value


def compact(text: str | None) -> str:
    if text is None:
        return ""
    text = str(text)
    text = text.replace("\u3000", " ").replace("\n", " ").replace("\r", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_header(text: str | None) -> str:
    text = compact(text)
    text = text.replace("（", "(").replace("）", ")")
    return text


def parse_number(value: str | None) -> int | None:
    text = compact(value)
    if not text:
        return None
    lowered = text.lower()
    if text in {"未記入", "ナシ", "不明", "廃車", "売ってあげた"}:
        return None
    if "#ref!" in lowered:
        return None
    match = re.search(r"-?\d[\d,]*", text)
    if not match:
        return None
    return int(match.group(0).replace(",", ""))


def parse_date(value: str | None) -> str | None:
    text = compact(value)
    if not text:
        return None
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def looks_like_date(value: str | None) -> bool:
    return parse_date(value) is not None


def is_month_header(text: str) -> bool:
    return bool(re.fullmatch(r"\d{1,2}月", compact(text)))


def money(value: int | None) -> str:
    if value is None:
        return ""
    return f"¥{value:,}"


def build_client() -> gspread.Client:
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        info = json.loads(raw_json)
        credentials = Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        credentials_path = getenv("GOOGLE_APPLICATION_CREDENTIALS")
        credentials = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return gspread.authorize(credentials)


def select_worksheet(spreadsheet: gspread.Spreadsheet) -> gspread.Worksheet:
    worksheet_title = os.getenv("GOOGLE_WORKSHEET_TITLE")
    worksheet_gid = os.getenv("GOOGLE_WORKSHEET_GID", DEFAULT_WORKSHEET_GID)

    if worksheet_title:
        return spreadsheet.worksheet(worksheet_title)

    for ws in spreadsheet.worksheets():
        if str(ws.id) == str(worksheet_gid):
            return ws

    return spreadsheet.sheet1


def should_skip_row(row: list[str]) -> bool:
    row_text = " ".join(compact(v) for v in row if compact(v))
    if not row_text:
        return True
    return any(marker in row_text for marker in SKIP_ROW_MARKERS)


def find_index(headers: list[str], *keywords: str) -> int | None:
    for idx, header in enumerate(headers):
        if all(keyword in header for keyword in keywords):
            return idx
    return None


def get_cell(row: list[str], idx: int | None) -> str:
    if idx is None:
        return ""
    if idx < 0 or idx >= len(row):
        return ""
    return compact(row[idx])


def detect_section_switch(row: list[str], current_section: str) -> str:
    text = " ".join(compact(v) for v in row if compact(v))
    if "レンタル計" in text:
        return "trade"
    return current_section


def build_records(rows: list[list[str]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not rows:
        return [], {}

    raw_headers = [normalize_header(h) for h in rows[0]]
    headers = raw_headers

    idx_purchase_date = find_index(headers, "購入年月日")
    idx_old_no = find_index(headers, "旧")
    idx_new_no = find_index(headers, "新")
    idx_name = find_index(headers, "名前")
    idx_chassis = find_index(headers, "車体ナンバー")
    idx_registration = find_index(headers, "登録番号")
    idx_sold_to = find_index(headers, "売却先")
    idx_purchase = find_index(headers, "取得")
    idx_sale = find_index(headers, "売却")
    idx_profit = find_index(headers, "売却益")
    idx_purchase_recycle = find_index(headers, "仕入", "ﾘｻｲｸﾙ") or find_index(headers, "仕入", "リサイクル")
    idx_sale_recycle = find_index(headers, "売上", "ﾘｻｲｸﾙ") or find_index(headers, "売上", "リサイクル")
    idx_deposit = find_index(headers, "預託金")
    idx_advance = find_index(headers, "立替金")
    idx_insurance = find_index(headers, "保険")
    idx_purchase_core = find_index(headers, "内仕入価格")
    idx_body_price = find_index(headers, "内本体価格")

    month_cols = [(idx, header) for idx, header in enumerate(raw_headers) if is_month_header(header)]
    month_order_map = {m: i for i, m in enumerate(MONTH_PRIORITY)}
    month_cols = sorted(month_cols, key=lambda item: month_order_map.get(item[1], 999))

    records: list[dict[str, Any]] = []
    section = "rental"

    for sheet_row_number, raw_row in enumerate(rows[1:], start=2):
        row = list(raw_row) + [""] * max(0, len(headers) - len(raw_row))
        section = detect_section_switch(row, section)

        if should_skip_row(row):
            continue

        purchase_date_raw = get_cell(row, idx_purchase_date)
        name = get_cell(row, idx_name)
        chassis_no = get_cell(row, idx_chassis)
        registration_no = get_cell(row, idx_registration)

        has_key_identity = any([
            looks_like_date(purchase_date_raw),
            bool(name),
            bool(chassis_no),
            bool(registration_no),
        ])
        if not has_key_identity:
            continue

        old_no = get_cell(row, idx_old_no)
        new_no = get_cell(row, idx_new_no)
        sold_to = get_cell(row, idx_sold_to)

        monthly_fees = OrderedDict()
        for idx, month_label in month_cols:
            monthly_fees[month_label] = parse_number(get_cell(row, idx))

        current_monthly_fee = None
        for month_label in reversed(MONTH_PRIORITY):
            if monthly_fees.get(month_label) is not None:
                current_monthly_fee = monthly_fees[month_label]
                break

        purchase_amount = parse_number(get_cell(row, idx_purchase))
        sale_amount = parse_number(get_cell(row, idx_sale))
        profit_amount = parse_number(get_cell(row, idx_profit))
        purchase_recycle = parse_number(get_cell(row, idx_purchase_recycle))
        sale_recycle = parse_number(get_cell(row, idx_sale_recycle))
        deposit_amount = parse_number(get_cell(row, idx_deposit))
        advance_amount = parse_number(get_cell(row, idx_advance))
        insurance_amount = parse_number(get_cell(row, idx_insurance))
        purchase_core_amount = parse_number(get_cell(row, idx_purchase_core))
        body_price_amount = parse_number(get_cell(row, idx_body_price))

        row_text = " ".join(compact(v) for v in row if compact(v))
        if "廃車" in row_text:
            status = "scrapped"
        elif section == "trade" or sale_amount is not None or bool(sold_to):
            status = "sold"
        else:
            status = "active"

        category = "rental" if section == "rental" else "trade"
        vehicle_id = new_no or old_no or f"row-{sheet_row_number}"

        record = {
            "vehicle_id": vehicle_id,
            "old_no": old_no,
            "new_no": new_no,
            "purchase_date": parse_date(purchase_date_raw),
            "purchase_date_raw": purchase_date_raw,
            "name": name,
            "chassis_no": chassis_no,
            "registration_no": registration_no,
            "category": category,
            "status": status,
            "status_label": {
                "active": "稼働中",
                "sold": "売却済",
                "scrapped": "廃車済",
            }.get(status, status),
            "current_monthly_fee": current_monthly_fee,
            "current_monthly_fee_label": money(current_monthly_fee),
            "monthly_fees": monthly_fees,
            "sold_to": sold_to,
            "purchase_amount": purchase_amount,
            "purchase_amount_label": money(purchase_amount),
            "sale_amount": sale_amount,
            "sale_amount_label": money(sale_amount),
            "profit_amount": profit_amount,
            "profit_amount_label": money(profit_amount),
            "purchase_recycle": purchase_recycle,
            "sale_recycle": sale_recycle,
            "deposit_amount": deposit_amount,
            "advance_amount": advance_amount,
            "insurance_amount": insurance_amount,
            "purchase_core_amount": purchase_core_amount,
            "body_price_amount": body_price_amount,
            "sheet_row_number": sheet_row_number,
            "search_text": " ".join(filter(None, [name, chassis_no, registration_no, old_no, new_no, sold_to])).lower(),
        }
        records.append(record)

    def safe_sum(key: str) -> int:
        return sum((r.get(key) or 0) for r in records)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "record_count": len(records),
        "active_count": sum(1 for r in records if r["status"] == "active"),
        "sold_count": sum(1 for r in records if r["status"] == "sold"),
        "scrapped_count": sum(1 for r in records if r["status"] == "scrapped"),
        "rental_count": sum(1 for r in records if r["category"] == "rental"),
        "trade_count": sum(1 for r in records if r["category"] == "trade"),
        "purchase_total": safe_sum("purchase_amount"),
        "sale_total": safe_sum("sale_amount"),
        "profit_total": safe_sum("profit_amount"),
        "current_monthly_total": safe_sum("current_monthly_fee"),
    }

    return records, summary


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    spreadsheet_id = os.getenv("GOOGLE_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID)
    client = build_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = select_worksheet(spreadsheet)
    rows = worksheet.get_all_values()

    records, summary = build_records(rows)

    metadata = {
        "spreadsheet_id": spreadsheet_id,
        "worksheet_title": worksheet.title,
        "worksheet_gid": str(worksheet.id),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    write_json(DATA_DIR / "vehicles.json", records)
    write_json(DATA_DIR / "summary.json", summary)
    write_json(DATA_DIR / "meta.json", metadata)

    print(f"Wrote {len(records)} records from worksheet '{worksheet.title}' ({worksheet.id})")


if __name__ == "__main__":
    main()
