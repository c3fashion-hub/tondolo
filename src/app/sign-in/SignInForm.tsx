"use client";

import { useRouter } from "next/navigation";
import { EmailSignIn } from "@/components/EmailSignIn";

export function SignInForm() {
  const router = useRouter();
  return <EmailSignIn next="/home" submitLabel="Email me a sign-in code" onSignedIn={() => { router.replace("/home"); router.refresh(); }} />;
}
