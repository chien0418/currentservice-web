import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const THEME = {
  headerFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } },
  tableHeadFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } },
};

// =====================
// Helpers
// =====================
function minutesToHHMM(mins?: number | null) {
  const m = Math.max(0, Number(mins ?? 0));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm?: string | null) {
  if (!hhmm) return 0;
  const m = String(hhmm).match(/^(\d+):(\d{2})$/);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return Math.max(0, hh * 60 + mm);
}



function starsToMinutes(stars?: number | null) {
  return Math.max(0, Number(stars ?? 0)) * 15;
}

function normalizeWorkMinutes(row: { work_hm?: string | null; total_stars?: number | null }) {
  const minsFromStars = starsToMinutes(row.total_stars);
  const minsFromWork = hhmmToMinutes(row.work_hm);
  if (minsFromStars > 0 && (minsFromWork === 0 || Math.abs(minsFromStars - minsFromWork) >= 60)) {
    return minsFromStars;
  }
  return minsFromWork;
}

function baseHoursByCycle(cycleYm: string) {
  const [yStr, mStr] = cycleYm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 171;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days === 31 ? 177 : 171;
}

function ymdToSheetName(ymd: string) {
  // YYYY-MM-DD -> MM-DD
  const a = String(ymd).split("-");
  if (a.length === 3) return `${a[1]}-${a[2]}`;
  return String(ymd).slice(0, 31);
}

function a4Setup(
  ws: ExcelJS.Worksheet,
  args: {
    preferred: "portrait" | "landscape";
    colWidths: number[]; // ExcelJS column width units (approx chars)
    minFontSize: number; // must be >= 10
    headerRowsToRepeat?: number; // e.g. 8
    printArea: string; // e.g. "A1:H40"
  }
) {
  // Decide orientation:
  // - Prefer portrait
  // - If total width is too wide (would require font < 10) -> switch to landscape
  const total = args.colWidths.reduce((a, b) => a + b, 0);

  // Heuristic thresholds (tuned for A4):
  // portrait comfortable <= ~80 chars, landscape <= ~110 chars
  const portraitOk = total <= 80;
  const orientation: "portrait" | "landscape" =
    args.preferred === "portrait" ? (portraitOk ? "portrait" : "landscape") : "landscape";

  // Page setup
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    // For "1 sheet = 1 page" intent:
    // - We keep fitToHeight=1 for form-style sheets.
    // - If your rows exceed 1 page, Excel will shrink; that's still printable.
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
    printArea: args.printArea,
  };

  if (args.headerRowsToRepeat && args.headerRowsToRepeat > 0) {
    ws.pageSetup.printTitlesRow = `1:${args.headerRowsToRepeat}`;
  }

  // Default font (>= 10)
  const baseSize = Math.max(10, args.minFontSize);
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = { ...(cell.font ?? {}), name: "Yu Gothic", size: baseSize };
    });
  });
}

function borderAll(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, fromCol: number, toCol: number) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = fromCol; c <= toCol; c++) {
      ws.getCell(r, c).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  }
}

function clearBorders(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, fromCol: number, toCol: number) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = fromCol; c <= toCol; c++) {
      ws.getCell(r, c).border = {};
    }
  }
}

function setRowStyle(
  ws: ExcelJS.Worksheet,
  row: number,
  opts: { height?: number; font?: Partial<ExcelJS.Font>; alignment?: Partial<ExcelJS.Alignment>; fill?: Partial<ExcelJS.Fill> }
) {
  const rr = ws.getRow(row);
  if (opts.height) rr.height = opts.height;
  rr.eachCell({ includeEmpty: true }, (cell) => {
    if (opts.font) cell.font = { ...(cell.font ?? {}), ...opts.font } as any;
    if (opts.alignment) cell.alignment = { ...(cell.alignment ?? {}), ...opts.alignment } as any;
    if (opts.fill) cell.fill = { ...(cell.fill ?? {}), ...opts.fill } as any;
  });
}

// =====================
// Queries (Supabase views)
// =====================

type DayHeader = {
  reporter_name: string;
  ymd: string;
  cycle_ym: string;
  start_hm: string | null;
  end_hm: string | null;
  exclude_minutes: number;
  work_minutes: number;
  total_km: number;
  leave_type: string | null;
};

function normalizeExcelHeader(raw: any): DayHeader {
  return {
    reporter_name: raw?.reporter_name,
    ymd: raw?.ymd,
    cycle_ym: raw?.cycle_ym ?? raw?.cycleYm ?? null,
    start_hm: raw?.start_hm ?? raw?.min_start_hm ?? raw?.start_time ?? "",
    end_hm: raw?.end_hm ?? raw?.max_end_hm ?? raw?.end_time ?? "",
    exclude_minutes: Number(raw?.exclude_minutes ?? raw?.total_exclude_minutes ?? 0),
    work_minutes: Number(raw?.work_minutes ?? raw?.total_minutes ?? 0),
    total_km: Number(raw?.total_km ?? raw?.total_km_sum ?? raw?.km ?? 0),
    leave_type: raw?.leave_type ?? "",
  };
}


