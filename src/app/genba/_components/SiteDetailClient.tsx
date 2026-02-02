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

        {/* ✅ NEW: Pipe-style progress (現場 / 製造) */}
        <div style={styles.pipeCard}>
          <div style={styles.pipeTitle}>進捗（予定＝100%）</div>
          {PipeProgress({ label: "現場", planStars: planG, actualStars: nowG })}
          {PipeProgress({ label: "製造", planStars: planS, actualStars: nowS })}

          <div style={styles.pipeHint}>
            ※ 緑：計画内 / 黄：残り / 赤：超過
          </div>
        </div>
      </div>

      {/* workers (click whole row) */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>作業者</div>

        <div style={styles.table}>
          <div style={{ ...styles.row, background: "#cfe8ff", borderBottom: "2px solid #111", fontWeight: 900 }}>
            <div style={{ ...styles.cell, width: 260 }}>作業者</div>
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
                <div style={{ ...styles.cell, width: 260, fontWeight: 900 }}>{w.reporter_name}</div>
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

function PipeProgress(props: {
  label: string;
  planStars: number;
  actualStars: number;
}) {
  const P = Math.max(0, Number(props.planStars ?? 0));
  const A = Math.max(0, Number(props.actualStars ?? 0));

  const within = P > 0 ? Math.min(A, P) : 0;
  const remain = P > 0 ? Math.max(P - A, 0) : 0;
  const over = P > 0 ? Math.max(A - P, 0) : A; // if no plan, all counted as over

  const pct = P > 0 ? (A / P) * 100 : (A > 0 ? 999 : 0);
  const pctLabel = P > 0 ? `${Math.round(pct)}%` : "―";

  const wGreen = P > 0 ? (within / P) * 100 : 0;
  const wYellow = P > 0 ? (remain / P) * 100 : 100;
  const valveOpen = over > 0;

  // 超過表示：100%を超えた分を「追加の100%バー」で可視化（最大200%まで表示）
  const overPctRaw = P > 0 ? (over / P) * 100 : (over > 0 ? 100 : 0);
  const overPctCapped = Math.min(100, Math.max(0, overPctRaw));
  const totalPctRaw = P > 0 ? (A / P) * 100 : (A > 0 ? 999 : 0);
  const totalPctCapped = Math.min(200, Math.max(0, totalPctRaw));
  const showOverCapBadge = totalPctRaw > 200;

  return (
    <div style={styles.pipeRow}>
      <div style={styles.pipeLeft}>
        <div style={styles.pipeLabelRow}>
          <div style={styles.pipeLabel}>{props.label}</div>
          <div style={styles.pipeMeta}>
            実績 {A}★ / 予定 {P}★
          </div>
          <div style={styles.pipePct}>{pctLabel}</div>
        </div>

        <div style={styles.pipeTrackWrap}>
          <div style={styles.pipeTrack}>
            {/* green (within plan) */}
            <div style={{ ...styles.pipeGreen, width: `${Math.min(100, Math.max(0, wGreen))}%` }} />
            {/* yellow (remaining) */}
            <div style={{ ...styles.pipeYellow, width: `${Math.min(100, Math.max(0, wYellow))}%` }} />
          </div>

          {/* valve at 100% */}
          <div style={styles.valveWrap} title={valveOpen ? "超過：バルブ開" : "バルブ閉"}>
            <div style={styles.valveBody}>
              <div
                style={{
                  ...styles.valveHandle,
                  transform: valveOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </div>
          </div>
        </div>

        {/* overflow (100%超えを「追加バー」で表現：最大200%まで) */}
        {over > 0 ? (
          <div style={styles.overflowBox}>
            <div style={styles.overBarHeader}>
              <div style={styles.overBarTitle}>
                超過 {showOverCapBadge ? `(表示は200%まで)` : ``}
              </div>
              <div style={styles.overBarMeta}>
                +{over}★ (+{Math.round(overPctRaw)}%)
              </div>
            </div>

            <div style={styles.overTrackWrap}>
              <div style={styles.overTrack}>
                {/* 100%〜200% のうち、超過分だけ赤で「塗る」 */}
                <div style={{ ...styles.pipeRed, width: `${overPctCapped}%` }} />
              </div>

              {/* total percent (cap 200) */}
              <div style={styles.overTotal}>
                合計 {Math.round(totalPctCapped)}%
                {showOverCapBadge ? <span style={styles.overCapBadge}>200%+</span> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
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

  /* =======================
     Pipe progress UI
  ======================= */
  pipeCard: {
    marginTop: 14,
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
    background: "#ffffff",
  },
  pipeTitle: { fontSize: 18, fontWeight: 900, textAlign: "center" },
  pipeHint: { marginTop: 10, fontSize: 12, fontWeight: 900, opacity: 0.75, textAlign: "center" },
  pipeRow: { marginTop: 12 },
  pipeLeft: { width: "100%" },
  pipeLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  pipeLabel: {
    fontWeight: 900,
    fontSize: 16,
    border: "2px solid #111",
    borderRadius: 999,
    padding: "4px 10px",
    background: "#f6d7c8",
  },
  pipeMeta: { fontWeight: 900, opacity: 0.8 },
  pipePct: {
    fontWeight: 900,
    fontSize: 16,
    border: "2px solid #111",
    borderRadius: 999,
    padding: "4px 10px",
    background: "#eaf3ff",
  },

  pipeTrackWrap: { position: "relative", marginTop: 10, paddingRight: 48 },
  pipeTrack: {
    height: 32,
    borderRadius: 999,
    border: "2px solid #111",
    overflow: "hidden",
    display: "flex",
    background: "#fff",
  },
  pipeGreen: { height: "100%", background: "#9ff0b3" },
  pipeYellow: { height: "100%", background: "#ffe59a" },

  valveWrap: {
    position: "absolute",
    right: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  valveBody: {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "2px solid #111",
    background: "#f0f0f0",
    position: "relative",
  },
  valveHandle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 22,
    height: 6,
    transformOrigin: "center",
    borderRadius: 999,
    background: "#111",
    transform: "translate(-50%, -50%)",
  },

  overflowBox: {
    marginTop: 10,
    padding: 10,
    border: "2px dashed #b11",
    borderRadius: 12,
    background: "#fff7f7",
  },
  overBarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 8,
  },
  overBarTitle: { fontWeight: 900 },
  overBarMeta: { fontWeight: 900, color: "#b11" },

  overTrackWrap: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 },
  overTrack: {
    flex: 1,
    height: 16,
    borderRadius: 999,
    overflow: "hidden",
    border: "2px solid #111",
    background: "#fff",
    display: "flex",
  },
  pipeRed: { height: "100%", background: "#ff6b6b" },

  overTotal: { fontWeight: 900, whiteSpace: "nowrap" },
  overCapBadge: {
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    border: "2px solid #111",
    background: "#ff6b6b",
    fontWeight: 900,
  },
  // NOTE: ムダ金表示は削除（要望により超過バーのみ）

  table: { border: "2px solid #111", borderRadius: 10, overflow: "hidden" },
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

  colGenba: { background: "#e8f3ff" },
  colSeizo: { background: "#fff2cc" },
};
