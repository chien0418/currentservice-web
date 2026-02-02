import { supabase } from "@/lib/supabaseClient";
import SiteDetailClient, { Master, WorkerRow } from "@/app/genba/_components/SiteDetailClient";

type BaseRow = {
  reporter_name: string;
  genba_stars: number;
  seizo_stars: number;
};

export default async function SitePage(props: { params: Promise<{ site: string }> }) {
  const { site } = await props.params;
  const site_name = decodeURIComponent(site);

  // master
  const { data: m1, error: e1 } = await supabase
    .from("site_master")
    .select(
      "site_name, case_name, address, project_no, start_date, end_date, plan_genba_stars, plan_seizo_stars"
    )
    .eq("site_name", site_name)
    .maybeSingle();

  if (e1) return <pre>{JSON.stringify(e1, null, 2)}</pre>;
  const master = (m1 ?? null) as Master | null;

  // all-time rows for this site (đã chia genba/seizo theo work_type rule)
  const { data: base, error: e2 } = await supabase
    .from("v_genba_work_base")
    .select("reporter_name, genba_stars, seizo_stars")
    .eq("site_name", site_name);

  if (e2) return <pre>{JSON.stringify(e2, null, 2)}</pre>;
  const rows = (base ?? []) as BaseRow[];

  // aggregate workers
  const map = new Map<string, WorkerRow>();
  let nowG = 0;
  let nowS = 0;

  for (const r of rows) {
    const name = r.reporter_name;
    if (!map.has(name)) map.set(name, { reporter_name: name, genba: 0, seizo: 0, total: 0 });
    const w = map.get(name)!;
    const g = Number(r.genba_stars ?? 0);
    const s = Number(r.seizo_stars ?? 0);
    w.genba += g;
    w.seizo += s;
    w.total += g + s;
    nowG += g;
    nowS += s;
  }

  const workers = Array.from(map.values()).sort((a, b) =>
    a.reporter_name.localeCompare(b.reporter_name, "ja")
  );

  return (
    <SiteDetailClient
      site_name={site_name}
      master={master}
      now_genba={nowG}
      now_seizo={nowS}
      workers={workers}
      backHref="/genba"
    />
  );
}
