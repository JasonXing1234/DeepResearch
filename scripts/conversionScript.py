
import argparse
import json
import re
import unicodedata
from collections import OrderedDict
from copy import copy
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import pandas as pd
from openpyxl import load_workbook as _openpyxl_load, Workbook as _OXLWorkbook
from openpyxl.styles import Font as _OXLFont, PatternFill as _OXLFill, Alignment as _OXLAlign

# --------------------- Utilities ---------------------
SRC_KEYS = ["Source", "Sources", "Source URLs", "SourceURLs"]

def _norm(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (list, tuple, set)):
        parts = [_norm(x) for x in v]
        parts = [p for p in parts if p != ""]
        return "; ".join(parts)
    if isinstance(v, (int, float)):
        return str(v)
    return str(v).strip()

def _normalize_company(name: str) -> str:
    """Normalize company name by stripping accents and trimming whitespace."""
    s = _norm(name)
    if not s:
        return s
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return " ".join(s.split())

def _has_any_value(d: Dict[str, Any], fields: Iterable[str]) -> bool:
    """True if ANY of the fields is populated (booleans count if True)."""
    for k in fields:
        v = d.get(k)
        if isinstance(v, bool):
            if v:
                return True
        else:
            if _norm(v) != "":
                return True
    return False

def _bool_from_maybe(v: Any) -> Optional[bool]:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in {"true", "yes", "y", "1"}:
        return True
    if s in {"false", "no", "n", "0"}:
        return False
    return None

def _blob_has(pattern: str, *vals: Any) -> bool:
    blob = " ".join(_norm(v) for v in vals if _norm(v)).lower()
    return bool(blob and re.search(pattern, blob))

def _extract_urls_from_any(rec: Dict[str, Any]) -> List[str]:
    """Collect URLs from any of the source keys and comments."""
    urls: List[str] = []
    seen = set()
    # From explicit source fields (strings or arrays)
    for k in SRC_KEYS + ["Comments"]:
        v = rec.get(k)
        if isinstance(v, list):
            for item in v:
                s = _norm(item)
                for m in re.findall(r'https?://[^\s)\]>\}",\'<>]+', s):
                    if m not in seen:
                        seen.add(m); urls.append(m)
        else:
            s = _norm(v)
            for m in re.findall(r'https?://[^\s)\]>\}",\'<>]+', s):
                if m not in seen:
                    seen.add(m); urls.append(m)
    return urls

def _collect_source_text(rec: Dict[str, Any]) -> str:
    """Return a compact Source string combining known source fields."""
    parts: List[str] = []
    for k in SRC_KEYS:
        v = rec.get(k)
        if v is None:
            continue
        if isinstance(v, list):
            if v:
                parts.append(f"{k}: " + "; ".join(_norm(x) for x in v if _norm(x)))
        else:
            s = _norm(v)
            if s:
                parts.append(f"{k}: {s}")
    return "; ".join(parts)

def _kv_join(rec: Dict[str, Any], keys: Iterable[str]) -> str:
    """Join present key/value pairs as 'Key: Value' with '; ' delimiter."""
    out: List[str] = []
    for k in keys:
        val = _norm(rec.get(k))
        if val != "":
            out.append(f"{k}: {val}")
    return "; ".join(out)

def _kv_join_aliases(rec: Dict[str, Any], key_groups: Iterable[Iterable[str]]) -> str:
    """Join first present value in each alias group as 'CanonicalKey: Value'."""
    out: List[str] = []
    for group in key_groups:
        aliases = list(group)
        if not aliases:
            continue
        canonical = aliases[0]
        value = ""
        for k in aliases:
            value = _norm(rec.get(k))
            if value != "":
                break
        if value != "":
            out.append(f"{canonical}: {value}")
    return "; ".join(out)

