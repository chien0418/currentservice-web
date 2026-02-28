import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  const form = await req.formData();
  const employee_code = String(form.get("employee_code") ?? "").trim();
  const cycle_start = String(form.get("cycle_start") ?? "").trim();
  const cycle_end = String(form.get("cycle_end") ?? "").trim();
  const cycle_ym = String(form.get("cycle_ym") ?? "").trim();

  if (!employee_code || !cycle_start || !cycle_end) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  // App logic: unlock = status -> draft
  const { error } = await supabase
    .from("cycle_submissions")
    .delete()
    .eq("employee_code", employee_code)
    .eq("cycle_start", cycle_start)
    .eq("cycle_end", cycle_end);

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  const back = cycle_ym ? `/submit-grid?cycle_ym=${encodeURIComponent(cycle_ym)}` : "/submit-grid";
  return NextResponse.redirect(new URL(back, req.url), { status: 303 });
}
