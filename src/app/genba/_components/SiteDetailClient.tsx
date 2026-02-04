"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ExportExcelMenu from "@/app/_components/ExportExcelMenu";

export type Master = {
  site_name: string;
  case_name: string | null;
  address: string | null;
  project_no: string | null;
  start_date: string | null;
  end_date: string | null;
  plan_genba_stars: number | null;
  plan_seizo_stars: number | null;
};

export type WorkerRow = {
  reporter_name: string;
  genba: number;
  seizo: number;
  total: number;
};

export default function SiteDetailClient(props: {
  site_name: string;
  master: Master | null;
  now_genba: number;
  now_seizo: number;
  workers: WorkerRow[];
  backHref: string; // về /genba
}) {
  const [m, setM] = useState<Master>(() => {
    return (
      props.master ?? {
        site_name: props.site_name,
        case_name: "",
        address: "",
        project_no: "",
        start_date: "",
        end_date: "",
        plan_genba_stars: 0,
        plan_seizo_stars: 0,
      }
    );
  });

  const planG = Number(m.plan_genba_stars ?? 0);
  const planS = Number(m.plan_seizo_stars ?? 0);
  const planAll = planG + planS;

  const nowG = props.now_genba;
  const nowS = props.now_seizo;
  const nowAll = nowG + nowS;

  const remG = planG - nowG;
  const remS = planS - nowS;
  const remAll = planAll - nowAll;

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function saveMaster() {
    setSaving(true);
    setMsg("");
    const payload = {
      site_name: props.site_name,
      case_name: m.case_name ?? "",
      address: m.address ?? "",
      project_no: m.project_no ?? "",
      start_date: m.start_date || null,
      end_date: m.end_date || null,
      plan_genba_stars: Number(m.plan_genba_stars ?? 0),
      plan_seizo_stars: Number(m.plan_seizo_stars ?? 0),
    };

    const { error } = await supabase.from("site_master").upsert(payload, { onConflict: "site_name" });
    if (error) setMsg(`保存失敗: ${error.message}`);
    else setMsg("保存しました");
    setSaving(false);
  }

  const workerTotal = useMemo(() => {
    const g = props.workers.reduce((a, w) => a + w.genba, 0);
    const s = props.workers.reduce((a, w) => a + w.seizo, 0);
    return { g, s, all: g + s };
  }, [props.workers]);

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>現場管理（詳細）</div>
        <div style={styles.headerBtns}>
          <ExportExcelMenu site_name={props.site_name} compact />
          <Link href={props.backHref} style={styles.btnGhost}>
            一覧へ戻る
          </Link>
        </div>
      </div>

      {/* master + input */}
      <div style={styles.card}>
        <div style={{ fontSize: 22, fontWeight: 900, textAlign: "center" }}>現場名：{props.site_name}</div>

        <div style={styles.masterGrid}>
          {field("件名", "case_name")}
          {field("所在地", "address")}
          {field("工番", "project_no")}
          {dateField("開始日付", "start_date")}
          {dateField("終了日付", "end_date")}
        </div>

        <div style={styles.planRow}>
          <div style={styles.planBox}>
            <div style={styles.planLabel}>予定（現場★）</div>
            <input
              value={String(m.plan_genba_stars ?? 0)}
              onChange={(e) => setM({ ...m, plan_genba_stars: Number(e.target.value || 0) })}
              style={styles.input}
              inputMode="numeric"
            />
          </div>
          <div style={styles.planBox}>
            <div style={styles.planLabel}>予定（製造★）</div>
            <input
              value={String(m.plan_seizo_stars ?? 0)}
              onChange={(e) => setM({ ...m, plan_seizo_stars: Number(e.target.value || 0) })}
              style={styles.input}
              inputMode="numeric"
            />
          </div>
          <div style={styles.planBox}>
            <div style={styles.planLabel}>予定（総合★）</div>
            <div style={styles.planValue}>{planAll}</div>
          </div>
        </div>

        <div style={styles.saveRow}>
          <button onClick={saveMaster} disabled={saving} style={styles.btnPrimary}>
            {saving ? "保存中..." : "保存"}
          </button>
          {msg ? <div style={{ fontWeight: 900 }}>{msg}</div> : null}
        </div>

        {/* bảng đúng ảnh: 3 cột 予定/現在/残り ; 3 dòng 現場/製造/総合★数 */}
        <div style={{ marginTop: 14, border: "2px solid #111", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ ...styles.row, background: "#f6d7c8", borderBottom: "2px solid #111" }}>
            <div style={{ ...styles.cell, width: 200 }} />
            <div style={{ ...styles.cell, width: 200 }}>予定★数</div>
            <div style={{ ...styles.cell, width: 200 }}>現在★数</div>
            <div style={{ ...styles.cell, width: 200, borderRight: "none" }}>残り★数</div>
          </div>

          {[
            { name: "現場", p: planG, n: nowG, r: remG, tone: styles.colGenba },
            { name: "製造", p: planS, n: nowS, r: remS, tone: styles.colSeizo },
            { name: "総合★数", p: planAll, n: nowAll, r: remAll, bold: true, tone: {} },
          ].map((x) => (
            <div key={x.name} style={{ ...styles.row, borderBottom: "1px solid #111" }}>
              <div style={{ ...styles.cell, width: 200, fontWeight: 900, ...(x.tone as any) }}>{x.name}</div>
              <div style={{ ...styles.cell, width: 200, fontWeight: x.bold ? 900 : 800 }}>{x.p}</div>
              <div style={{ ...styles.cell, width: 200, fontWeight: x.bold ? 900 : 800 }}>{x.n}</div>
              <div style={{ ...styles.cell, width: 200, borderRight: "none", fontWeight: x.bold ? 900 : 800 }}>
                {x.r}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* workers (click whole row) */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>作業者</div>

        <div style={styles.tableScroll} className="scroll-x">
            <div style={styles.table}>
          <div style={{ ...styles.row, background: "#cfe8ff", borderBottom: "2px solid #111", fontWeight: 900 }}>
            <div style={{ ...styles.cell, ...styles.stickyColHeader, width: 260 }}>作業者</div>
            <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>現場★数</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>製造★数</div>
            <div style={{ ...styles.cell, width: 160, borderRight: "none" }}>総合★数</div>
          </div>

          {props.workers.map((w, i) => {
            const href = `/genba/${encodeURIComponent(props.site_name)}/${encodeURIComponent(w.reporter_name)}`;
            return (
              <Link
                key={w.reporter_name}
                href={href}
                style={{
                  ...styles.rowLink,
                  background: i % 2 === 0 ? "#fff" : "#fbfdff",
                }}
              >
                <div style={{ ...styles.cell, ...styles.stickyCol, width: 260, fontWeight: 900 }}>{w.reporter_name}</div>
                <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>{w.genba}</div>
                <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>{w.seizo}</div>
                <div style={{ ...styles.cell, width: 160, borderRight: "none", fontWeight: 900 }}>{w.total}</div>
              </Link>
            );
          })}

          <div style={{ ...styles.row, background: "#f0f0f0", borderTop: "2px solid #111" }}>
            <div style={{ ...styles.cell, width: 260, fontWeight: 900 }}>総合</div>
            <div style={{ ...styles.cell, ...styles.colGenba, width: 160 }}>{workerTotal.g}</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 160 }}>{workerTotal.s}</div>
            <div style={{ ...styles.cell, width: 160, borderRight: "none", fontWeight: 900 }}>{workerTotal.all}</div>
          </div>
        </div>
            </div>

        <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800 }}>
          ※ 行全体クリックで日別へ
        </div>
      </div>
    </main>
  );

  function field(label: string, key: keyof Master) {
    return (
      <div style={styles.masterRow}>
        <div style={styles.masterLabel}>{label}：</div>
        <input
          value={String(m[key] ?? "")}
          onChange={(e) => setM({ ...m, [key]: e.target.value } as Master)}
          style={styles.input}
        />
      </div>
    );
  }

  function dateField(label: string, key: keyof Master) {
    return (
      <div style={styles.masterRow}>
        <div style={styles.masterLabel}>{label}：</div>
        <input
          type="date"
          value={String(m[key] ?? "")}
          onChange={(e) => setM({ ...m, [key]: e.target.value } as Master)}
          style={styles.input}
        />
      </div>
    );
  }
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
  header: { border: "2px solid #111", borderRadius: 14, padding: 14, background: "#fff" },
  title: { fontSize: 30, fontWeight: 900, textAlign: "center" },
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
  btnPrimary: {
    fontWeight: 900,
    color: "#111",
    background: "#36c6d3",
    border: "2px solid #111",
    padding: "10px 14px",
    borderRadius: 12,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },

  card: { marginTop: 12, background: "#fff", border: "2px solid #111", borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 18, fontWeight: 900, marginBottom: 10 },

  masterGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    maxWidth: 820,
    marginLeft: "auto",
    marginRight: "auto",
  },
  masterRow: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" },
  masterLabel: { fontWeight: 900 },
  input: {
    width: "100%",
    border: "2px solid #111",
    borderRadius: 12,
    padding: "8px 10px",
    fontWeight: 900,
    outline: "none",
    textAlign: "center",
  },

  planRow: { marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
  planBox: { border: "2px solid #111", borderRadius: 12, padding: 10, background: "#fffdf7" },
  planLabel: { fontSize: 12, fontWeight: 900, opacity: 0.8, textAlign: "center" },
  planValue: { marginTop: 6, fontSize: 18, fontWeight: 900, textAlign: "center" },

  saveRow: { marginTop: 10, display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" },

  table: { border: "2px solid #111", borderRadius: 10, overflow: "hidden" },
  tableScroll: { marginTop: 10, borderRadius: 10, maxWidth: "100%", overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" },
  stickyColHeader: { position: "sticky", left: 0, zIndex: 3, background: "#fff", boxShadow: "2px 0 0 rgba(0,0,0,.08)" },
  stickyCol: { position: "sticky", left: 0, zIndex: 2, background: "#fff", boxShadow: "2px 0 0 rgba(0,0,0,.06)" },
  row: { display: "flex", alignItems: "stretch" },
  rowLink: {
    display: "flex",
    alignItems: "stretch",
    textDecoration: "none",
    color: "#111",
    borderBottom: "1px solid #111",
    cursor: "pointer",
  },
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

  colGenba: { background: "linear-gradient(90deg,#dbeafe 0%,#bfdbfe 50%,#dbeafe 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 0 rgba(0,0,0,.08)" },
  colSeizo: { background: "linear-gradient(90deg,#fef3c7 0%,#fde68a 50%,#fef3c7 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 0 rgba(0,0,0,.08)" },
};
