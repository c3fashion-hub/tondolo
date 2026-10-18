// Deletes the files of documents that were deleted (on their own, or with their wedding). The
// database queues each file's path; storage files can't be removed from SQL. Run hourly by pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: queued, error } = await db.from("document_deletions").select("file_path").order("queued_at").limit(500);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!queued?.length) return json({ ok: true, deleted: 0 });
  const paths = queued.map((q) => q.file_path);
  const { error: rmError } = await db.storage.from("documents").remove(paths);
  if (rmError) return json({ ok: false, error: rmError.message }, 500);
  // remove() succeeds for files already gone, so the queue empties either way.
  const { error: delError } = await db.from("document_deletions").delete().in("file_path", paths);
  if (delError) return json({ ok: false, error: delError.message }, 500);
  return json({ ok: true, deleted: paths.length });
});
