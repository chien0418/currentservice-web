import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  ymd: string;
  genba_stars: number;
  seizo_stars: number;
  total_stars: number;
};

export default async function WorkerDayPage(props: {
  params: Promise<{ site: string; reporter: string }>;
}) {
  const { site, reporter } = await props.params;

  const site_name = decodeURIComponent(site);
  const reporter_name = decodeURIComponent(reporter);

  // all-time day detail (đã group theo ymd trong view)
  const { data, error } = await supabase
    .from("v_genba_site_worker_day_detail")
    .select("ymd, genba_stars, seizo_stars, total_stars")
    .eq("site_name", site_name)
    .eq("reporter_name", reporter_name)
    .order("ymd", { ascending: true });

  if (error) return <pre>{JSON.stringify(error, null, 2)}</pre>;

  const rows = (data ?? []) as Row[];

  const sumG = rows.reduce((a, r) => a + Number(r.genba_stars ?? 0), 0);
  const sumS = rows.reduce((a, r) => a + Number(r.seizo_stars ?? 0), 0);
  const sumAll = rows.reduce((a, r) => a + Number(r.total_stars ?? 0), 0);

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>作業者詳細（日別）</div>
        <div style={styles.subTitle}>
          現場名：{site_name}　／　作業者：{reporter_name}
        </div>

        <div style={styles.headerBtns}>
          <Link href={`/genba/${encodeURIComponent(site_name)}`} style={styles.btnGhost}>
            現場へ戻る
          </Link>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>日別一覧</div>

        <div style={styles.table}>
          <div style={{ ...styles.row, ...styles.rowHead }}>
            <div style={{ ...styles.cell, width: 110 }}>年</div>
            <div style={{ ...styles.cell, width: 120 }}>月/日</div>
            <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>現場★数</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>製造★数</div>
            <div style={{ ...styles.cell, width: 160, borderRight: "none" }}>総合★数</div>
          </div>

          {rows.map((r, i) => {
            const [yy, mm, dd] = String(r.ymd ?? "").split("-");
            const md = mm && dd ? `${mm}/${dd}` : r.ymd;
            return (
              <div
                key={r.ymd}
                style={{
                  ...styles.row,
                  background: i % 2 === 0 ? "#fff" : "#fbfdff",
                  borderBottom: "1px solid #111",
                }}
              >
                <div style={{ ...styles.cell, width: 110 }}>{yy ?? ""}</div>
                <div style={{ ...styles.cell, width: 120 }}>{md}</div>
                <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>{r.genba_stars ?? 0}</div>
                <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>{r.seizo_stars ?? 0}</div>
                <div style={{ ...styles.cell, width: 160, borderRight: "none", fontWeight: 900 }}>
                  {r.total_stars ?? 0}
                </div>
              </div>
            );
          })}

          <div style={{ ...styles.row, background: "#f0f0f0", borderTop: "2px solid #111" }}>
            <div style={{ ...styles.cell, width: 110, fontWeight: 900 }}>総合</div>
            <div style={{ ...styles.cell, width: 120 }} />
            <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>{sumG}</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>{sumS}</div>
            <div style={{ ...styles.cell, width: 160, borderRight: "none", fontWeight: 900 }}>{sumAll}</div>
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
  header: { border: "2px solid #111", borderRadius: 14, padding: 14, background: "#fff" },
  title: { fontSize: 30, fontWeight: 900, textAlign: "center" },
  subTitle: { marginTop: 8, fontWeight: 900, textAlign: "center", opacity: 0.85 },
  headerBtns: { marginTop: 12, display: "flex", justifyContent: "center" },
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
  card: { marginTop: 12, background: "#fff", border: "2px solid #111", borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 18, fontWeight: 900, marginBottom: 10 },

  table: { border: "2px solid #111", borderRadius: 10, overflow: "hidden" },
  row: { display: "flex", alignItems: "stretch" },
  rowHead: { background: "#cfe8ff", borderBottom: "2px solid #111", fontWeight: 900 },
  cell: {
    padding: "10px 10px",
    borderRight: "2px solid #111",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    fontWeight: 800,
  },
  colGenba: { background: "#e8f3ff" },
  colSeizo: { background: "#fff2cc" },
};
