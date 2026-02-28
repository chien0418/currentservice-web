export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ExportExcelMenu from "@/app/_components/ExportExcelMenu";

/* =======================
   UTIL
======================= */
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

function normalizeWorkHm(work_hm?: string | null, total_stars?: number | null) {
  const minsFromStars = starsToMinutes(total_stars);
  const minsFromWork = hhmmToMinutes(work_hm);
  // If stars exist and work_hm is missing/zero or clearly inconsistent, trust stars.
  if (minsFromStars > 0 && (minsFromWork === 0 || Math.abs(minsFromStars - minsFromWork) >= 60)) {
    return minutesToHHMM(minsFromStars);
  }
  return work_hm ?? "0:00";
}
function jpDate(ymd: string) {
  return ymd.replaceAll("-", "/");
}

function jpDow(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  const a = ["日", "月", "火", "水", "木", "金", "土"];
  return a[d.getDay()] ?? "";
}

function isSunday(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  return d.getDay() === 0;
}

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

function baseHoursByCycle(cycleYm: string) {
  // 基本時間:
  //   - 給与月が 31 日の月 => 177h
  //   - それ以外 => 171h
  const [yStr, mStr] = cycleYm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 177;
  // days in month
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days === 31 ? 177 : 171;
}

/* =======================
   TYPES
======================= */
type HeaderRow = {
  reporter_name: string;
  user_name: string | null;
  employee_code: string | null;
  cycle_ym: string;

  total_stars: number;
  work_hm: string;
  required_hm: string;
  remain_hm: string;

  absent_days: number;
  stay_nights: number;
  total_km_sum: number;
};

type DayRow = {
  reporter_name: string;
  ymd: string;

  start_hm: string | null;
  end_hm: string | null;

  exclude_minutes: number;
  work_minutes: number;

  total_km: number;
  total_stars: number; // (DB側の値。表示は work_minutes/15 で統一)

  leave_type: string | null;
};

function normalizeDayRow(raw: any) {
  const workMinutes = Number(raw?.work_minutes ?? raw?.total_minutes ?? 0);
  const startHm =
    (raw?.start_hm ?? raw?.min_start_hm ?? raw?.start_time ?? "") as string;
  const endHm =
    (raw?.end_hm ?? raw?.max_end_hm ?? raw?.end_time ?? "") as string;
  const excludeMinutes = Number(raw?.exclude_minutes ?? raw?.total_exclude_minutes ?? 0);
  const totalKm = Number(raw?.total_km ?? raw?.total_km_sum ?? raw?.km ?? 0);
  const totalStars =
    raw?.total_stars != null ? Number(raw.total_stars) : Math.floor(Math.max(0, workMinutes) / 15);
  const leaveType = (raw?.leave_type ?? "") as string;
  return {
    reporter_name: raw?.reporter_name as string,
    ymd: raw?.ymd as string,
    start_hm: startHm,
    end_hm: endHm,
    exclude_minutes: excludeMinutes,
    work_minutes: workMinutes,
    total_km: totalKm,
    total_stars: totalStars,
    leave_type: leaveType,
  } as DayRow;
}


