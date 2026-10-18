import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server.ts";

// Sends a signed-in person to their wedding, or to setup if they don't have one yet.
export default async function HomeRedirect() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/sign-in");
  const { data } = await supabase
    .from("members")
    .select("wedding_id, role, accepted_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("accepted_at", { ascending: false })
    .limit(1);
  if (data?.[0]) redirect(`/w/${data[0].wedding_id}`);
  redirect("/");
}
