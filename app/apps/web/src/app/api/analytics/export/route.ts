import ExcelJS from "exceljs";
import { defaultRange, exportRows } from "@/lib/analytics";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";

/** Export incidents in range as CSV (default) or Excel (?format=xlsx). No personal data is included. */
export const GET = route(async (req) => {
  const user = await requireUser(req, "analytics.read");
  const sp = new URL(req.url).searchParams;
  const range = defaultRange(sp);
  const rows = await exportRows(user, range);
  const columns = rows[0] ? Object.keys(rows[0]) : ["control_number"];
  const name = `navopulse-incidents-${range.from}_to_${range.to}`;
  await audit(req, user.id, "analytics.export", "incidents", null, null, { ...range, format: sp.get("format") ?? "csv", rows: rows.length });

  if (sp.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "NavoPulse";
    const ws = wb.addWorksheet("Incidents");
    ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  }
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\r\n");
  return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
});
