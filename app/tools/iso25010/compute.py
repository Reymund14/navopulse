#!/usr/bin/env python3
"""
NavoPulse ISO/IEC 25010 evaluation: compute weighted means, standard
deviations and verbal interpretations from 5-point Likert responses.

Standard library only (Python 3.8+).

Input CSV
---------
    respondent_id,group,FS1,FS2,...,PO4
    R001,resident,5,4,...,
    L001,lgu,4,4,...,5

* `group` is free text (the instrument uses `resident` and `lgu`).
* Item codes are <PREFIX><number>; the prefix decides the characteristic:
      FS Functional suitability   PE Performance efficiency
      CO Compatibility            US Usability
      RE Reliability              SE Security
      MA Maintainability          PO Portability
* Cells must be an integer 1-5, or blank / "NA" when the item is not on that
  respondent's questionnaire version (or was skipped).
* Lines starting with "#" are comments (used to label synthetic samples).

Method
------
* Item weighted mean  WM = sum(f_x * x) / N   for scale points x = 1..5,
  where f_x is the number of respondents who chose x and N = sum(f_x).
  (This is the arithmetic mean of the answers, written the way capstone
  manuscripts usually present it.)
* Item SD: sample standard deviation (n - 1) by default; --population uses n.
* Characteristic WM: pooled over every answer to that characteristic's items
  (equal to the mean of item means when nobody skipped an item).
* Overall WM: mean of the characteristic means, so each of the eight
  characteristics carries equal weight regardless of how many items it has.
  The overall SD is the SD of all pooled answers.
* Results are reported per group and for ALL groups combined.
* Cronbach's alpha (internal consistency) is reported per characteristic that
  has at least two items, using respondents who answered every item of that
  characteristic: alpha = k/(k-1) * (1 - sum(item variances) / variance(totals)).
  0.70 or higher is the usual acceptance level; it is a check of the
  questionnaire, not of the software.

Usage
-----
    python3 tools/iso25010/compute.py responses.csv
    python3 tools/iso25010/compute.py responses.csv --out summary.csv
    python3 tools/iso25010/compute.py responses.csv --group resident --population
"""
from __future__ import annotations

import argparse
import csv
import math
import re
import sys
from collections import OrderedDict
from pathlib import Path

CHARACTERISTICS = OrderedDict(
    [
        ("FS", "Functional Suitability"),
        ("PE", "Performance Efficiency"),
        ("CO", "Compatibility"),
        ("US", "Usability"),
        ("RE", "Reliability"),
        ("SE", "Security"),
        ("MA", "Maintainability"),
        ("PO", "Portability"),
    ]
)

# (lower bound inclusive, upper bound inclusive, agreement, quality rating)
SCALE = [
    (4.21, 5.00, "Strongly Agree", "Excellent"),
    (3.41, 4.20, "Agree", "Very Good"),
    (2.61, 3.40, "Moderately Agree", "Good"),
    (1.81, 2.60, "Disagree", "Fair"),
    (1.00, 1.80, "Strongly Disagree", "Poor"),
]

ITEM_RE = re.compile(r"^([A-Z]{2})(\d+)$")
MISSING = {"", "NA", "N/A", "-"}


def interpret(mean: float | None) -> tuple[str, str]:
    if mean is None:
        return ("-", "-")
    m = round(mean, 2)
    for lo, hi, agree, quality in SCALE:
        if lo <= m <= hi:
            return (agree, quality)
    return ("out of range", "out of range")


def mean_sd(values: list[int], population: bool) -> tuple[float | None, float | None]:
    n = len(values)
    if n == 0:
        return (None, None)
    mean = sum(values) / n
    if n == 1:
        return (mean, 0.0)
    denom = n if population else n - 1
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / denom)
    return (mean, sd)


def cronbach_alpha(sel: list[dict], items: list[str]) -> float | None:
    if len(items) < 2:
        return None
    complete = [a for a in sel if all(i in a for i in items)]
    if len(complete) < 3:
        return None

    def var(xs):
        m = sum(xs) / len(xs)
        return sum((x - m) ** 2 for x in xs) / (len(xs) - 1)

    k = len(items)
    item_var = sum(var([a[i] for a in complete]) for i in items)
    total_var = var([sum(a[i] for i in items) for a in complete])
    if total_var == 0:
        return None
    return k / (k - 1) * (1 - item_var / total_var)


