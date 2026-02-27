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
    return `${hh}:${String(mm).padStart(2, "0")}`; // hh > 99 OK
}

function jpDate(ymd: string) {
    return ymd.replaceAll("-", "/");
}

function jpDow(ymd: string) {
    // ymd must be YYYY-MM-DD
    const d = new Date(`${ymd}T00:00:00`);
    const a = ["日", "月", "火", "水", "木", "金", "土"];
    return a[d.getDay()] ?? "";
}

/* =======================
   TYPES
======================= */
type HeaderRow = {
    reporter_name: string;
    ymd: string;
    cycle_ym: string;
    start_hm: string;
    end_hm: string;
    total_stars: number; // (DB側の値。表示は work_minutes/15 で統一)
    work_minutes: number;
    exclude_minutes: number;
};

type DetailRow = {
    reporter_name: string;
    ymd: string;
    idx: number;
    start_hm: string;
    end_hm: string;
    site_name: string;
    work_type: string;
    work_minutes: number;
    stars: number; // (DB側の値。表示は work_minutes/15 で統一)
    note: string;
};

/* =======================
   PAGE
======================= */
export default async function DayDetail(props: {
    searchParams?: Promise<{
        reporter_name?: string;
        ymd?: string;
        cycle_ym?: string;
    }>;
}) {
    const sp = (await props.searchParams) ?? {};
    const reporter_name = sp.reporter_name;
    const ymd = sp.ymd;
    const cycle_ym = sp.cycle_ym;

    if (!reporter_name || !ymd) {
        return (
            <main style={styles.page}>
                <div style={styles.card}>
                    <div style={styles.h1}>パラメータ不足</div>
                    <pre style={styles.pre}>/day-detail?reporter_name=...&ymd=YYYY-MM-DD</pre>
                    <div style={{ marginTop: 12 }}>
                        <Link href="/" style={styles.link}>
                            ← 戻る
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    /* ===== HEADER ===== */
    const { data: hData, error: hErr } = await supabase
        .from("v_manager_worker_day_header_app")
        .select("*")
        .eq("reporter_name", reporter_name)
        .eq("ymd", ymd)
        .limit(1);

    if (hErr) return <pre>{JSON.stringify(hErr, null, 2)}</pre>;
    const header = (hData?.[0] ?? null) as HeaderRow | null;
    // ✅ 1★ = 15分 (勤務時間/15)
    const headerStars = Math.floor(Math.max(0, Number(header?.work_minutes ?? 0)) / 15);

    /* ===== DETAIL ===== */
    const { data: dData, error: dErr } = await supabase
        .from("v_manager_worker_day_detail")
        .select("*")
        .eq("reporter_name", reporter_name)
        .eq("ymd", ymd)
        .order("idx", { ascending: true });

    if (dErr) return <pre>{JSON.stringify(dErr, null, 2)}</pre>;
    const details = (dData ?? []) as DetailRow[];

    const backHref = cycle_ym
        ? `/day-list?reporter_name=${encodeURIComponent(
            reporter_name
        )}&cycle_ym=${encodeURIComponent(cycle_ym)}`
        : `/day-list?reporter_name=${encodeURIComponent(reporter_name)}`;

    const cycleText = header?.cycle_ym ? header.cycle_ym : cycle_ym ?? "";

    return (
        <main style={styles.page}>
            {/* TOP HEADER (đậm + rõ) */}
            <div style={styles.topHeader}>
                <div style={styles.topTitle}>日別詳細</div>

                <div style={styles.topMetaRow}>
                    <div style={styles.bigName}>{reporter_name}</div>
                    <div style={styles.bigCycle}>
                        サイクル：{cycleText ? cycleText : "―"}
                    </div>
                </div>

                <div style={styles.topMetaRow2}>
                    <div style={styles.dateLine}>
                        {jpDate(ymd)}（{jpDow(ymd)}）
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <ExportExcelMenu
                            reporter_name={reporter_name}
                            ymd={ymd}
                            cycle_ym={cycle_ym ?? header?.cycle_ym ?? ""}
                            compact
                        />
                        <Link href={backHref} style={styles.backBtn}>
                            ← 日別一覧へ
                        </Link>
                    </div>
                </div>
            </div>

            {/* SUMMARY BLOCKS (đậm màu hơn) */}
            <div style={styles.summaryGrid}>
                <div style={styles.sumBox}>
                    <div style={styles.sumLabel}>開始</div>
                    <div style={styles.sumValueCenter}>{header?.start_hm ?? ""}</div>
                </div>

                <div style={styles.sumBox}>
                    <div style={styles.sumLabel}>終了</div>
                    <div style={styles.sumValueCenter}>{header?.end_hm ?? ""}</div>
                </div>

                <div style={styles.sumBoxStrong}>
                    <div style={styles.sumLabelStrong}>実働</div>
                    <div style={styles.sumValueRightStrong}>
                        {minutesToHHMM(header?.work_minutes ?? 0)}
                    </div>
                </div>

                <div style={styles.sumBox}>
                    <div style={styles.sumLabel}>除外</div>
                    <div style={styles.sumValueRight}>
                        {minutesToHHMM(header?.exclude_minutes ?? 0)}
                    </div>
                </div>

                <div style={styles.sumBox}>
                    <div style={styles.sumLabel}>★ 合計</div>
                    <div style={styles.sumValueRight}>{headerStars}</div>
                </div>
            </div>

            {/* DETAIL TABLE (viền đen + kẻ dọc rõ) */}
            <div style={styles.card}>
                <div style={styles.sectionTitle}>作業明細</div>

                {details.length === 0 ? (
                    <div style={styles.empty}>作業データなし</div>
                ) : (
                    <div style={styles.tableWrapBlack}>
                        <table style={styles.tableBlack}>
                            <thead>
                                <tr>
                                    <th style={{ ...styles.thBlack, width: 60, textAlign: "center" }}>No</th>
                                    <th style={{ ...styles.thBlack, width: 90, textAlign: "center" }}>開始</th>
                                    <th style={{ ...styles.thBlack, width: 90, textAlign: "center" }}>終了</th>
                                    <th style={{ ...styles.thBlack, width: 120, textAlign: "center" }}>区分</th>
                                    <th style={{ ...styles.thBlack, width: 220, textAlign: "center" }}>現場名</th>
                                    <th style={{ ...styles.thBlack, width: 100, textAlign: "center" }}>実働</th>
                                    <th style={{ ...styles.thBlack, width: 80, textAlign: "center" }}>★</th>
                                    <th style={{ ...styles.thBlack, width: 220, textAlign: "center" }}>メモ</th>
                                </tr>
                            </thead>

                            <tbody>
                                {details.map((r, i) => (
                                    <tr key={`${r.idx}-${i}`} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{i + 1}</td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{r.start_hm ?? ""}</td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{r.end_hm ?? ""}</td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{r.work_type ?? ""}</td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{r.site_name ?? ""}</td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>
                                            {minutesToHHMM(r.work_minutes)}
                                        </td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>
                                            {Math.floor(Math.max(0, Number(r.work_minutes ?? 0)) / 15)}
                                        </td>
                                        <td style={{ ...styles.tdBlack, textAlign: "center" }}>{r.note ?? ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{ marginTop: 14 }}>
                    <Link href={backHref} style={styles.link}>
                        ← 日別一覧へ戻る
                    </Link>
                </div>
            </div>
        </main>
    );
}

/* =======================
   STYLES
======================= */
const styles: Record<string, React.CSSProperties> = {
    page: {
        padding: 18,
        fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        background: "#f3f6fb",
        minHeight: "100vh",
    maxWidth: 1200,
    margin: "0 auto",
        fontSize: 15, // ✅ +2 (từ ~13 lên 15)
    },

    /* top */
    topHeader: { //khung label tiêu đề
        border: "2px solid #111",
        borderRadius: 10,
        padding: 14,
        background: "#eaf3ff", // xanh nhạt nhưng rõ
        boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
    },
    topTitle: { //tiêu đề 日別詳細
        fontSize: 25,
        textAlign: "center",
        fontWeight: 900,
        color: "#111",
        letterSpacing: 0.5,
    },
    topMetaRow: { // サイクル
        display: "grid",
        textAlign: "center",
        gap: 12,
        alignItems: "baseline",
        justifyContent: "space-between",
        marginTop: 10,
        flexWrap: "wrap",
    },
    topMetaRow2: {
        display: "grid",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
        flexWrap: "wrap",
    },

    bigName: {
        fontSize: 22, // ✅ tên người +4 (lớn rõ)
        fontWeight: 900,
        color: "#df1515",
    },
    bigCycle: {
        fontSize: 14, // ✅ chu kỳ lớn
        fontWeight: 900,
        placeItems: "center", // ✅ center cả dọc + ngang
        color: "#111",
        padding: "4px 10px",
        background: "#d7ebff",
        border: "2px solid #111",
        borderRadius: 999,
    },
    dateLine: { //サイクル
        fontSize: 18, 
        fontWeight: 900,
        color: "#111",
    },
    backBtn: {
        textDecoration: "none",
        fontWeight: 900,
        color: "#111",
        background: "#ffd27a", // tương phản mạnh
        border: "2px solid #111",
        padding: "8px 12px",
        borderRadius: 10,
        whiteSpace: "nowrap",
    },

    /* summary */
    summaryGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 10,
        marginTop: 12,
    },
    sumBox: { //label tổng hợp
        border: "2px solid #111",
        textAlign: "left",
        borderRadius: 20,
        padding: 10,
        background: "#fff0f0",
    },
    sumBoxStrong: { //label giờ làm việc
        textAlign: "left",
        border: "2px solid #111",
        borderRadius: 20,
        padding: 10,
        background: "#fff0f0", // đỏ nhạt để nổi "実働"
    },
    sumLabel: { fontSize: 14, fontWeight: 900, color: "#111" },
    sumLabelStrong: { fontSize: 14, fontWeight: 900, color: "#111" },
    sumValueCenter: { fontSize: 18, fontWeight: 900, textAlign: "center", marginTop: 6 },
    sumValueRight: { fontSize: 18, fontWeight: 900, textAlign: "center", marginTop: 6 },
    sumValueRightStrong: { fontSize: 18, fontWeight: 900, textAlign: "center", marginTop: 6 },

    /* card */
    card: {
        marginTop: 12,
        background: "#fff",
        border: "2px solid #111",
        borderRadius: 10,
        padding: 14,
    },
    sectionTitle: { fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 10 },

    empty: {
        padding: 12,
        border: "2px dashed #111",
        borderRadius: 10,
        background: "#fafafa",
        fontWeight: 800,
        color: "#111",
    },

    /* table: black grid */
    tableWrapBlack: {
        border: "2px solid #111",
        borderRadius: 8,
        overflow: "hidden",
    },
    tableBlack: {
        width: "100%",
        borderCollapse: "collapse",
        tableLayout: "fixed",
        fontSize: 18,
    },
    thBlack: {
        background: "#cfe8ff", // giống Excel header xanh
        borderRight: "2px solid #111",
        borderBottom: "2px solid #111",
        padding: "10px 10px",
        textAlign: "center",
        fontWeight: 900,
        color: "#111",
    },
    tdBlack: {
        borderRight: "2px solid #111",
        borderBottom: "1px solid #111",
        padding: "9px 10px",
        color: "#111",
        verticalAlign: "top",
    },
    trEven: { background: "#ffffff" },
    trOdd: { background: "#f8fbff" },

    /* misc */
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