export default async function DayList(props: {
  searchParams?: Promise<{ reporter_name?: string; cycle_ym?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const reporter_name = sp.reporter_name;
  const cycle_ym = sp.cycle_ym;

  if (!reporter_name || !cycle_ym) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.h1}>パラメータ不足</div>
          <pre style={styles.pre}>/day-list?reporter_name=...&cycle_ym=YYYY-MM</pre>
          <div style={{ marginTop: 12 }}>
            <Link href="/" style={styles.link}>
              ← 戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { startYmd, endYmd } = calcCycleRange(cycle_ym);

  // Header summary (1 row)
  const { data: hData, error: hErr } = await supabase
    .from("v_manager_time_cycle_summary")
    .select(
      "reporter_name, user_name, employee_code, cycle_ym, total_stars, work_hm, required_hm, remain_hm, absent_days, stay_nights, total_km_sum"
    )
    .eq("cycle_ym", cycle_ym)
    .eq("reporter_name", reporter_name)
    .limit(1);

  if (hErr) return <pre>{JSON.stringify(hErr, null, 2)}</pre>;
  const header = (hData?.[0] ?? null) as HeaderRow | null;


// ======= 補正: 規定時間が 0:00 の場合は cycle_required_time から補完 =======
let requiredMinutesFallback = 0;
if (!header?.required_hm || header.required_hm === "0:00") {
  const { data: reqRows, error: reqErr } = await supabase
    .from("cycle_required_time")
    .select("required_minutes")
    .eq("cycle_ym", cycle_ym)
    .eq("reporter_name", reporter_name)
    .limit(1);
  if (!reqErr) {
    requiredMinutesFallback = Number((reqRows?.[0] as any)?.required_minutes ?? 0);
  }
}


  // Day rows (ASC within cycle)
  const { data, error } = await supabase
    .from("v_manager_day_list_app")
    .select("*")
    .eq("reporter_name", reporter_name)
    .gte("ymd", startYmd)
    .lte("ymd", endYmd)
    .order("ymd", { ascending: true });

  if (error) return <pre>{JSON.stringify(error, null, 2)}</pre>;
  const rows = (data ?? []).map(normalizeDayRow) as DayRow[];

  const baseHours = baseHoursByCycle(cycle_ym);
  // ✅ 総★ は「勤務時間（work_hm）」から計算（15分=1★）
    const displayWorkHm = normalizeWorkHm(header?.work_hm, header?.total_stars);
  const workStars = header?.total_stars ?? Math.floor(hhmmToMinutes(displayWorkHm) / 15);



const workMinutes = starsToMinutes(workStars);
const requiredMinutes = hhmmToMinutes(header?.required_hm) || requiredMinutesFallback;
const displayRequiredHm = minutesToHHMM(requiredMinutes);
const displayRemainHm = minutesToHHMM(Math.max(0, requiredMinutes - workMinutes));
  const displayName =
    header?.user_name && String(header.user_name).trim()
      ? header.user_name
      : reporter_name;


  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supaProject = "";
  try { supaProject = supaUrl ? new URL(supaUrl).hostname.split(".")[0] : ""; } catch {}

  return (
    <main style={styles.page}>
      {/* ======= TOP HEADER ======= */}
      <div style={styles.topHeader}>
        <div style={styles.topTitle}>日別一覧</div>

        {process.env.NODE_ENV === "development" && supaUrl ? (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Supabase: {supaProject} / {supaUrl}
          </div>
        ) : null}

        <div style={styles.topMetaRow}>
          <div style={styles.bigName}>作業者：{displayName}</div>
          <div style={styles.bigCycle}>
            給与月：{cycle_ym.replace("-", "/")}
          </div>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>基本時間</div>
            <div style={styles.statValue}>{baseHours}:00</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>総★</div>
            <div style={styles.statValue}>{workStars}</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>勤務時間</div>
            <div style={styles.statValue}>{displayWorkHm}</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>宿泊日</div>
            <div style={styles.statValue}>{header?.stay_nights ?? 0}日</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>規定時間</div>
            <div style={styles.statValue}>{displayRequiredHm}</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>残り時間</div>
            <div style={styles.statValue}>{displayRemainHm}</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>休日数（休み/有給）</div>
            <div style={styles.statValue}>{header?.absent_days ?? 0}日</div>
          </div>

          <div style={styles.statBox}>
            <div style={styles.statLabel}>総距離</div>
            <div style={styles.statValue}>{header?.total_km_sum ?? 0}Km</div>
          </div>
        </div>

        <div style={styles.topMetaRow2}>
          <div style={styles.muted}>行をクリック → 日別詳細へ</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <ExportExcelMenu reporter_name={reporter_name} cycle_ym={cycle_ym} compact />
            <Link href={`/?cycle_ym=${encodeURIComponent(cycle_ym)}`} style={styles.backBtn}>
              ← 戻る
            </Link>
          </div>
        </div>
      </div>

      {/* ======= TABLE ======= */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>一覧（{jpDate(startYmd)} ～ {jpDate(endYmd)}）</div>

        {rows.length === 0 ? (
          <div style={styles.empty}>データなし</div>
        ) : (
          <div style={styles.tableWrapBlack}>
            {/* Header row */}
            <div style={styles.rowHead}>
              <div style={{ ...styles.cell, ...styles.cDate }}>日付</div>
              <div style={{ ...styles.cell, ...styles.cSmall }}>出社</div>
              <div style={{ ...styles.cell, ...styles.cSmall }}>退社</div>
              <div style={{ ...styles.cell, ...styles.cSmall }}>除外</div>
              <div style={{ ...styles.cell, ...styles.cSmall }}>実働</div>
              <div style={{ ...styles.cell, ...styles.cStar }}>★</div>
              <div style={{ ...styles.cell, ...styles.cLeave }}>休</div>
              <div style={{ ...styles.cell, ...styles.cKm }}>Km</div>
            </div>

            {rows.map((r, i) => {
              const dow = jpDow(r.ymd);
              const sunday = isSunday(r.ymd);
              const isLeave = !!(r.leave_type && String(r.leave_type).trim());
              // ✅ 1★ = 15分 (勤務時間/15)
              const dayStars = Math.floor(Math.max(0, Number(r.work_minutes ?? 0)) / 15);

              const bg = isLeave
                ? "#fff3d6"
                : sunday
                  ? "#ffe5e5"
                  : i % 2 === 0
                    ? "#ffffff"
                    : "#f8fbff";

              const href = `/day-detail?reporter_name=${encodeURIComponent(
                reporter_name
              )}&ymd=${r.ymd}&cycle_ym=${encodeURIComponent(cycle_ym)}`;

              return (
                <Link key={r.ymd} href={href} style={{ ...styles.rowLink, background: bg }}>
                  <div style={{ ...styles.cell, ...styles.cDate }}>
                    <div style={{ fontWeight: 900 }}>
                      {jpDate(r.ymd)}（{dow}）
                    </div>
                  </div>

                  <div style={{ ...styles.cell, ...styles.cSmall, textAlign: "center" }}>
                    {r.start_hm ?? ""}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cSmall, textAlign: "center" }}>
                    {r.end_hm ?? ""}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cSmall, textAlign: "center" }}>
                    {minutesToHHMM(r.exclude_minutes ?? 0)}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cSmall, textAlign: "center" }}>
                    {minutesToHHMM(r.work_minutes ?? 0)}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cStar, textAlign: "center" }}>
                    {dayStars}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cLeave, textAlign: "center" }}>
                    {r.leave_type ?? ""}
                  </div>

                  <div style={{ ...styles.cell, ...styles.cKm, textAlign: "center" }}>
                    {r.total_km ?? 0}
                  </div>

                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