def item_sort_key(code: str):
    m = ITEM_RE.match(code)
    prefixes = list(CHARACTERISTICS)
    return (prefixes.index(m.group(1)), int(m.group(2))) if m else (99, 0)


def read_responses(path: Path):
    """Return (item_codes, rows) where rows = [(respondent_id, group, {item: int})]."""
    with path.open(newline="", encoding="utf-8-sig") as fh:
        lines = [ln for ln in fh if not ln.lstrip().startswith("#") and ln.strip()]
    reader = csv.DictReader(lines)
    if not reader.fieldnames:
        sys.exit("error: the CSV has no header row")
    header = [h.strip() for h in reader.fieldnames]
    if len(header) < 3 or header[0] != "respondent_id" or header[1] != "group":
        sys.exit("error: the first two columns must be respondent_id,group")
    items = []
    for h in header[2:]:
        m = ITEM_RE.match(h)
        if not m or m.group(1) not in CHARACTERISTICS:
            sys.exit(f"error: column '{h}' is not an item code like FS1 (prefixes: {', '.join(CHARACTERISTICS)})")
        items.append(h)

    rows = []
    seen = set()
    for lineno, raw in enumerate(reader, start=2):
        rec = {k.strip(): (v or "").strip() for k, v in raw.items() if k is not None}
        rid = rec.get("respondent_id", "")
        group = rec.get("group", "").lower()
        if not rid or not group:
            sys.exit(f"error: data row {lineno}: respondent_id and group are required")
        if rid in seen:
            sys.exit(f"error: data row {lineno}: duplicate respondent_id '{rid}'")
        seen.add(rid)
        answers = {}
        for item in items:
            cell = rec.get(item, "")
            if cell.upper() in MISSING:
                continue
            if not re.fullmatch(r"[1-5]", cell):
                sys.exit(f"error: data row {lineno} ({rid}), item {item}: '{cell}' is not 1-5 or blank")
            answers[item] = int(cell)
        rows.append((rid, group, answers))
    if not rows:
        sys.exit("error: no response rows found")
    return sorted(items, key=item_sort_key), rows


def analyse(items, rows, population: bool):
    """Return a list of summary records (dicts) for every group plus ALL."""
    groups = sorted({g for _, g, _ in rows})
    out = []
    for group in groups + ["ALL"]:
        sel = [a for _, g, a in rows if group == "ALL" or g == group]
        n_resp = len(sel)
        char_means = []
        all_values: list[int] = []
        for prefix, cname in CHARACTERISTICS.items():
            pooled: list[int] = []
            answered = [i for i in items if i.startswith(prefix) and any(i in a for a in sel)]
            for item in answered:
                vals = [a[item] for a in sel if item in a]
                if not vals:
                    continue
                freq = [vals.count(x) for x in range(1, 6)]
                m, sd = mean_sd(vals, population)
                agree, quality = interpret(m)
                out.append(
                    dict(level="item", group=group, code=item, characteristic=cname, n=len(vals),
                         f1=freq[0], f2=freq[1], f3=freq[2], f4=freq[3], f5=freq[4],
                         weighted_mean=m, sd=sd, interpretation=agree, rating=quality, alpha=None)
                )
                pooled.extend(vals)
            if pooled:
                m, sd = mean_sd(pooled, population)
                agree, quality = interpret(m)
                freq = [pooled.count(x) for x in range(1, 6)]
                out.append(
                    dict(level="characteristic", group=group, code=prefix, characteristic=cname, n=len(pooled),
                         f1=freq[0], f2=freq[1], f3=freq[2], f4=freq[3], f5=freq[4],
                         weighted_mean=m, sd=sd, interpretation=agree, rating=quality,
                         alpha=cronbach_alpha(sel, answered) if group != "ALL" else None)
                )
                char_means.append(m)
                all_values.extend(pooled)
        if char_means:
            overall = sum(char_means) / len(char_means)
            _, sd = mean_sd(all_values, population)
            agree, quality = interpret(overall)
            freq = [all_values.count(x) for x in range(1, 6)]
            out.append(
                dict(level="overall", group=group, code="ALL", characteristic=f"Overall ({n_resp} respondents)",
                     n=len(all_values), f1=freq[0], f2=freq[1], f3=freq[2], f4=freq[3], f5=freq[4],
                     weighted_mean=overall, sd=sd, interpretation=agree, rating=quality, alpha=None)
            )
    return out