type DayDetail = {
  reporter_name: string;
  ymd: string;
  idx: number;
  start_hm: string | null;
  end_hm: string | null;
  site_name: string | null;
  work_type: string | null;
  work_minutes: number;
  note: string | null;
};

type CycleRow = {
  reporter_name: string;
  user_name: string | null;
  employee_code: string | null;
  cycle_ym: string;
  total_stars: number;
  work_hm: string;
  overtime_hm: string;
  required_hm: string;
  remain_hm: string;
  total_km_sum: number;
  work_days: number;
  absent_days: number;
  stay_nights: number;
};

function calcCycleRange(cycleYm: string) {
  // cycleYm = YYYY-MM (給与月)
  const [yStr, mStr] = cycleYm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return { startYmd: "", endYmd: "" };

  const start = new Date(Date.UTC(y, m - 2, 21));
  const end = new Date(Date.UTC(y, m - 1, 20));

  const f = (d: Date) => {
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  return { startYmd: f(start), endYmd: f(end) };
}

// =====================
// Builders
// =====================

function buildDailySheet(ws: ExcelJS.Worksheet, header: DayHeader, details: DayDetail[]) {
  // Layout (A4 form):
  // - Title
  // - Meta blocks
  // - Summary row
  // - Table

  // Columns (8)
  // portrait try: keep within ~80 total width; otherwise landscape.
  // Portrait widths tuned to fit A4 without dropping font < 10.
  // If still too wide, a4Setup will switch to landscape automatically.
  const colPortrait = [5, 8, 8, 10, 16, 9, 6, 16]; // total 78
  const colLandscape = [5, 9, 9, 12, 24, 10, 6, 24]; // total 99

  // We start with portrait preference; a4Setup will switch if too wide.
  ws.columns = colPortrait.map((w) => ({ width: w }));

  // Title
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "業務日報書";
  ws.getCell("A1").font = { bold: true, size: 16, name: "Yu Gothic" };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  // Meta
  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `作業者：${header.reporter_name}`;
  ws.getCell("A2").font = { bold: true, size: 12, name: "Yu Gothic" };

  ws.mergeCells("E2:H2");
  ws.getCell("E2").value = `日付：${String(header.ymd).replaceAll("-", "/")}`;
  ws.getCell("E2").font = { bold: true, size: 12, name: "Yu Gothic" };
  ws.getCell("E2").alignment = { horizontal: "right" };

  ws.mergeCells("A3:D3");
  ws.getCell("A3").value = `給与月：${header.cycle_ym.replace("-", "/")}`;

  ws.mergeCells("E3:F3");
  ws.getCell("E3").value = `距離：${Number(header.total_km ?? 0).toFixed(1)}Km`;

  ws.mergeCells("G3:H3");
  ws.getCell("G3").value = `休暇：${header.leave_type ?? ""}`;
  ws.getCell("G3").alignment = { horizontal: "right" };

  // Meta styling (no grid)
  for (const rr of [2, 3, 4]) {
    ws.getRow(rr).height = 18;
    setRowStyle(ws, rr, {
      font: { size: 11, name: "Yu Gothic" },
      alignment: { vertical: "middle" },
      fill: THEME.headerFill as any,
    });
  }
  ws.getCell("A2").font = { bold: true, size: 12, name: "Yu Gothic" };
  ws.getCell("E2").font = { bold: true, size: 12, name: "Yu Gothic" };
  ws.getCell("A3").font = { bold: true, size: 11, name: "Yu Gothic" };
  ws.getCell("E3").font = { bold: true, size: 11, name: "Yu Gothic" };
  ws.getCell("G3").font = { bold: true, size: 11, name: "Yu Gothic" };

  // Summary labels
  ws.getRow(5).values = ["開始", "終了", "実働", "除外", "★合計", "", "", ""]; // A..H
  ws.getRow(5).font = { bold: true, name: "Yu Gothic" };
  ws.getRow(5).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(6).values = [
    header.start_hm ?? "",
    header.end_hm ?? "",
    minutesToHHMM(header.work_minutes ?? 0),
    minutesToHHMM(header.exclude_minutes ?? 0),
    Math.floor(Math.max(0, Number(header.work_minutes ?? 0)) / 15),
    "",
    "",
    "",
  ];
  ws.getRow(6).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 20;
  ws.getRow(6).height = 20;

  // Table header
  const headRow = 8;
  ws.getRow(headRow).values = ["No", "開始", "終了", "区分", "現場名", "実働", "★", "メモ"];
  ws.getRow(headRow).font = { bold: true, name: "Yu Gothic" };
  ws.getRow(headRow).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(headRow).height = 20;

  // Table rows
  let r = headRow + 1;
  const rows = details
    .filter((x) => (x.start_hm || x.end_hm || x.site_name || x.work_type || (x.work_minutes ?? 0) > 0 || x.note))
    .slice(0, 40); // keep printable; if >40, Excel will shrink

  rows.forEach((d, i) => {
    ws.getRow(r).values = [
      i + 1,
      d.start_hm ?? "",
      d.end_hm ?? "",
      d.work_type ?? "",
      d.site_name ?? "",
      minutesToHHMM(d.work_minutes ?? 0),
      Math.floor(Math.max(0, Number(d.work_minutes ?? 0)) / 15),
      d.note ?? "",
    ];
    ws.getRow(r).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getRow(r).height = 18;
    r++;
  });

  // Borders (NO grid in header area)
  const last = Math.max(headRow, r - 1);
  // summary block (A5:E6)
  borderAll(ws, 5, 6, 1, 5);
  // detail table (A8:Hlast)
  borderAll(ws, headRow, last, 1, 8);
  // make sure header/meta has no borders
  clearBorders(ws, 2, 4, 1, 8);

  // Heuristic: prefer portrait, but if text in 現場名/メモ is long, use wider columns.
  // This reduces the chance Excel will shrink print scale so much that the effective text becomes < 10pt.
  const maxSite = Math.max(
    0,
    ...rows.map((x) => String(x.site_name ?? "").length)
  );
  const maxNote = Math.max(
    0,
    ...rows.map((x) => String(x.note ?? "").length)
  );
  const useLandscapeCols = maxSite > 20 || maxNote > 20;
  if (useLandscapeCols) {
    ws.columns = colLandscape.map((w) => ({ width: w }));
  }

  // Print area: up to last row
  const printArea = `A1:H${Math.max(12, last)}`;
  a4Setup(ws, {
    preferred: useLandscapeCols ? "landscape" : "portrait",
    colWidths: (ws.columns ?? []).map((c) => Number(c.width ?? 10)),
    minFontSize: 10,
    headerRowsToRepeat: 8,
    printArea,
  });
}

function buildCompanyCycleSheet(ws: ExcelJS.Worksheet, cycleYm: string, rows: CycleRow[]) {
  // A4 summary sheet (print-ready) matching your confirmed UI
  // (1 row title) + (2 rows summary) + (table)
  ws.columns = [
    { width: 6 },  // No
    { width: 10 }, // 社員コード
    { width: 20 }, // 氏名
    { width: 10 }, // 勤務
    { width: 10 }, // 残業
    { width: 10 }, // 規定
    { width: 10 }, // 残り
    { width: 8 },  // Km
    { width: 8 },  // 宿泊
  ];

  const filtered = rows.filter((x) => (x.employee_code || x.reporter_name) && String(x.cycle_ym) === cycleYm);
  const sumKm = filtered.reduce((a, b) => a + Number(b.total_km_sum ?? 0), 0);
  const sumStay = filtered.reduce((a, b) => a + Number(b.stay_nights ?? 0), 0);
  const sumWorkMin = filtered.reduce((a, b) => a + normalizeWorkMinutes(b), 0);
  const sumOtMin = filtered.reduce((a, b) => {
    const workMin = normalizeWorkMinutes(b);
    const baseMin = baseHoursByCycle(cycleYm) * 60;
    return a + Math.max(0, workMin - baseMin);
  }, 0);

  // Title
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = `会社まとめ（給与月：${cycleYm.replace("-", "/")}）`;
  ws.getCell("A1").font = { bold: true, size: 14, name: "Yu Gothic" };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  // Summary (no borders)
  ws.getCell("A2").value = "総距離";
  ws.getCell("B2").value = `${sumKm.toFixed(1)}Km`;
  ws.getCell("D2").value = "総宿泊";
  ws.getCell("E2").value = `${sumStay}日`;
  ws.getCell("G2").value = "出力日付";
  ws.getCell("H2").value = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  ws.mergeCells("H2:I2");

  ws.getCell("A3").value = "総勤務時間";
  ws.getCell("B3").value = minutesToHHMM(sumWorkMin);
  ws.getCell("D3").value = "残業時間";
  ws.getCell("E3").value = minutesToHHMM(sumOtMin);
  ws.getCell("G3").value = "社員数";
  ws.getCell("H3").value = `${filtered.length}人`;
  ws.mergeCells("H3:I3");

  for (const rr of [2, 3]) {
    ws.getRow(rr).height = 18;
    for (const col of ["A", "D", "G"]) {
      ws.getCell(`${col}${rr}`).font = { bold: true, size: 11, name: "Yu Gothic" };
    }
    for (const col of ["B", "E", "H"]) {
      ws.getCell(`${col}${rr}`).font = { size: 11, name: "Yu Gothic" };
    }
    ws.getRow(rr).alignment = { vertical: "middle" };
  }
  clearBorders(ws, 2, 3, 1, 9);

  // Table
  const head = 5;
  ws.getRow(head).values = ["No", "社員コード", "氏名", "勤務", "残業", "規定", "残り", "Km", "宿泊"];
  ws.getRow(head).font = { bold: true, name: "Yu Gothic", size: 11 };
  ws.getRow(head).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(head).height = 20;

  let r = head + 1;
  filtered.forEach((x, i) => {
    const workMin = normalizeWorkMinutes(x);
    const baseMin = baseHoursByCycle(cycleYm) * 60;
    const reqMin = hhmmToMinutes(x.required_hm ?? "0:00");
    const displayWorkHm = minutesToHHMM(workMin);
    const displayOvertimeHm = minutesToHHMM(Math.max(0, workMin - baseMin));
    const displayRemainHm = minutesToHHMM(Math.max(0, reqMin - workMin));

    ws.getRow(r).values = [
      i + 1,
      x.employee_code ?? "",
      x.user_name?.trim() ? x.user_name : x.reporter_name,
      displayWorkHm,
      displayOvertimeHm,
      x.required_hm ?? "0:00",
      displayRemainHm,
      Number(x.total_km_sum ?? 0).toFixed(1),
      `${x.stay_nights ?? 0}`,
    ];
    ws.getRow(r).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 18;
    r++;
  });

  const last = Math.max(head, r - 1);
  borderAll(ws, head, last, 1, 9);

  const printArea = `A1:I${Math.max(12, last)}`;
  a4Setup(ws, {
    preferred: "portrait",
    colWidths: (ws.columns ?? []).map((c) => Number(c.width ?? 10)),
    minFontSize: 10,
    headerRowsToRepeat: head,
    printArea,
  });
}



// =====================
// More Builders (②/④/⑤)
// =====================

type MonthlyHeader = {
  reporter_name: string;
  user_name: string | null;
  employee_code: string | null;
  cycle_ym: string;
  work_hm: string;
  overtime_hm: string;
  required_hm: string;
  remain_hm: string;
  total_km_sum: number;
  work_days: number;
  absent_days: number;
  stay_nights: number;
};

type MonthlyDay = {
  reporter_name: string;
  ymd: string;
  start_hm: string | null;
  end_hm: string | null;
  exclude_minutes: number;
  work_minutes: number;
  total_km: number;
  leave_type: string | null;
};

type GenbaAllRow = {
  site_name: string;
  plan_genba_stars: number;
  plan_seizo_stars: number;
  plan_total_stars: number;
  current_genba_stars: number;
  current_seizo_stars: number;
  current_total_stars: number;
  remaining_genba_stars: number;
  remaining_seizo_stars: number;
  remaining_total_stars: number;
  case_name: string | null;
  address: string | null;
  project_no: string | null;
  start_date: string | null;
  end_date: string | null;
};

type SiteMaster = {
  site_name: string;
  case_name: string | null;
  address: string | null;
  project_no: string | null;
  start_date: string | null;
  end_date: string | null;
  plan_genba_stars: number | null;
  plan_seizo_stars: number | null;
};

type SiteWorkBase = {
  reporter_name: string;
  genba_stars: number;
  seizo_stars: number;
};

function jpDate(ymd: string) {
  return String(ymd).replaceAll('-', '/');
}

function jpDow(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  const a = ['日', '月', '火', '水', '木', '金', '土'];
  return a[d.getDay()] ?? '';
}

function buildMonthlyWorkerSheet(
  wb: ExcelJS.Workbook,
  header: MonthlyHeader,
  days: MonthlyDay[],
  details: DayDetail[]
) {
  const displayName = header.user_name && String(header.user_name).trim() ? header.user_name : header.reporter_name;

  const ws = wb.addWorksheet('勤務表');

  // 8 columns similar to UI day-list
  ws.columns = [
    { width: 14 }, // 日付
    { width: 8 }, // 出社
    { width: 8 }, // 退社
    { width: 8 }, // 除外
    { width: 8 }, // 実働
    { width: 6 }, // ★
    { width: 10 }, // 休
    { width: 8 }, // Km
  ];

  // Title
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `勤務表（給与月：${header.cycle_ym.replace('-', '/')}）`;
  ws.getCell('A1').font = { bold: true, size: 14, name: 'Yu Gothic' };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Meta blocks (similar to your agreed layout)
  ws.getCell('A2').value = '報告者：';
  ws.getCell('B2').value = displayName;
  ws.getCell('A3').value = '給与月：';
  ws.getCell('B3').value = header.cycle_ym.replace('-', '/');

  ws.getCell('A4').value = '総勤務時間：';
  ws.getCell('B4').value = header.work_hm ?? '0:00';
  ws.getCell('D4').value = '残業時間：';
  ws.getCell('E4').value = header.overtime_hm ?? '0:00';

  ws.getCell('A5').value = '総距離：';
  ws.getCell('B5').value = `${Number(header.total_km_sum ?? 0).toFixed(1)}Km`;
  ws.getCell('D5').value = '総宿泊：';
  ws.getCell('E5').value = `${header.stay_nights ?? 0}日`;

  ws.getCell('A6').value = '規定時間：';
  ws.getCell('B6').value = header.required_hm ?? '0:00';
  ws.getCell('D6').value = '残り時間：';
  ws.getCell('E6').value = header.remain_hm ?? '0:00';

  ws.getCell('D2').value = '出力日付：';
  ws.getCell('E2').value = new Date().toISOString().slice(0, 10).replaceAll('-', '/');

  // Styling meta (no borders, clear hierarchy)
  for (const rr of [2, 3, 4, 5, 6]) {
    ws.getRow(rr).height = 18;
    setRowStyle(ws, rr, {
      font: { size: 11, name: "Yu Gothic" },
      alignment: { vertical: "middle" },
      fill: THEME.headerFill as any,
    });
  }
  for (const addr of ["A2", "A3", "A4", "A5", "A6", "D2", "D4", "D5", "D6"]) {
    ws.getCell(addr).font = { bold: true, size: 11, name: "Yu Gothic" };
  }

  // Day table header
  const headRow = 8;
  ws.getRow(headRow).values = ['日付', '出社', '退社', '除外', '実働', '★', '休', 'Km'];
  ws.getRow(headRow).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(headRow).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(headRow).height = 20;

  let r = headRow + 1;
  const filtered = days.filter((d) => {
    const has = d.start_hm || d.end_hm || (d.work_minutes ?? 0) > 0 || (d.exclude_minutes ?? 0) > 0 || (d.total_km ?? 0) > 0 || (d.leave_type && String(d.leave_type).trim());
    return has;
  });

  for (const d of filtered) {
    const dow = jpDow(d.ymd);
    const dateLabel = `${jpDate(d.ymd)}（${dow}）`;
    const stars = Math.floor(Math.max(0, Number(d.work_minutes ?? 0)) / 15);
    ws.getRow(r).values = [
      dateLabel,
      d.start_hm ?? '',
      d.end_hm ?? '',
      minutesToHHMM(d.exclude_minutes ?? 0),
      minutesToHHMM(d.work_minutes ?? 0),
      stars,
      d.leave_type ?? '',
      Number(d.total_km ?? 0).toFixed(1),
    ];
    ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 18;
    r++;
  }

  // Borders: only tables (header area has NO grid)
  const lastDay = Math.max(r - 1, headRow);
  borderAll(ws, headRow, lastDay, 1, 8);
  clearBorders(ws, 2, 6, 1, 8);

  // 工事作業量まとめ (by site)
  // Aggregate stars by site and split into 現場/製造 using work_type contains '製造'
  const agg = new Map();
  for (const d of details) {
    const site = (d.site_name ?? '').trim();
    if (!site) continue;
    const wt = (d.work_type ?? '').toString();
    const stars = Math.floor(Math.max(0, Number(d.work_minutes ?? 0)) / 15);
    if (!agg.has(site)) agg.set(site, { genba: 0, seizo: 0, total: 0 });
    const o = agg.get(site);
    if (wt.includes('製造')) o.seizo += stars;
    else o.genba += stars;
    o.total += stars;
  }

  const sites = Array.from(agg.entries())
    .map(([site_name, v]) => ({ site_name, ...v }))
    .sort((a, b) => a.site_name.localeCompare(b.site_name, 'ja'));

  const start2 = lastDay + 3;
  ws.mergeCells(`A${start2}:H${start2}`);
  ws.getCell(`A${start2}`).value = '工事作業量まとめ';
  ws.getCell(`A${start2}`).font = { bold: true, size: 12, name: 'Yu Gothic' };
  ws.getCell(`A${start2}`).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(start2).height = 20;

  const head2 = start2 + 1;
  ws.getRow(head2).values = ['No', '現場名', '現場', '製造', '総合'];
  ws.getRow(head2).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(head2).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(head2).height = 18;

  let rr = head2 + 1;
  sites.forEach((s, i) => {
    ws.getRow(rr).values = [i + 1, s.site_name, s.genba, s.seizo, s.total];
    ws.getRow(rr).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rr).height = 18;
    rr++;
  });

  const last2 = rr - 1;
  borderAll(ws, head2, Math.max(last2, head2), 1, 5);

  const printArea = `A1:H${Math.max(15, last2)}`;
  a4Setup(ws, {
    preferred: 'portrait',
    colWidths: (ws.columns ?? []).map((c) => Number(c.width ?? 10)),
    minFontSize: 10,
    headerRowsToRepeat: headRow,
    printArea,
  });
}