/* =======================
   STYLES
======================= */
const styles: Record<string, React.CSSProperties> = {
  page: {
    alignItems: "center",
    textAlign: "center",
    padding: 18,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    background: "#f3f6fb",
    minHeight: "100vh",
    maxWidth: 1200,
    margin: "0 auto",
    fontSize: 15,
  },

  topHeader: {
    textAlign: "center",
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
    background: "#eaf3ff",
  },
  topTitle: { fontSize: 25, fontWeight: 900, color: "#111" },
  topMetaRow: {
    display: "grid",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    flexWrap: "wrap",
  },
  topMetaRow2: {
    display: "grid",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    flexWrap: "wrap",
  },
  bigName: { fontSize: 22, fontWeight: 900, color: "#ea0c0c" },
  bigCycle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#111",
    padding: "6px 12px",
    background: "#d7ebff",
    border: "2px solid #111",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },

  statsGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  statBox: {
    border: "2px solid #111",
    borderRadius: 12,
    background: "#fff",
    padding: 10,
  },
  statLabel: { fontSize: 14, fontWeight: 900, opacity: 0.75, textAlign: "left" }, //các 8 ô tổng hợp
  statValue: { marginTop: 4, fontSize: 18, fontWeight: 900, }, // dữ liệu đổ vào

  muted: { color: "#111", fontWeight: 800 },

  backBtn: { //nút trở lại
    textDecoration: "none",
    fontWeight: 900,
    color: "#111",
    background: "#ffd27a",
    border: "2px solid #111",
    padding: "8px 12px",
    borderRadius: 10,
    whiteSpace: "nowrap",
  },

  card: {
    marginTop: 12,
    background: "#fff",
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 10 },

  empty: {
    padding: 12,
    border: "2px dashed #111",
    borderRadius: 10,
    background: "#fafafa",
    fontWeight: 8,
    color: "#111",
  },

  tableWrapBlack: {
    border: "2px solid #d71a1a",
    borderRadius: 10,
    overflowX: "auto",
    overflowY: "hidden",
  },

  rowHead: {
    display: "grid",
    minWidth: 220 + 150*7,
    gridTemplateColumns: "220px 150px 150px 150px 150px 150px 150px 150px", //khung tiêu đề của bảng 31 ngày
    placeItems: "center", // ✅ center cả dọc + ngang
    background: "#cfe8ff",
    borderBottom: "2px solid #d81616",
    fontWeight: 900,
    color: "#111",
  },

  rowLink: { // bảng 31 ngày
    display: "grid",
    minWidth: 220 + 150*7,
    gridTemplateColumns: "220px 150px 150px 150px 150px 150px 150px 150px",
    placeItems: "center", // ✅ center cả dọc + ngang
    textDecoration: "none",
    color: "#111",
    borderBottom: "1px solid #111",
  },

  // column presets (balanced)
  cDate: { width: 220, textAlign: "center" },
  cSmall: { width: 150, textAlign: "center" },
  cStar: { width: 150, textAlign: "center" },
  cLeave: { width: 150, textAlign: "center" },
  cKm: { width: 150, textAlign: "center" },

  cell: {
    padding: "10px 10px",
    borderRight: "2px solid #111",
    whiteSpace: "nowrap",
    overflowX: "auto",
    overflowY: "hidden",
    textOverflow: "ellipsis",
  },

  chev: {
    width: 18,
    textAlign: "center",
    color: "#111",
    fontSize: 18,
    fontWeight: 900,
  },
  chevHead: { width: 18 },

  link: { color: "#111", fontWeight: 900, textDecoration: "underline" },
  pre: {
    background: "#0b1020",
    color: "#e5e7eb",
    padding: 12,
    borderRadius: 10,
    overflowX: "auto",
  },
  h1: { fontSize: 18, fontWeight: 900, margin: 0 },
};
