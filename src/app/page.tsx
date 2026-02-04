import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import CycleYmPicker from "@/app/_components/CycleYmPicker";
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

function formatCycleRange(cycleYm: string) {
  // cycleYm: YYYY-MM  (給与月)
  const [yStr, mStr] = cycleYm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return "―";
  // cycle: prevMonth-21 .. thisMonth-20
  const start = new Date(Date.UTC(y, m - 2, 21));
  const end = new Date(Date.UTC(y, m - 1, 20));
  const f = (d: Date) => {
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yy}/${mm}/${dd}`;
  };
  return `${f(start)}～${f(end)}`;
}

/* =======================
   TYPES
======================= */
type Row = {
  reporter_name: string;
  user_name: string | null;
  employee_code: string | null;

  cycle_ym: string;

  // sums
  total_stars: number;
  work_hm: string;     // 勤務時間
  overtime_hm: string; // 残業
  required_hm: string; // 規定時間
  remain_hm: string;   // 残り

  total_km_sum: number;

  work_days: number;   // 出勤日数
  absent_days: number; // 休日数（休み+有給）
  stay_nights: number; // 宿泊日
};

export default async function Home(props: {
  searchParams?: Promise<{ cycle_ym?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const cycle_ym_param = sp.cycle_ym;

  // 1) detect latest cycle if not provided
  let cycle_ym = cycle_ym_param ?? "";
  if (!cycle_ym) {
    const { data: latest, error: e0 } = await supabase
      .from("v_manager_time_cycle_summary")
      .select("cycle_ym")
      .order("cycle_ym", { ascending: false })
      .limit(1);

    if (e0) return <pre>{JSON.stringify(e0, null, 2)}</pre>;
    cycle_ym = latest?.[0]?.cycle_ym ?? "";
  }

  if (!cycle_ym) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.h1}>データなし</div>
          <div style={styles.muted}>
            v_manager_time_cycle_summary に cycle_ym がありません
          </div>
        </div>
      </main>
    );
  }

  // 2) load rows for this cycle
  const { data, error } = await supabase
    .from("v_manager_time_cycle_summary")
    .select(
      "reporter_name, user_name, employee_code, cycle_ym, total_stars, work_hm, overtime_hm, required_hm, remain_hm, total_km_sum, work_days, absent_days, stay_nights"
    )
    .eq("cycle_ym", cycle_ym)
    .order("employee_code", { ascending: true });

  if (error) return <pre>{JSON.stringify(error, null, 2)}</pre>;

  const rows = (data ?? []) as Row[];

  // ======= header summary (会社集計) =======
  const totalWorkMinutes = rows.reduce((a, r) => a + hhmmToMinutes(r.work_hm), 0);
  const totalWorkHm = minutesToHHMM(totalWorkMinutes);
  const totalKm = rows.reduce((a, r) => a + Number(r.total_km_sum ?? 0), 0);
  const totalStay = rows.reduce((a, r) => a + Number(r.stay_nights ?? 0), 0);
  const employeeSet = new Set(
    rows.map((r) => (r.employee_code && String(r.employee_code).trim() ? r.employee_code : r.reporter_name))
  );
  const totalEmployees = employeeSet.size;



  return (
    <main style={styles.page}>
      {/* Top header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.title}>時間管理（管理者）</div>

          <div style={styles.cycleBox}>
            <div style={styles.cycleLabel}>給与月</div>
            <div style={styles.cycleYm}>{cycle_ym.replace("-", "/")}</div>
            <div style={styles.cycleRange}>{formatCycleRange(cycle_ym)}</div>
          </div>

          {/* ✅ 1-1: 年/月（給与月=endmonth）選択 */}
          <CycleYmPicker cycleYm={cycle_ym} years={[2026, 2027, 2028]} />

          {/* ✅ 1-1: 会社集計（4ラベル） */}
          <div style={styles.summaryGrid}>
            <div style={styles.sumBox}>
              <div style={styles.sumLabel}>総勤務時間</div>
              <div style={styles.sumValue}>{totalWorkHm}</div>
            </div>
            <div style={styles.sumBox}>
              <div style={styles.sumLabel}>総距離</div>
              <div style={styles.sumValue}>{totalKm.toFixed(1)}Km</div>
            </div>
            <div style={styles.sumBox}>
              <div style={styles.sumLabel}>総宿泊</div>
              <div style={styles.sumValue}>{totalStay}日</div>
            </div>
            <div style={styles.sumBox}>
              <div style={styles.sumLabel}>社員数</div>
              <div style={styles.sumValue}>{totalEmployees}人</div>
            </div>
          </div>

          {/* ✅ 1-1: この画面では上の集計BOX（総★ / 距離など）を表示しない */}

          <div style={styles.headerBtns}>
            <Link
              href={`/genba?cycle_ym=${encodeURIComponent(cycle_ym)}`}
              style={styles.btnPrimary}
            >
              現場管理へ
            </Link>
            <Link href={`/?cycle_ym=${encodeURIComponent(cycle_ym)}`} style={styles.btnGhost}>
              更新
            </Link>
          </div>

          {/* ✅ Excel export (menu) - placed BELOW buttons so it won't cover dropdown menus */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            <ExportExcelMenu cycle_ym={cycle_ym} />
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.logoWrap}>
            <Image
              src="/company_logo.png"
              alt="Current Service"
              width={220}
              height={220}
              style={styles.logo}
              priority
            />
            <div style={styles.companyName}>（株）カレントサービス</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>作業者一覧</div>

        {rows.length === 0 ? (
          <div style={styles.empty}>データなし</div>
        ) : (
          <div style={styles.table}>
            <div style={{ ...styles.row, ...styles.rowHead }}>
              <div style={{ ...styles.cell, width: 240, textAlign: "center" }}>作業者</div>
              <div style={{ ...styles.cell, width: 120, textAlign: "center" }}>社員コード</div>
              <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>出勤日</div>
              <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>欠勤日</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>宿泊日</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>総距離</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>規定時間</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>残り時間</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>勤務時間</div>
              <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>残業</div>

            </div>

            {rows.map((r, i) => {
              const name =
                r.user_name && String(r.user_name).trim() ? r.user_name : r.reporter_name;
              const code = r.employee_code ?? "";
              const href = `/day-list?reporter_name=${encodeURIComponent(
                r.reporter_name
              )}&cycle_ym=${encodeURIComponent(cycle_ym)}`;

              return (
                <Link
                  key={`${r.reporter_name}-${r.cycle_ym}-${i}`}
                  href={href}
                  style={{
                    ...styles.rowLink,
                    background: i % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <div style={{ ...styles.cell, width: 240, textAlign: "center", fontWeight: 900 }}>
                    {name}
                  </div>

                  <div style={{ ...styles.cell, width: 120, textAlign: "center" }}>
                    {code}
                  </div>

                  <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>
                    {r.work_days ?? 0}
                  </div>
                  <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>
                    {r.absent_days ?? 0}
                  </div>
                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.stay_nights ?? 0}
                  </div>

                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.total_km_sum ?? 0}Km
                  </div>
                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.required_hm ?? "0:00"}
                  </div>
                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.remain_hm ?? "0:00"}
                  </div>
                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.work_hm ?? "0:00"}
                  </div>
                  <div style={{ ...styles.cell, width: 130, textAlign: "center" }}>
                    {r.overtime_hm ?? "0:00"}
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "clamp(12px, 3vw, 20px)",
    background: "#f3f6fb",
    minHeight: "100vh",
    maxWidth: 1200,
    margin: "0 auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    color: "#111",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    alignItems: "stretch",
  },
  headerLeft: { flex: 1, minWidth: 300 },
  headerRight: {
    width: 350,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 14,
  },
  logoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logo: {
    width: 220,
    height: "auto",
    objectFit: "contain",
  },
  companyName: {
    width: 300, // ✅ ロゴと同じ幅
    textAlign: "center",
    fontSize: 25,
    fontWeight: 900,
    letterSpacing: "0.12em",
    color: "#0b5a2a", // ✅ ロゴと同系の青
    lineHeight: 1.2,
  },

  title: { fontSize: 30, fontWeight: 900, textAlign: "center" },
  company: { margin: 6, fontSize: 18, fontWeight: 900, color: "#0b5a2a" },

  cycleBox: {
    marginTop: 12,
    textAlign: "center",
    border: "2px solid #111",
    borderRadius: 14,
    padding: 12,
    background: "#eaf3ff",
    display: "grid",
    gridTemplateColumns: "80px 1fr",
    rowGap: 4,
    columnGap: 10,
    alignItems: "center",
  },
  cycleLabel: { fontWeight: 900, },
  cycleYm: { fontSize: 18, fontWeight: 900 },
  cycleRange: { gridColumn: "1 / -1", opacity: 0.85, fontWeight: 800 },

  summaryGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  sumBox: {
    border: "2px solid #111",
    borderRadius: 12,
    padding: 10,
    background: "#fffdf7",
    textAlign: "left",
  },
  sumLabel: { fontSize: 14, fontWeight: 900, opacity: 0.8 },
  sumValue: { marginTop: 6, fontSize: 18, textAlign: "center", fontWeight: 900 },

  headerStats: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  stat: {
    border: "2px solid #111",
    borderRadius: 12,
    padding: 10,
    background: "#fffdf7",
  },
  statLabel: { fontSize: 12, fontWeight: 900, opacity: 0.8 },
  statValue: { marginTop: 4, fontSize: 18, fontWeight: 900 },

  headerBtns: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  btnPrimary: {
    textDecoration: "none",
    fontWeight: 900,
    color: "#111",
    background: "#36c6d3",
    border: "2px solid #111",
    padding: "10px 14px",
    borderRadius: 12,
    whiteSpace: "nowrap",
  },
  btnGhost: {
    textDecoration: "none",
    fontWeight: 900,
    color: "#111",
    background: "#ffd27a",
    border: "2px solid #111",
    padding: "10px 14px",
    borderRadius: 12,
    whiteSpace: "nowrap",
  },

  card: {
    marginTop: 12,
    background: "#fff",
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: 900, marginBottom: 10 },

  empty: {
    padding: 12,
    borderRadius: 12,
    border: "2px dashed #111",
    background: "#fafafa",
    fontWeight: 800,
  },

  table: {
    border: "2px solid #111",
    borderRadius: 10,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "stretch",
  },
  rowHead: {
    background: "#cfe8ff",
    borderBottom: "2px solid #111",
    fontWeight: 900,
  },
  rowLink: {
    display: "flex",
    alignItems: "stretch",
    textDecoration: "none",
    color: "#111",
    borderBottom: "1px solid #111",
  },
  cell: {
    padding: "10px 10px",
    borderRight: "2px solid #111",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  chev: {
    width: 18,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  h1: { fontSize: 18, fontWeight: 900, margin: 0 },
  muted: { color: "#444", fontWeight: 800, marginTop: 6 },
};