function buildGenbaAllSheet(ws: ExcelJS.Worksheet, rows: GenbaAllRow[]) {
  // 10 columns: site + 9 values (3 groups)
  ws.columns = [
    { width: 30 },
    { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 },
  ];

  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = '工事一覧（全期間・累計）';
  ws.getCell('A1').font = { bold: true, size: 14, name: 'Yu Gothic' };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // header rows like UI
  ws.getRow(3).values = ['現場名', '予定★数', '', '', '現在★数', '', '', '残り★数', '', ''];
  ws.getRow(3).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(3).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 20;

  // merge groups
  ws.mergeCells('B3:D3');
  ws.mergeCells('E3:G3');
  ws.mergeCells('H3:J3');

  ws.getRow(4).values = ['', '現場★数', '製造★数', '総合★数', '現場★数', '製造★数', '総合★数', '現場★数', '製造★数', '総合★数'];
  ws.getRow(4).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 20;

  let r = 5;
  const list = rows.filter((x) => (x.site_name ?? '').trim());
  for (const x of list) {
    ws.getRow(r).values = [
      x.site_name,
      x.plan_genba_stars ?? 0,
      x.plan_seizo_stars ?? 0,
      x.plan_total_stars ?? 0,
      x.current_genba_stars ?? 0,
      x.current_seizo_stars ?? 0,
      x.current_total_stars ?? 0,
      x.remaining_genba_stars ?? 0,
      x.remaining_seizo_stars ?? 0,
      x.remaining_total_stars ?? 0,
    ];
    ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 18;
    // left align site
    ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    r++;
  }

  // totals
  const sum = (k: keyof GenbaAllRow) => list.reduce((a, b) => a + Number((b as any)[k] ?? 0), 0);
  ws.getRow(r).values = [
    '総合',
    sum('plan_genba_stars'),
    sum('plan_seizo_stars'),
    sum('plan_total_stars'),
    sum('current_genba_stars'),
    sum('current_seizo_stars'),
    sum('current_total_stars'),
    sum('remaining_genba_stars'),
    sum('remaining_seizo_stars'),
    sum('remaining_total_stars'),
  ];
  ws.getRow(r).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 20;

  // borders
  borderAll(ws, 3, r, 1, 10);

  const printArea = `A1:J${r}`;
  a4Setup(ws, {
    preferred: 'landscape',
    colWidths: (ws.columns ?? []).map((c) => Number(c.width ?? 10)),
    minFontSize: 10,
    headerRowsToRepeat: 4,
    printArea,
  });
}