def load_json_flexible(p: Path) -> List[Dict[str, Any]]:
    """
    Load JSON arrays/objects even if file has extra text. Robust to .txt or .json.
    Returns a list[dict]. Unknown/malformed chunks are skipped.
    """
    txt = p.read_text(encoding="utf-8", errors="ignore").strip()
    # 1) Try direct JSON (array or object)
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except Exception:
        pass
    # 2) Largest JSON array block
    m = re.search(r"\[[\s\S]*\]", txt)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, dict):
                return [data]
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict)]
        except Exception:
            pass
    # 3) Collect shallow JSON objects and wrap in list
    objs = re.findall(r"\{[\s\S]*?\}", txt)
    items = []
    for o in objs:
        try:
            obj = json.loads(o)
            if isinstance(obj, dict):
                items.append(obj)
        except Exception:
            continue
    return items

# --------------------- Detection logic ---------------------
def detect_emissions(rec: Dict[str, Any]) -> Dict[str, Any]:
    commit_fields_any = [
        "Emissions Reduction Target", "Target Year", "Baseline Year",
        "Pledge Year", "Comments", *SRC_KEYS
    ]
    commitment = _has_any_value(rec, commit_fields_any)
    nz = _bool_from_maybe(rec.get("Net-Zero Target"))
    if nz is None:
        nz = _blob_has(r"\bnet[-\s]?zero\b", rec.get("Comments"), rec.get("Emissions Reduction Target"))
    text = _kv_join(rec, ["Emissions Reduction Target", "Target Year", "Baseline Year", "Pledge Year", "Comments"])
    source = _collect_source_text(rec)
    urls = "; ".join(_extract_urls_from_any(rec))
    return {
        "Commitment to Reduce": commitment,
        "Net-zero target": bool(nz),
        "Text": text,
        "Source": source,
        "URL": urls
    }

def detect_investment(rec: Dict[str, Any]) -> Dict[str, Any]:
    any_fields = ["Investment Type", "Announcement Date", "Description", *SRC_KEYS, "Comments"]
    has = _has_any_value(rec, any_fields)
    text = _kv_join(rec, ["Investment Type", "Announcement Date", "Description", "Comments"])
    source = _collect_source_text(rec)
    urls = "; ".join(_extract_urls_from_any(rec))
    return {"Investment announced": has, "Text": text, "Source": source, "URL": urls}

def detect_purchase(rec: Dict[str, Any]) -> Dict[str, Any]:
    any_fields = [
        "Manufacturer", "MachineType", "Machine Type",
        "Model", "Quantity", "PurchaseDate", "Purchase Date",
        *SRC_KEYS, "Comments"
    ]
    has = _has_any_value(rec, any_fields)
    text = _kv_join_aliases(rec, [
        ["Manufacturer"],
        ["MachineType", "Machine Type"],
        ["Model"],
        ["Quantity"],
        ["PurchaseDate", "Purchase Date"],
        ["Comments"]
    ])
    source = _collect_source_text(rec)
    urls = "; ".join(_extract_urls_from_any(rec))
    return {"Equipment purchased": has, "Text": text, "Source": source, "URL": urls}

def detect_pilot(rec: Dict[str, Any]) -> Dict[str, Any]:
    any_fields = [
        "Project Name", "Project Type", "Involvement",
        "Lower Emissions Approach", "Lower Emission Approach",
        "Equipment", "Electric Equipment & Manufacturer",
        "Project Description", *SRC_KEYS, "Comments"
    ]
    has = _has_any_value(rec, any_fields)
    text = _kv_join(rec, [
        "Project Name", "Project Type", "Involvement",
        "Lower Emissions Approach", "Lower Emission Approach",
        "Equipment", "Electric Equipment & Manufacturer",
        "Project Description", "Comments"
    ])
    source = _collect_source_text(rec)
    urls = "; ".join(_extract_urls_from_any(rec))
    return {"Pilot": has, "Text": text, "Source": source, "URL": urls}

