"use client";

import { useRouter } from "next/navigation";
import { EmailSignIn } from "@/components/EmailSignIn";

export function SaveWithEmail() {
  const router = useRouter();
  return <EmailSignIn next="/save/finish" submitLabel="Email me a sign-in code" onSignedIn={() => router.replace("/save/finish")} />;
}