function buildGenbaSiteSheet(
  ws: ExcelJS.Worksheet,
  site_name: string,
  master: SiteMaster | null,
  workers: { reporter_name: string; genba: number; seizo: number; total: number }[],
  nowG: number,
  nowS: number
) {
  ws.columns = [
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = '現場管理（詳細）';
  ws.getCell('A1').font = { bold: true, size: 14, name: 'Yu Gothic' };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.getCell('A2').value = '現場名：';
  ws.getCell('B2').value = site_name;
  ws.mergeCells('B2:D2');

  const m = master;
  ws.getCell('A3').value = '件名：';
  ws.getCell('B3').value = m?.case_name ?? '';
  ws.mergeCells('B3:D3');

  ws.getCell('A4').value = '所在地：';
  ws.getCell('B4').value = m?.address ?? '';
  ws.mergeCells('B4:D4');

  ws.getCell('A5').value = '工番：';
  ws.getCell('B5').value = m?.project_no ?? '';
  ws.mergeCells('B5:D5');

  ws.getCell('A6').value = '開始日付：';
  ws.getCell('B6').value = m?.start_date ? jpDate(m.start_date) : '';
  ws.getCell('C6').value = '終了日付：';
  ws.getCell('D6').value = m?.end_date ? jpDate(m.end_date) : '';

  // Meta styling (no borders)
  for (const rr of [2, 3, 4, 5, 6]) {
    ws.getRow(rr).height = 18;
    setRowStyle(ws, rr, { font: { size: 11, name: 'Yu Gothic' }, alignment: { vertical: 'middle' }, fill: THEME.headerFill as any });
  }
  for (const addr of ['A2', 'A3', 'A4', 'A5', 'A6', 'C6']) {
    ws.getCell(addr).font = { bold: true, size: 11, name: 'Yu Gothic' };
  }

  // Plan/Now/Remain summary
  const planG = Number(m?.plan_genba_stars ?? 0);
  const planS = Number(m?.plan_seizo_stars ?? 0);
  const planT = planG + planS;
  const nowT = nowG + nowS;
  const remG = planG - nowG;
  const remS = planS - nowS;
  const remT = planT - nowT;

  ws.getRow(8).values = ['', '予定（現場★）', '予定（製造★）', '予定（総合★）'];
  ws.getRow(9).values = ['', planG, planS, planT];
  ws.getRow(10).values = ['', '現在（現場★）', '現在（製造★）', '現在（総合★）'];
  ws.getRow(11).values = ['', nowG, nowS, nowT];
  ws.getRow(12).values = ['', '残り（現場★）', '残り（製造★）', '残り（総合★）'];
  ws.getRow(13).values = ['', remG, remS, remT];

  for (const rr of [8, 10, 12]) {
    ws.getRow(rr).font = { bold: true, name: 'Yu Gothic' };
    ws.getRow(rr).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rr).height = 18;
  }
  for (const rr of [9, 11, 13]) {
    ws.getRow(rr).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rr).height = 18;
  }

  // Worker table
  const head = 15;
  ws.getRow(head).values = ['作業者', '現場★数', '製造★数', '総合★数'];
  ws.getRow(head).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(head).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(head).height = 20;

  let r = head + 1;
  for (const w of workers) {
    ws.getRow(r).values = [w.reporter_name, w.genba, w.seizo, w.total];
    ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 18;
    ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    r++;
  }

  // Total row
  const sum = (k: 'genba' | 'seizo' | 'total') => workers.reduce((a, b) => a + Number((b as any)[k] ?? 0), 0);
  ws.getRow(r).values = ['総合', sum('genba'), sum('seizo'), sum('total')];
  ws.getRow(r).font = { bold: true, name: 'Yu Gothic' };
  ws.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 20;

  // Borders: only the two tables (meta has NO grid)
  borderAll(ws, 8, 13, 1, 4);
  borderAll(ws, head, r, 1, 4);
  clearBorders(ws, 2, 6, 1, 4);

  const printArea = `A1:D${r}`;
  a4Setup(ws, {
    preferred: 'portrait',
    colWidths: (ws.columns ?? []).map((c) => Number(c.width ?? 10)),
    minFontSize: 10,
    headerRowsToRepeat: head,
    printArea,
  });
}
// =====================
// Route
// =====================

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "CURRENT SERVICE";
  wb.created = new Date();

  // Make Japanese printable by default
  wb.views = [{
    x: 0,
    y: 0,
    width: 10000,
    height: 20000,
    firstSheet: 0,
    activeTab: 0,
    visibility: 'visible'
  }];


  try {
    if (type === "daily_day") {
      const reporter_name = searchParams.get("reporter_name") ?? "";
      const ymd = searchParams.get("ymd") ?? "";
      if (!reporter_name || !ymd) {
        return NextResponse.json({ error: "missing reporter_name/ymd" }, { status: 400 });
      }

      const { data: hData, error: hErr } = await supabase
        .from("v_manager_day_list_app")
        .select("*")
        .eq("reporter_name", reporter_name)
        .eq("ymd", ymd)
        .limit(1);
      if (hErr) return NextResponse.json(hErr, { status: 500 });
      const header = hData?.[0] ? normalizeExcelHeader(hData[0]) : null;
      if (!header) return NextResponse.json({ error: "no header" }, { status: 404 });

      const { data: dData, error: dErr } = await supabase
        .from("v_manager_worker_day_detail")
        .select("reporter_name, ymd, idx, start_hm, end_hm, site_name, work_type, work_minutes, note")
        .eq("reporter_name", reporter_name)
        .eq("ymd", ymd)
        .order("idx", { ascending: true });
      if (dErr) return NextResponse.json(dErr, { status: 500 });
      const details = (dData ?? []) as DayDetail[];

      const ws = wb.addWorksheet(ymdToSheetName(ymd));
      buildDailySheet(ws, header, details);

      const buf = await wb.xlsx.writeBuffer();
      const filename = `${reporter_name}_業務日報書_${ymd}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    if (type === "daily_month") {
      const reporter_name = searchParams.get("reporter_name") ?? "";
      const cycle_ym = searchParams.get("cycle_ym") ?? "";
      if (!reporter_name || !cycle_ym) {
        return NextResponse.json({ error: "missing reporter_name/cycle_ym" }, { status: 400 });
      }

      const { startYmd, endYmd } = calcCycleRange(cycle_ym);
      if (!startYmd || !endYmd) {
        return NextResponse.json({ error: "invalid cycle_ym" }, { status: 400 });
      }

      // Fetch all day headers within cycle for this worker
      const { data: hRows, error: e0 } = await supabase
        .from("v_manager_day_list_app")
        .select("*")
        .eq("reporter_name", reporter_name)
        .gte("ymd", startYmd)
        .lte("ymd", endYmd)
        .order("ymd", { ascending: true });
      if (e0) return NextResponse.json(e0, { status: 500 });

      const headers = (hRows ?? []) as DayHeader[];

      for (const h of headers) {
        // Load detail for each day; create sheet only if has data
        const { data: dData, error: dErr } = await supabase
          .from("v_manager_worker_day_detail")
          .select("reporter_name, ymd, idx, start_hm, end_hm, site_name, work_type, work_minutes, note")
          .eq("reporter_name", reporter_name)
          .eq("ymd", h.ymd)
          .order("idx", { ascending: true });
        if (dErr) return NextResponse.json(dErr, { status: 500 });
        const details = (dData ?? []) as DayDetail[];

        const hasAny = details.some(
          (x) => (x.site_name || x.work_type || x.start_hm || x.end_hm || (x.work_minutes ?? 0) > 0 || x.note)
        );
        if (!hasAny && Number(h.work_minutes ?? 0) === 0 && Number(h.exclude_minutes ?? 0) === 0) {
          continue; // skip empty day
        }

        const ws = wb.addWorksheet(ymdToSheetName(h.ymd));
        buildDailySheet(ws, h, details);
      }

      if (wb.worksheets.length === 0) {
        const ws = wb.addWorksheet("EMPTY");
        ws.getCell("A1").value = "データなし";
        a4Setup(ws, { preferred: "portrait", colWidths: [20], minFontSize: 10, printArea: "A1:A1" });
      }

      const buf = await wb.xlsx.writeBuffer();
      const filename = `${reporter_name}_業務日報書_${cycle_ym}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    if (type === "company_cycle") {
      const cycle_ym = searchParams.get("cycle_ym") ?? "";
      if (!cycle_ym) {
        return NextResponse.json({ error: "missing cycle_ym" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("v_manager_time_cycle_summary")
        .select(
          "reporter_name, user_name, employee_code, cycle_ym, total_stars, work_hm, overtime_hm, required_hm, remain_hm, total_km_sum, work_days, absent_days, stay_nights"
        )
        .eq("cycle_ym", cycle_ym)
        .order("employee_code", { ascending: true });
      if (error) return NextResponse.json(error, { status: 500 });
      const rows = (data ?? []) as CycleRow[];
      const ws = wb.addWorksheet("会社まとめ");
      buildCompanyCycleSheet(ws, cycle_ym, rows);

      const buf = await wb.xlsx.writeBuffer();
      const filename = `会社まとめ_${cycle_ym}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    if (type === "monthly_worker") {
      const reporter_name = searchParams.get("reporter_name") ?? "";
      const cycle_ym = searchParams.get("cycle_ym") ?? "";
      if (!reporter_name || !cycle_ym) {
        return NextResponse.json({ error: "missing reporter_name/cycle_ym" }, { status: 400 });
      }

      const { startYmd, endYmd } = calcCycleRange(cycle_ym);
      if (!startYmd || !endYmd) {
        return NextResponse.json({ error: "invalid cycle_ym" }, { status: 400 });
      }

      const { data: hData, error: hErr } = await supabase
        .from("v_manager_time_cycle_summary")
        .select(
          "reporter_name, user_name, employee_code, cycle_ym, work_hm, overtime_hm, required_hm, remain_hm, total_km_sum, work_days, absent_days, stay_nights"
        )
        .eq("cycle_ym", cycle_ym)
        .eq("reporter_name", reporter_name)
        .limit(1);
      if (hErr) return NextResponse.json(hErr, { status: 500 });
      const header = (hData?.[0] ?? null) as MonthlyHeader | null;
      if (!header) return NextResponse.json({ error: "no header" }, { status: 404 });

      const { data: dData, error: dErr } = await supabase
        .from("v_manager_day_list_app")
        .select(
          "reporter_name, ymd, start_hm, end_hm, exclude_minutes, work_minutes, total_km, leave_type"
        )
        .eq("reporter_name", reporter_name)
        .gte("ymd", startYmd)
        .lte("ymd", endYmd)
        .order("ymd", { ascending: true });
      if (dErr) return NextResponse.json(dErr, { status: 500 });
      const days = (dData ?? []) as MonthlyDay[];

      const { data: detData, error: detErr } = await supabase
        .from("v_manager_worker_day_detail")
        .select("reporter_name, ymd, idx, start_hm, end_hm, site_name, work_type, work_minutes, note")
        .eq("reporter_name", reporter_name)
        .gte("ymd", startYmd)
        .lte("ymd", endYmd)
        .order("ymd", { ascending: true })
        .order("idx", { ascending: true });
      if (detErr) return NextResponse.json(detErr, { status: 500 });
      const details = (detData ?? []) as DayDetail[];

      buildMonthlyWorkerSheet(wb, header, days, details);

      const buf = await wb.xlsx.writeBuffer();
      const filename = `${reporter_name}_勤務表_${cycle_ym}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    if (type === "genba_all") {
      const { data, error } = await supabase
        .from("v_genba_site_summary_with_master")
        .select(
          "site_name, plan_genba_stars, plan_seizo_stars, plan_total_stars, current_genba_stars, current_seizo_stars, current_total_stars, remaining_genba_stars, remaining_seizo_stars, remaining_total_stars, case_name, address, project_no, start_date, end_date"
        )
        .order("site_name", { ascending: true });
      if (error) return NextResponse.json(error, { status: 500 });
      const rows = (data ?? []) as GenbaAllRow[];
      const ws = wb.addWorksheet("工事一覧");
      buildGenbaAllSheet(ws, rows);

      const buf = await wb.xlsx.writeBuffer();
      const filename = `工事一覧_全期間_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    if (type === "genba_site") {
      const site_name = searchParams.get("site_name") ?? "";
      if (!site_name) {
        return NextResponse.json({ error: "missing site_name" }, { status: 400 });
      }

      const { data: m1, error: e1 } = await supabase
        .from("site_master")
        .select(
          "site_name, case_name, address, project_no, start_date, end_date, plan_genba_stars, plan_seizo_stars"
        )
        .eq("site_name", site_name)
        .maybeSingle();
      if (e1) return NextResponse.json(e1, { status: 500 });
      const master = (m1 ?? null) as SiteMaster | null;

      const { data: base, error: e2 } = await supabase
        .from("v_genba_work_base")
        .select("reporter_name, genba_stars, seizo_stars")
        .eq("site_name", site_name);
      if (e2) return NextResponse.json(e2, { status: 500 });
      const rows = (base ?? []) as SiteWorkBase[];

      const map = new Map<string, { reporter_name: string; genba: number; seizo: number; total: number }>();
      let nowG = 0;
      let nowS = 0;
      for (const r of rows) {
        const name = r.reporter_name;
        if (!map.has(name)) map.set(name, { reporter_name: name, genba: 0, seizo: 0, total: 0 });
        const w = map.get(name)!;
        const g = Number(r.genba_stars ?? 0);
        const s = Number(r.seizo_stars ?? 0);
        w.genba += g;
        w.seizo += s;
        w.total += g + s;
        nowG += g;
        nowS += s;
      }

      const workers = Array.from(map.values()).sort((a, b) => a.reporter_name.localeCompare(b.reporter_name, "ja"));
      const ws = wb.addWorksheet("現場詳細");
      buildGenbaSiteSheet(ws, site_name, master, workers, nowG, nowS);

      const buf = await wb.xlsx.writeBuffer();
      const filename = `現場_${site_name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    return NextResponse.json({ error: `unsupported type: ${type}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