def detect_environment(rec: Dict[str, Any]) -> Dict[str, Any]:
    any_fields = [
        "Project", "constraint type", "Constraint Type",
        "Project date", "Project Date", "Description",
        *SRC_KEYS, "Comments"
    ]
    has = _has_any_value(rec, any_fields)
    text = _kv_join_aliases(rec, [
        ["Project"],
        ["constraint type", "Constraint Type"],
        ["Project date", "Project Date"],
        ["Description"],
        ["Comments"]
    ])
    source = _collect_source_text(rec)
    urls = "; ".join(_extract_urls_from_any(rec))
    return {"Project environment/constraints": has, "Text": text, "Source": source, "URL": urls}

# --------------------- Pipeline ---------------------
def build_original_rows(emis, inv, buy, pil, envs) -> pd.DataFrame:
    """
    Build the long 'Original' DataFrame:
    Columns: Customer, Attribute, Yes/No, Text, Source, URL
    """
    rows: List[Dict[str, Any]] = []

    for rec in emis:
        company = _normalize_company(rec.get("Company", ""))
        if not company:
            continue
        det = detect_emissions(rec)
        rows.append({"Customer": company, "Attribute": "Commitment to Reduce", "Yes/No": "Yes" if det["Commitment to Reduce"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})
        rows.append({"Customer": company, "Attribute": "Net-zero target", "Yes/No": "Yes" if det["Net-zero target"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})

    for rec in inv:
        company = _normalize_company(rec.get("Company", ""))
        if not company:
            continue
        det = detect_investment(rec)
        rows.append({"Customer": company, "Attribute": "Investment announced", "Yes/No": "Yes" if det["Investment announced"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})

    for rec in buy:
        company = _normalize_company(rec.get("Company", ""))
        if not company:
            continue
        det = detect_purchase(rec)
        rows.append({"Customer": company, "Attribute": "Equipment purchased", "Yes/No": "Yes" if det["Equipment purchased"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})

    for rec in pil:
        company = _normalize_company(rec.get("Company", ""))
        if not company:
            continue
        det = detect_pilot(rec)
        rows.append({"Customer": company, "Attribute": "Pilot", "Yes/No": "Yes" if det["Pilot"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})

    for rec in envs:
        company = _normalize_company(rec.get("Company", ""))
        if not company:
            continue
        det = detect_environment(rec)
        rows.append({"Customer": company, "Attribute": "Project environment/constraints", "Yes/No": "Yes" if det["Project environment/constraints"] else "No", "Text": det["Text"], "Source": det["Source"], "URL": det["URL"]})

    df = pd.DataFrame(rows, columns=["Customer", "Attribute", "Yes/No", "Text", "Source", "URL"])
    df.sort_values(by=["Customer", "Attribute"], inplace=True, kind="mergesort")
    return df

def collapse_normalized(original_df: pd.DataFrame) -> pd.DataFrame:
    """Collapse to one row per company with six booleans, combining duplicates by any 'Yes'."""
    if original_df.empty:
        return pd.DataFrame(columns=[
            "Customer", "Commitment to Reduce", "Net-zero target",
            "Pilot", "Investment announced", "Equipment purchased",
            "Project environment/constraints"
        ])
    agg = (original_df
           .pivot_table(index="Customer", columns="Attribute", values="Yes/No",
                        aggfunc=lambda x: "Yes" if any(v == "Yes" for v in x) else "No")
           .reset_index())
    # Ensure all required columns exist
    required = ["Commitment to Reduce", "Net-zero target", "Pilot",
                "Investment announced", "Equipment purchased", "Project environment/constraints"]
    for c in required:
        if c not in agg.columns:
            agg[c] = "No"
    # Order columns and force any missing per-company attributes to "No"
    agg = agg[["Customer"] + required]
    agg[required] = agg[required].fillna("No")
    return agg

def counts_by_company(arr: List[Dict[str, Any]]) -> Dict[str, int]:
    cnt: Dict[str, int] = {}
    for rec in arr:
        k = _normalize_company(rec.get("Company", ""))
        if not k:
            continue
        cnt[k] = cnt.get(k, 0) + 1
    return cnt

# --------------------- AI Leads Excel deduplication ---------------------

_URL_RE = re.compile(r'https?://[^\s,]+')


def _norm_customer_cell(value: Any) -> Optional[str]:
    """Return None if cell is blank or a carry-down formula (=A...)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or re.match(r'^=A\d+$', text):
        return None
    return text


def _norm_yn_cell(value: Any) -> Optional[str]:
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {'yes', 'true', 'y', '1'}:
        return 'Yes'
    if text in {'no', 'false', 'n', '0'}:
        return 'No'
    return None


def _extract_urls_from_cell(value: Any) -> List[str]:
    if not value:
        return []
    out: List[str] = []
    seen: set = set()
    for m in _URL_RE.findall(str(value)):
        m = m.rstrip(';,.)]')
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


def dedupe_leads_excel(input_path: Path, sheet: str, output_path: Path) -> None:
    """
    Deduplicate an AI Leads Excel detail sheet where each company has multiple
    rows (one per attribute: Commitment to Reduce, Net-zero target, etc.).

    Rules (aligned with chat consolidation work):
    - Reads rows via openpyxl (data_only=False) to detect =A8-style carry-down
      formulas in the Customer column and resolve them via fill-down.
    - Accent/dash normalization applied to customer names before grouping.
    - Groups by (Customer, Attribute) -- deduplicates at attribute level.
    - Yes/No: any 'Yes' in group wins (OR logic); mixed groups stay 'Yes'.
    - Text: all unique non-blank values merged with double newline separator.
    - URLs: all unique URLs collected; first two go to URL / URL 2,
      overflow goes to new 'Additional URLs' column.
    - 'Source Row Count' column records how many raw rows were merged.
    - Output workbook has three sheets:
        * Original_Details  -- deduped (one row per Customer + Attribute)
        * Consolidated      -- one row per customer, OR'd boolean pivot
        * Original_Details_Raw -- hidden verbatim copy of the source sheet
    """
    wb_src = _openpyxl_load(input_path, data_only=False)
    if sheet not in wb_src.sheetnames:
        raise ValueError(
            f"Sheet '{sheet}' not found in {input_path}. "
            f"Available sheets: {wb_src.sheetnames}"
        )
    ws_src = wb_src[sheet]
    raw_rows = list(ws_src.iter_rows(values_only=True))

    # Find header row (row containing 'Customer')
    header_idx: Optional[int] = None
    for ridx, row in enumerate(raw_rows[:40]):
        if row and any(
            isinstance(v, str) and v.strip().lower() == 'customer' for v in row
        ):
            header_idx = ridx
            break
    if header_idx is None:
        raise ValueError(
            f"Could not find a 'Customer' header in sheet '{sheet}' of {input_path}"
        )
    headers: List[Any] = list(raw_rows[header_idx])

    # Map header names to column indices
    col_idx: Dict[str, int] = {
        str(h).strip(): i for i, h in enumerate(headers) if h is not None
    }
    ci  = col_idx.get('Customer', 0)
    ai  = col_idx.get('Attribute', 1)
    yni = col_idx.get('Yes/No', 2)
    ti  = col_idx.get('Text', 3)
    ui  = col_idx.get('URL', 4)
    u2i = col_idx.get('URL 2', 5)

    # Build (Customer, Attribute) groups with fill-down customer resolution
    current_customer: Optional[str] = None
    groups: "OrderedDict[tuple, Dict[str, Any]]" = OrderedDict()
    total_source_rows = 0

    for row in raw_rows[header_idx + 1:]:
        if not row or not any(v not in (None, '') for v in row):
            continue
        raw_cust = row[ci] if ci < len(row) else None
        cust = _norm_customer_cell(raw_cust)
        if cust:
            current_customer = _normalize_company(cust)
        else:
            cust = current_customer
        if cust is None:
            continue
        attr = row[ai] if ai < len(row) else None
        if attr is None or str(attr).strip() == '':
            continue

        key = (cust, str(attr).strip())
        rec = groups.setdefault(key, {
            'customer':  cust,
            'attribute': str(attr).strip(),
            'yes_seen':  False,
            'no_seen':   False,
            'texts':     [],
            'text_seen': set(),
            'urls':      [],
            'url_seen':  set(),
            'count':     0,
        })
        rec['count'] += 1
        total_source_rows += 1

        yn = _norm_yn_cell(row[yni] if yni < len(row) else None)
        if yn == 'Yes':
            rec['yes_seen'] = True
        elif yn == 'No':
            rec['no_seen'] = True

        text_val = row[ti] if ti < len(row) else None
        if text_val is not None:
            t = str(text_val).strip()
            if t and t != '-' and t not in rec['text_seen']:
                rec['text_seen'].add(t)
                rec['texts'].append(t)

        for url in (
            _extract_urls_from_cell(row[ui]  if ui  < len(row) else None) +
            _extract_urls_from_cell(row[u2i] if u2i < len(row) else None)
        ):
            if url not in rec['url_seen']:
                rec['url_seen'].add(url)
                rec['urls'].append(url)

    # ---- Build output workbook ----------------------------------------
    out_headers = headers + ['Additional URLs', 'Source Row Count']
    out_wb = _OXLWorkbook()
    out_wb.remove(out_wb.active)

    # -- Sheet 1: Original_Details (deduped detail rows) --
    ws_det = out_wb.create_sheet('Original_Details')
    ws_det.append([None] * len(out_headers))          # blank row 1 (layout parity)
    for col, val in enumerate(out_headers, start=1):
        cell = ws_det.cell(row=2, column=col, value=val)
        cell.font      = _OXLFont(bold=True)
        cell.fill      = _OXLFill(fill_type='solid', fgColor='D9EAF7')
        cell.alignment = _OXLAlign(vertical='top', wrap_text=True)

    for rnum, rec in enumerate(groups.values(), start=3):
        urls = rec['urls']
        row_vals: List[Any] = [None] * len(headers)
        row_vals[ci]  = rec['customer']
        row_vals[ai]  = rec['attribute']
        row_vals[yni] = 'Yes' if rec['yes_seen'] else ('No' if rec['no_seen'] else None)
        row_vals[ti]  = '\n\n'.join(rec['texts']) if rec['texts'] else '-'
        row_vals[ui]  = urls[0] if len(urls) > 0 else None
        if u2i < len(headers):
            row_vals[u2i] = urls[1] if len(urls) > 1 else None
        row_vals += [
            '\n'.join(urls[2:]) if len(urls) > 2 else None,  # Additional URLs
            rec['count'],                                      # Source Row Count
        ]
        for col, val in enumerate(row_vals, start=1):
            ws_det.cell(row=rnum, column=col, value=val).alignment = _OXLAlign(
                vertical='top', wrap_text=True
            )

    ws_det.freeze_panes = 'A3'
    ws_det.auto_filter.ref = (
        f'A2:{ws_det.cell(2, len(out_headers)).column_letter}{ws_det.max_row}'
    )
    for col_letter, width in {
        'A': 34, 'B': 34, 'C': 10, 'D': 95,
        'E': 34, 'F': 34, 'G': 45, 'H': 16,
    }.items():
        ws_det.column_dimensions[col_letter].width = width

    # -- Sheet 2: Consolidated (boolean pivot, one row per customer) --
    ws_con = out_wb.create_sheet('Consolidated')
    attribute_cols = sorted({rec['attribute'] for rec in groups.values()})
    con_headers = ['Customer'] + attribute_cols
    for col, val in enumerate(con_headers, start=1):
        cell = ws_con.cell(row=1, column=col, value=val)
        cell.font      = _OXLFont(bold=True)
        cell.fill      = _OXLFill(fill_type='solid', fgColor='D9EAF7')
        cell.alignment = _OXLAlign(vertical='top', wrap_text=True)
    pivot: Dict[str, Dict[str, str]] = {}
    for rec in groups.values():
        c = rec['customer']
        if c not in pivot:
            pivot[c] = {a: 'No' for a in attribute_cols}
        if rec['yes_seen']:
            pivot[c][rec['attribute']] = 'Yes'
    for rnum, (cust, attrs) in enumerate(pivot.items(), start=2):
        ws_con.cell(rnum, 1, cust)
        for cnum, attr in enumerate(attribute_cols, start=2):
            ws_con.cell(rnum, cnum, attrs.get(attr, 'No'))
    ws_con.freeze_panes = 'A2'
    ws_con.auto_filter.ref = (
        f'A1:{ws_con.cell(1, len(con_headers)).column_letter}1'
    )
    ws_con.column_dimensions['A'].width = 40

    # -- Sheet 3: Original_Details_Raw (hidden verbatim copy, values only) --
    ws_raw = out_wb.create_sheet('Original_Details_Raw')
    for row in ws_src.iter_rows(values_only=True):
        ws_raw.append([v for v in row])
    ws_raw.sheet_state = 'hidden'

    out_wb.save(output_path)

    print(
        f"Deduped '{input_path.name}' sheet='{sheet}': "
        f"{total_source_rows} source rows → {len(groups)} unique (Customer, Attribute) pairs "
        f"({total_source_rows - len(groups)} duplicates removed). "
        f"Pivot: {len(pivot)} unique customers. "
        f"Wrote '{output_path}' [Original_Details | Consolidated | Original_Details_Raw]."
    )


def main():
    ap = argparse.ArgumentParser(
        description=(
            "Convert five Chausson JSON reports into normalized booleans + original "
            "(with Text/Source/URL). "
            "Pass --excel-leads to instead deduplicate an AI Leads Excel file."
        )
    )
    # --- JSON → Excel conversion mode (default) ---
    ap.add_argument("--emissions", default="Chausson_EmissionsReductionsResults.txt")
    ap.add_argument("--investments", default="Chausson_InvestmentsResults.txt")
    ap.add_argument("--purchases", default="Chausson_MachinePurchasesResults.txt")
    ap.add_argument("--pilots", default="Chausson_PilotProjectsResults.txt")
    ap.add_argument("--environments", default="Chausson_ProjectEnvironmentsPromptResults.txt")
    ap.add_argument("--out", default="Chausson_attributes_out.xlsx")
    # --- AI Leads Excel deduplication mode ---
    ap.add_argument(
        "--excel-leads",
        metavar="FILE",
        default=None,
        help="Path to an AI Leads Excel file to deduplicate (activates dedup mode)."
    )
    ap.add_argument(
        "--excel-sheet",
        metavar="SHEET",
        default="Sheet2",
        help="Sheet name to read from the Excel leads file (default: Sheet2)."
    )
    ap.add_argument(
        "--excel-out",
        metavar="FILE",
        default=None,
        help="Output path for the deduplicated file. Defaults to <input>_FIXED.xlsx."
    )
    args = ap.parse_args()

    if args.excel_leads:
        input_path = Path(args.excel_leads)
        if args.excel_out:
            output_path = Path(args.excel_out)
        else:
            output_path = input_path.with_stem(input_path.stem + " - FIXED")
        dedupe_leads_excel(input_path, args.excel_sheet, output_path)
        return

    base = Path(".")
    emis = load_json_flexible(base / args.emissions)
    inv  = load_json_flexible(base / args.investments)
    buy  = load_json_flexible(base / args.purchases)
    pil  = load_json_flexible(base / args.pilots)
    envs = load_json_flexible(base / args.environments)

    original_df = build_original_rows(emis, inv, buy, pil, envs)
    normalized_df = collapse_normalized(original_df)

    outp = Path(args.out)
    with pd.ExcelWriter(outp, engine="xlsxwriter") as writer:
        normalized_df.to_excel(writer, index=False, sheet_name="Normalized")
        original_df.to_excel(writer, index=False, sheet_name="Original")

    print(f"Wrote {outp} with sheets: Normalized ({len(normalized_df)} companies), Original ({len(original_df)} rows)")

if __name__ == "__main__":
    main()