def fmt(v):
    return "-" if v is None else f"{v:.2f}"


def print_table(records, show_items: bool):
    groups = list(OrderedDict.fromkeys(r["group"] for r in records))
    for group in groups:
        recs = [r for r in records if r["group"] == group]
        n_resp = next((r["characteristic"] for r in recs if r["level"] == "overall"), "")
        title = f"Group: {group}  {n_resp.replace('Overall ', '')}"
        print("=" * 88)
        print(title)
        print("=" * 88)
        print(f"{'Code':<6} {'Indicator':<34} {'N':>4} {'WM':>6} {'SD':>6}  {'Interpretation':<18} {'Rating':<10} Alpha")
        print("-" * 88)
        for r in recs:
            if r["level"] == "item" and not show_items:
                continue
            if r["level"] == "item":
                code, label = "  " + r["code"], "  item"
            elif r["level"] == "characteristic":
                code, label = r["code"], r["characteristic"]
            else:
                print("-" * 88)
                code, label = "ALL", "OVERALL (mean of characteristics)"
            alpha = "" if r["level"] != "characteristic" or r["group"] == "ALL" else fmt(r["alpha"])
            print(f"{code:<6} {label:<34} {r['n']:>4} {fmt(r['weighted_mean']):>6} {fmt(r['sd']):>6}  "
                  f"{r['interpretation']:<18} {r['rating']:<10} {alpha}")
        print()
    print("Alpha = Cronbach's alpha per characteristic (respondents with all its items; '-' if fewer than 2 items or 3 respondents).")
    print("Scale: 4.21-5.00 Strongly Agree/Excellent | 3.41-4.20 Agree/Very Good | "
          "2.61-3.40 Moderately Agree/Good | 1.81-2.60 Disagree/Fair | 1.00-1.80 Strongly Disagree/Poor")


def write_csv(records, path: Path):
    fields = ["level", "group", "code", "characteristic", "n", "f1", "f2", "f3", "f4", "f5",
              "weighted_mean", "sd", "interpretation", "rating", "cronbach_alpha"]
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for r in records:
            row = dict(r)
            row["weighted_mean"] = fmt(r["weighted_mean"])
            row["sd"] = fmt(r["sd"])
            row["cronbach_alpha"] = "" if r["alpha"] is None else fmt(r["alpha"])
            del row["alpha"]
            w.writerow(row)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Compute ISO/IEC 25010 Likert results for NavoPulse.")
    ap.add_argument("csv", type=Path, help="responses CSV (respondent_id,group,FS1,...)")
    ap.add_argument("--out", type=Path, help="summary CSV to write (default: <input>_summary.csv)")
    ap.add_argument("--group", help="only analyse this group (e.g. resident or lgu)")
    ap.add_argument("--population", action="store_true", help="use population SD (n) instead of sample SD (n-1)")
    ap.add_argument("--no-items", action="store_true", help="print characteristics only, not every item")
    args = ap.parse_args(argv)

    if not args.csv.is_file():
        sys.exit(f"error: {args.csv} not found")
    items, rows = read_responses(args.csv)
    if args.group:
        rows = [r for r in rows if r[1] == args.group.lower()]
        if not rows:
            sys.exit(f"error: no respondents in group '{args.group}'")
    records = analyse(items, rows, args.population)
    if args.group:
        records = [r for r in records if r["group"] != "ALL"]

    print_table(records, show_items=not args.no_items)
    out = args.out or args.csv.with_name(args.csv.stem + "_summary.csv")
    write_csv(records, out)
    print(f"\nSummary written to {out}")


if __name__ == "__main__":
    main()
