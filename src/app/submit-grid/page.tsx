export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* =======================
   UTIL
======================= */
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

function formatCycleRange(cycleYm: string) {
  const { startYmd, endYmd } = calcCycleRangeYmd(cycleYm);
  if (!startYmd || !endYmd) return "―";
  const s = startYmd.replaceAll("-", "/");
  const e = endYmd.replaceAll("-", "/");
  return `${s}～${e}`;
}

function jpDow(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const a = ["日", "月", "火", "水", "木", "金", "土"];
  return a[d.getUTCDay()] ?? "";
}

function mmdd(ymd: string) {
  return `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}`;
}

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

function normalizeDayHeaderRow(raw: any): DayHeaderRow {
  const workMinutes = Number(raw?.work_minutes ?? raw?.total_minutes ?? 0);
  const startHm = (raw?.start_hm ?? raw?.min_start_hm ?? raw?.start_time ?? null) as any;
  const endHm = (raw?.end_hm ?? raw?.max_end_hm ?? raw?.end_time ?? null) as any;
  const totalStars =
    raw?.total_stars != null ? Number(raw.total_stars) : Math.floor(Math.max(0, workMinutes) / 15);
  const leaveType = (raw?.leave_type ?? null) as any;
  return {
    reporter_name: raw?.reporter_name,
    ymd: raw?.ymd,
    start_hm: startHm,
    end_hm: endHm,
    work_minutes: workMinutes,
    total_stars: totalStars,
    leave_type: leaveType,
  };
}

// “入力あり” = 日報入力済み
function hasInput(r?: DayHeaderRow) {
  if (!r) return false;
  return (
    !!(r.start_hm && String(r.start_hm).trim()) ||
    !!(r.end_hm && String(r.end_hm).trim()) ||
    Number(r.work_minutes ?? 0) > 0 ||
    Number(r.total_stars ?? 0) > 0 ||
    !!(r.leave_type && String(r.leave_type).trim())
  );
}

type CycleSubmissionRow = {
  employee_code: string;
  reporter_name: string | null;
  status: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  cycle_start: string;
  cycle_end: string;
};

