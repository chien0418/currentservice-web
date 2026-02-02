"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ExportExcelMenu from "@/app/_components/ExportExcelMenu";

export type GenbaSiteRow = {
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
};

export default function GenbaListClient(props: {
  rows: GenbaSiteRow[];
  backHref?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return props.rows;
    return props.rows.filter((r) => (r.site_name ?? "").toLowerCase().includes(s));
  }, [q, props.rows]);

  // totals (for filtered list)
  const totals = useMemo(() => {
    const sum = (k: keyof GenbaSiteRow) => filtered.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      planG: sum("plan_genba_stars"),
      planS: sum("plan_seizo_stars"),
      planAll: sum("plan_total_stars"),
      nowG: sum("current_genba_stars"),
      nowS: sum("current_seizo_stars"),
      nowAll: sum("current_total_stars"),
      remG: sum("remaining_genba_stars"),
      remS: sum("remaining_seizo_stars"),
      remAll: sum("remaining_total_stars"),
    };
  }, [filtered]);

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>現場管理（全期間・累計）</div>

        <div style={styles.topBar}>
          <div style={styles.searchWrap}>
            <div style={styles.searchLabel}>現場名検索</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="例：明治 / 神奈川 / 工場 など"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.btns}>
            <ExportExcelMenu compact />
            {props.backHref ? (
              <Link href={props.backHref} style={styles.btnGhost}>
                時間管理へ戻る
              </Link>
            ) : null}
            <Link href="/genba" style={styles.btnPrimary}>
              更新
            </Link>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>工事一覧（site_name で自動集計）</div>

        <div style={styles.table}>
          {/* header top */}
          <div style={{ ...styles.row, ...styles.rowHeadTop }}>
            <div style={{ ...styles.cell, width: 220 }}>現場名</div>
            <div style={{ ...styles.cellGroup, width: 450 }}>予定★数</div>
            <div style={{ ...styles.cellGroup, width: 450 }}>現在★数</div>
            <div style={{ ...styles.cellGroup, width: 450, borderRight: "none" }}>残り★数</div>
          </div>

          {/* header sub */}
          <div style={{ ...styles.row, ...styles.rowHeadSub }}>
            <div style={{ ...styles.cell, width: 220 }} />

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>現場★数</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>製造★数</div>
            <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>総合★数</div>

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>現場★数</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>製造★数</div>
            <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>総合★数</div>

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>現場★数</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>製造★数</div>
            <div style={{ ...styles.cell, width: 150, borderRight: "none", fontWeight: 900 }}>総合★数</div>
          </div>

          {/* rows */}
          {filtered.map((r, idx) => {
            const href = `/genba/${encodeURIComponent(r.site_name)}`;
            return (
              <Link
                key={r.site_name}
                href={href}
                style={{
                  ...styles.rowLink,
                  background: idx % 2 === 0 ? "#ffffff" : "#fbfdff",
                }}
              >
                <div style={{ ...styles.cell, width: 220, fontWeight: 900 }}>{r.site_name}</div>

                <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{r.plan_genba_stars}</div>
                <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{r.plan_seizo_stars}</div>
                <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>{r.plan_total_stars}</div>

                <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{r.current_genba_stars}</div>
                <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{r.current_seizo_stars}</div>
                <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>{r.current_total_stars}</div>

                <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{r.remaining_genba_stars}</div>
                <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{r.remaining_seizo_stars}</div>
                <div style={{ ...styles.cell, width: 150, borderRight: "none", fontWeight: 900 }}>{r.remaining_total_stars}</div>
              </Link>
            );
          })}

          {/* total (filtered) */}
          <div style={{ ...styles.row, background: "#f0f0f0", borderTop: "2px solid #111" }}>
            <div style={{ ...styles.cell, width: 220, fontWeight: 900 }}>総合</div>

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{totals.planG}</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{totals.planS}</div>
            <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>{totals.planAll}</div>

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{totals.nowG}</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{totals.nowS}</div>
            <div style={{ ...styles.cell, width: 150, fontWeight: 900 }}>{totals.nowAll}</div>

            <div style={{ ...styles.cell, ...styles.colGenba, width: 150 }}>{totals.remG}</div>
            <div style={{ ...styles.cell, ...styles.colSeizo, width: 150 }}>{totals.remS}</div>
            <div style={{ ...styles.cell, width: 150, borderRight: "none", fontWeight: 900 }}>{totals.remAll}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.8, fontWeight: 800 }}>
          ※ 行全体クリックで詳細へ（どこを押してもOK）
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
    border: "2px solid #111",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
  },
  title: { fontSize: 30, fontWeight: 900, textAlign: "center" },

  topBar: {
    marginTop: 12,
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  searchWrap: { flex: 1, minWidth: 320 },
  searchLabel: { fontWeight: 900, marginBottom: 6 },
  searchInput: {
    width: "100%",
    border: "2px solid #111",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 900,
    outline: "none",
  },
  btns: { display: "flex", gap: 10, flexWrap: "wrap" },
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

  table: { border: "2px solid #111", borderRadius: 10, overflow: "hidden" },
  row: { display: "flex", alignItems: "stretch" },
  rowHeadTop: { background: "#f6d7c8", borderBottom: "2px solid #111", fontWeight: 900 },
  rowHeadSub: { background: "#cfe8ff", borderBottom: "2px solid #111", fontWeight: 900 },
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
  cellGroup: {
    padding: "10px 10px",
    borderRight: "2px solid #111",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    fontWeight: 900,
  },

  // yêu cầu: tô màu giống nhau cho 現場/製造
  colGenba: { background: "#e8f3ff" }, // xanh nhạt
  colSeizo: { background: "#fff2cc" }, // vàng nhạt
};
