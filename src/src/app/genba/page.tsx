import { supabase } from "@/lib/supabaseClient";
import GenbaListClient, { GenbaSiteRow } from "@/app/genba/_components/GenbaListClient";

type Row = GenbaSiteRow & {
  case_name: string | null;
  address: string | null;
  project_no: string | null;
  start_date: string | null;
  end_date: string | null;
};

export default async function GenbaPage(props: {
  searchParams?: Promise<{ cycle_ym?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const cycle_ym = sp.cycle_ym ?? "";

  // 全期間（累計）: Supabase view đã tổng hợp all-time (không lọc ymd)
  const { data, error } = await supabase
    .from("v_genba_site_summary_with_master")
    .select(
      "site_name, plan_genba_stars, plan_seizo_stars, plan_total_stars, current_genba_stars, current_seizo_stars, current_total_stars, remaining_genba_stars, remaining_seizo_stars, remaining_total_stars, case_name, address, project_no, start_date, end_date"
    )
    .order("site_name", { ascending: true });

  if (error) return <pre>{JSON.stringify(error, null, 2)}</pre>;

  const rows = (data ?? []) as Row[];

  // quay lại màn 1: nếu có cycle_ym thì giữ, không có thì về /
  const backHref = cycle_ym ? `/?cycle_ym=${encodeURIComponent(cycle_ym)}` : "/";

  return <GenbaListClient rows={rows} backHref={backHref} />;
}
