import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* =======================
   UTIL
======================= */
function formatCycleRange(cycleYm: string) {
  const [yStr, mStr] = cycleYm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return "―";
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

function calcCycleRangeYmd(cycleYm: string) {
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

function listDatesInclusive(startYmd: string, endYmd: string) {
  if (!startYmd || !endYmd) return [] as string[];
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

function jpDay(ymd: string) {
  return ymd.slice(8, 10);
}

/* =======================
   TYPES
======================= */
type WorkerRow = {
  reporter_name: string;
  user_name: string | null;
  employee_code: string | null;
};

type DayHeaderRow = {
  reporter_name: string;
  ymd: string;
  start_hm: string | null;
  end_hm: string | null;
  work_minutes: number;
  total_stars: number;
  leave_type: string | null;
};

// NOTE:
//  - DB側に「submitted」フラグがある場合はそれを使うのが正しい。
//  - このプロジェクトの公開済みWebでは、日別ヘッダ（v_manager_worker_day_header_app）を参照して
//    「入力あり」を提出済みの近似として表示する。
//  - 将来、submitted列が確定したら、この判定は差し替える。
function isSubmittedLike(r?: DayHeaderRow) {
  if (!r) return false;
  // heuristic: any meaningful input
  return (
    !!(r.start_hm && String(r.start_hm).trim()) ||
    !!(r.end_hm && String(r.end_hm).trim()) ||
    Number(r.work_minutes ?? 0) > 0 ||
    Number(r.total_stars ?? 0) > 0 ||
    !!(r.leave_type && String(r.leave_type).trim())
  );
}

export default async function SubmitStatusPage(props: {
  searchParams?: Promise<{ cycle_ym?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const cycle_ym_param = sp.cycle_ym;

  // detect latest cycle if not provided
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
          <div style={styles.muted}>cycle_ym が見つかりません</div>
          <div style={{ marginTop: 12 }}>
            <Link href="/" style={styles.link}>
              ← 戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { startYmd, endYmd } = calcCycleRangeYmd(cycle_ym);
  const days = listDatesInclusive(startYmd, endYmd);

  // Workers for this cycle (use manager cycle summary as source of truth)
  const { data: wData, error: wErr } = await supabase
    .from("v_manager_time_cycle_summary")
    .select("reporter_name, user_name, employee_code")
    .eq("cycle_ym", cycle_ym)
    .order("employee_code", { ascending: true });

  if (wErr) return <pre>{JSON.stringify(wErr, null, 2)}</pre>;
  const workers = (wData ?? []) as WorkerRow[];

  // Day headers for all workers within cycle
  // NOTE: filter by ymd range only; we join by reporter_name client-side
  const { data: dData, error: dErr } = await supabase
    .from("v_manager_worker_day_header_app")
    .select(
      "reporter_name, ymd, start_hm, end_hm, work_minutes, total_stars, leave_type"
    )
    .gte("ymd", startYmd)
    .lte("ymd", endYmd);

  if (dErr) return <pre>{JSON.stringify(dErr, null, 2)}</pre>;
  const dayRows = (dData ?? []) as DayHeaderRow[];

  // Index: reporter -> ymd -> row
  const idx = new Map<string, Map<string, DayHeaderRow>>();
  for (const r of dayRows) {
    if (!idx.has(r.reporter_name)) idx.set(r.reporter_name, new Map());
    idx.get(r.reporter_name)!.set(r.ymd, r);
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>日報提出状況</div>
          <div style={styles.sub}>
            給与月：{cycle_ym.replace("-", "/")}（{formatCycleRange(cycle_ym)}）
          </div>
          <div style={styles.note}>
            ※ 現時点では Web 側で「入力あり」を提出済み相当として表示しています。
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={`/?cycle_ym=${encodeURIComponent(cycle_ym)}`} style={styles.btnGhost}>
            ← 戻る
          </Link>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.tableWrap}>
          <div style={styles.table}>
            {/* header row */}
            <div style={{ ...styles.row, ...styles.rowHead }}>
              <div style={{ ...styles.cell, ...styles.stickyLeft1 }}>社員</div>
              <div style={{ ...styles.cell, ...styles.stickyLeft2 }}>コード</div>
              {days.map((ymd) => (
                <div key={ymd} style={{ ...styles.cell, width: 44, textAlign: "center" }}>
                  {jpDay(ymd)}
                </div>
              ))}
            </div>

            {/* worker rows */}
            {workers.map((w, i) => {
              const name =
                w.user_name && String(w.user_name).trim()
                  ? w.user_name
                  : w.reporter_name;
              const code = w.employee_code ?? "";
              const m = idx.get(w.reporter_name) ?? new Map();

              return (
                <div
                  key={`${w.reporter_name}-${i}`}
                  style={{
                    ...styles.row,
                    background: i % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <div style={{ ...styles.cell, ...styles.stickyLeft1, fontWeight: 900 }}>
                    {name}
                  </div>
                  <div style={{ ...styles.cell, ...styles.stickyLeft2, textAlign: "center" }}>
                    {code}
                  </div>

                  {days.map((ymd) => {
                    const r = m.get(ymd);
                    const ok = isSubmittedLike(r);
                    return (
                      <div
                        key={`${w.reporter_name}-${ymd}`}
                        title={ok ? "提出済み（入力あり）" : "未提出（入力なし）"}
                        style={{
                          ...styles.cell,
                          width: 44,
                          textAlign: "center",
                          padding: 0,
                        }}
                      >
                        <div
                          style={{
                            height: 28,
                            margin: 6,
                            borderRadius: 8,
                            border: "2px solid #111",
                            background: ok ? "#9ff0b3" : "#ffb3b3",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                          }}
                        >
                          {ok ? "✓" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 16,
    background: "#f3f6fb",
    minHeight: "100vh",
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
    alignItems: "center",
  },
  title: { fontSize: 26, fontWeight: 900 },
  sub: { marginTop: 4, fontWeight: 900, opacity: 0.85 },
  note: { marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.75 },
  card: {
    marginTop: 12,
    background: "#fff",
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
  },
  h1: { fontSize: 22, fontWeight: 900 },
  muted: { marginTop: 6, opacity: 0.8, fontWeight: 800 },
  link: {
    textDecoration: "none",
    fontWeight: 900,
    color: "#111",
    background: "#ffd27a",
    border: "2px solid #111",
    padding: "10px 14px",
    borderRadius: 12,
    display: "inline-block",
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

  tableWrap: {
    overflow: "auto",
    borderRadius: 12,
    border: "2px solid #111",
  },
  table: {
    minWidth: 900,
  },
  row: {
    display: "flex",
    alignItems: "stretch",
    borderBottom: "1px solid #d7d7d7",
  },
  rowHead: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "#eaf3ff",
    borderBottom: "2px solid #111",
  },
  cell: {
    padding: 10,
    borderRight: "1px solid #d7d7d7",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  stickyLeft1: {
    position: "sticky",
    left: 0,
    zIndex: 6,
    background: "inherit",
    width: 220,
  },
  stickyLeft2: {
    position: "sticky",
    left: 220,
    zIndex: 6,
    background: "inherit",
    width: 100,
  },
};
