"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

type Props = {
  cycleYm: string; // YYYY-MM (給与月 = endmonth)
  years: number[]; // e.g. [2026, 2027, 2028]
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function CycleYmPicker({ cycleYm, years }: Props) {
  const router = useRouter();

  const { year, month } = useMemo(() => {
    const m = String(cycleYm ?? "").match(/^(\d{4})-(\d{2})$/);
    const y = m ? Number(m[1]) : years[0] ?? new Date().getFullYear();
    const mo = m ? Number(m[2]) : 1;
    return { year: y, month: mo };
  }, [cycleYm, years]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const go = (nextYear: number, nextMonth: number) => {
    const next = `${nextYear}-${pad2(nextMonth)}`;
    router.push(`/?cycle_ym=${encodeURIComponent(next)}`);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>給与サイクル選択</div>
      <div style={styles.row}>
        <label style={styles.label}>
          年
          <select
            style={styles.select}
            value={year}
            onChange={(e) => go(Number(e.target.value), month)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          月（給与月=endmonth）
          <select
            style={styles.select}
            value={month}
            onChange={(e) => go(year, Number(e.target.value))}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={styles.hint}>給与サイクル：前月21日 ～ 当月20日（表示は endmonth ベース）</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 10,
    border: "1px solid #d6deea",
    borderRadius: 12,
    background: "#ffffff",
    alignItems: "center",
  },
  title: {
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: "0.05em",
  },
  row: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
  },
  select: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #cfd7e3",
    fontSize: 14,
    fontWeight: 800,
    background: "#f8fbff",
    cursor: "pointer",
  },
  hint: {
    fontSize: 12,
    opacity: 0.7,
  },
};
