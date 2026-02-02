"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  key: string;
  label: string;
  qs: Record<string, string>;
};

/**
 * Excel export menu.
 * - Shows only options that have enough parameters.
 * - Calls /api/export/excel?type=...&...
 */
export default function ExportExcelMenu(props: {
  reporter_name?: string;
  ymd?: string;
  cycle_ym?: string;
  site_name?: string;
  // UI
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const options = useMemo<Option[]>(() => {
    const o: Option[] = [];

    // ① 業務日報書（1日）
    if (props.reporter_name && props.ymd) {
      o.push({
        key: "daily_day",
        label: "① 業務日報書（1日）",
        qs: { type: "daily_day", reporter_name: props.reporter_name, ymd: props.ymd },
      });
    }

    // ①-月：業務日報書（1ヶ月） ※ each day = 1 sheet
    if (props.reporter_name && props.cycle_ym) {
      o.push({
        key: "daily_month",
        label: "①-月 業務日報書（1ヶ月）",
        qs: { type: "daily_month", reporter_name: props.reporter_name, cycle_ym: props.cycle_ym },
      });
    }

    // ② 勤務表 + 給与月（1人）
    if (props.reporter_name && props.cycle_ym) {
      o.push({
        key: "monthly_worker",
        label: "② 勤務表（1人）",
        qs: { type: "monthly_worker", reporter_name: props.reporter_name, cycle_ym: props.cycle_ym },
      });
    }

    // ③ 会社まとめ（給与月）
    if (props.cycle_ym) {
      o.push({
        key: "company_cycle",
        label: "③ 会社まとめ（給与月）",
        qs: { type: "company_cycle", cycle_ym: props.cycle_ym },
      });
    }

    // ④ 工事一覧（全期間・累計）
    o.push({
      key: "genba_all",
      label: "④ 工事一覧（全期間・累計）",
      qs: { type: "genba_all" },
    });

    // ⑤ 現場（1現場）
    if (props.site_name) {
      o.push({
        key: "genba_site",
        label: "⑤ 現場（1現場）",
        qs: { type: "genba_site", site_name: props.site_name },
      });
    }

    return o;
  }, [props.reporter_name, props.ymd, props.cycle_ym, props.site_name]);

  const download = async (qs: Record<string, string>) => {
    try {
      const usp = new URLSearchParams(qs);
      const res = await fetch(`/api/export/excel?${usp.toString()}`);
      if (!res.ok) {
        const t = await res.text();
        alert(`Export failed: ${t}`);
        return;
      }

      // Try to respect server filename (Content-Disposition)
      const cd = res.headers.get("content-disposition") ?? "";
      let filename = "";
      // filename*=UTF-8''...
      const mStar = cd.match(/filename\*=(?:UTF-8''|utf-8''|)([^;]+)/);
      if (mStar && mStar[1]) {
        filename = decodeURIComponent(mStar[1].trim().replace(/^\"|\"$/g, ""));
      } else {
        const m = cd.match(/filename=([^;]+)/);
        if (m && m[1]) filename = m[1].trim().replace(/^\"|\"$/g, "");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // If we set download attr, browser will not use server filename.
      // So set it only when we could parse a real name.
      if (filename) a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Export error: ${String(e?.message ?? e)}`);
    }
  };

  if (!options.length) return null;

  // Mount guard for portal
  useEffect(() => setMounted(true), []);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // if click on button -> ignore (button handler will toggle)
      if (btnRef.current && t && btnRef.current.contains(t)) return;
      // If click inside menu -> ignore (menu buttons handle close)
      if (t && t.closest?.("[data-excel-menu='1']")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Keep menu visible while scrolling/resizing
  useEffect(() => {
    if (!open) return;
    const on = () => updatePos();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Place menu under button, right-aligned to button
    const width = 280;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
    const top = r.bottom + 8;
    setPopPos({ top, left, width });
  };

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        onClick={() => {
          // Compute position before opening so it never gets clipped by overflow
          updatePos();
          setOpen((v) => !v);
        }}
        style={props.compact ? styles.btnCompact : styles.btn}
      >
        ⬇ Excel出力
      </button>

      {mounted && open && popPos
        ? createPortal(
            <div
              data-excel-menu="1"
              style={{
                ...styles.pop,
                position: "fixed",
                top: popPos.top,
                left: popPos.left,
                width: popPos.width,
              }}
            >
              {options.map((op) => (
                <button
                  key={op.key}
                  onClick={async () => {
                    setOpen(false);
                    await download(op.qs);
                  }}
                  style={styles.item}
                >
                  {op.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    fontWeight: 900,
    border: "2px solid #111",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#d7ebff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnCompact: {
    fontWeight: 900,
    border: "2px solid #111",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#d7ebff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  pop: {
    zIndex: 9999,
    minWidth: 260,
    background: "#fff",
    border: "2px solid #111",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
    overflow: "hidden",
  },
  item: {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    border: "none",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    borderBottom: "1px solid #111",
  },
};