export default async function SubmitGridPage(props: {
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
            <Link href="/" style={styles.btnGhost}>
              ← 戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { startYmd, endYmd } = calcCycleRangeYmd(cycle_ym);
  const days = listDatesInclusive(startYmd, endYmd);

  // Workers for this cycle
  const { data: wData, error: wErr } = await supabase
    .from("v_manager_time_cycle_summary")
    .select("reporter_name, user_name, employee_code")
    .eq("cycle_ym", cycle_ym)
    .order("employee_code", { ascending: true });

  if (wErr) return <pre>{JSON.stringify(wErr, null, 2)}</pre>;
  const workers = (wData ?? []) as WorkerRow[];

  // Day headers for all workers within cycle
  const { data: dData, error: dErr } = await supabase
    .from("v_manager_worker_day_header_app")
    .select("reporter_name, ymd, start_hm, end_hm, work_minutes, total_stars, leave_type")
    .gte("ymd", startYmd)
    .lte("ymd", endYmd);

  if (dErr) return <pre>{JSON.stringify(dErr, null, 2)}</pre>;
  const dayRows: DayHeaderRow[] = (dData ?? []).map(normalizeDayHeaderRow);

  // Index: reporter -> ymd -> row
  const idx = new Map<string, Map<string, DayHeaderRow>>();
  for (const r of dayRows) {
    if (!idx.has(r.reporter_name)) idx.set(r.reporter_name, new Map());
    idx.get(r.reporter_name)!.set(r.ymd, r);
  }

  // ✅ Cycle submissions (提出状態) — source of truth giống app
  const { data: sData, error: sErr } = await supabase
    .from("cycle_submissions")
    .select("employee_code, reporter_name, status, submitted_at, submitted_by, cycle_start, cycle_end")
    .eq("cycle_start", startYmd)
    .eq("cycle_end", endYmd);

  if (sErr) return <pre>{JSON.stringify(sErr, null, 2)}</pre>;

  const subIdx = new Map<string, CycleSubmissionRow>();
  for (const r of (sData ?? []) as CycleSubmissionRow[]) {
    if (r.employee_code) subIdx.set(r.employee_code, r);
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>提出管理（会社一覧）</div>
          <div style={styles.sub}>
            給与月：{cycle_ym.replace("-", "/")}（{formatCycleRange(cycle_ym)}）
          </div>
          <div style={styles.note}>
            セル：緑=入力あり（その日の日報） / 行：緑=提出済（ロック） / 解除=ロック解除
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
          <div style={styles.tableScroll}>
            <div style={styles.table}>
              {/* header row */}
              <div style={{ ...styles.row, ...styles.rowHead }}>
                <div style={{ ...styles.cell, ...styles.stickyLeft1 }}>作業者</div>
                <div style={{ ...styles.cell, ...styles.stickyLeft2, textAlign: "center" }}>社員コード</div>
                {days.map((ymd) => (
                  <div key={ymd} style={{ ...styles.cell, width: 56, textAlign: "center" }}>
                    <div style={{ fontWeight: 900 }}>{mmdd(ymd)}</div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>{jpDow(ymd)}</div>
                  </div>
                ))}
                <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>解除</div>
              </div>

              {/* worker rows */}
              {workers.map((w, i) => {
                const name = w.user_name && String(w.user_name).trim() ? w.user_name : w.reporter_name;
                const code = w.employee_code ?? "";
                const m = idx.get(w.reporter_name) ?? new Map();

                const sub = code ? subIdx.get(code) : undefined;
                const submitted = (sub?.status ?? "").toLowerCase() === "submitted";

                return (
                  <div
                    key={`${w.reporter_name}-${i}`}
                    style={{
                      ...styles.row,
                      background: submitted ? "#d9fbe3" : i % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <div style={{ ...styles.cell, ...styles.stickyLeft1, fontWeight: 900 }}>{name}</div>
                    <div style={{ ...styles.cell, ...styles.stickyLeft2, textAlign: "center" }}>{code}</div>

                    {days.map((ymd) => {
                      const r = m.get(ymd);
                      const ok = hasInput(r);
                      return (
                        <div
                          key={`${w.reporter_name}-${ymd}`}
                          title={ok ? "入力あり" : "入力なし"}
                          style={{ ...styles.cell, width: 56, textAlign: "center", padding: 0 }}
                        >
                          <div
                            style={{
                              height: 28,
                              margin: 6,
                              borderRadius: 8,
                              border: "2px solid #111",
                              background: ok ? "#9ff0b3" : "#fff",
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

                    <div style={{ ...styles.cell, width: 110, textAlign: "center" }}>
                      {submitted ? (
                        <form action="/api/cycle-submissions/unlock" method="post">
                          <input type="hidden" name="employee_code" value={code} />
                          <input type="hidden" name="cycle_start" value={startYmd} />
                          <input type="hidden" name="cycle_end" value={endYmd} />
                          <input type="hidden" name="cycle_ym" value={cycle_ym} />
                          <button style={styles.btnUnlock} type="submit">
                            解除
                          </button>
                        </form>
                      ) : (
                        <span style={{ opacity: 0.5, fontWeight: 900 }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: 900 },
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
    maxWidth: "100%",
    overflow: "hidden",
    borderRadius: 12,
    border: "2px solid #111",
  },
  tableScroll: {
    marginTop: 10,
    borderRadius: 10,
    maxWidth: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    WebkitOverflowScrolling: "touch",
  },
  table: { minWidth: 1100 },
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
    fontWeight: 900,
  },
  cell: {
    padding: 10,
    borderRight: "1px solid #d7d7d7",
    fontWeight: 800,
    whiteSpace: "nowrap",
    flex: "0 0 auto",
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
    width: 110,
  },

  btnUnlock: {
    padding: "6px 12px",
    borderRadius: 10,
    border: "2px solid #111",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
};
