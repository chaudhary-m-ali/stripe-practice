import { redirect } from "next/navigation";
import { SetupCheck } from "@/app/components/setup-check";
import { Shell } from "@/app/components/shell";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only allow relative paths — an open redirect is a real vulnerability.
  const target = next?.startsWith("/") ? next : "/premium";

  const user = await getCurrentUser();
  if (user) redirect(target);

  return (
    <Shell
      title="Sign in"
      subtitle="Supabase Auth handles the account. Stripe only ever sees a customer id."
    >
      <SetupCheck />
      <LoginForm next={target} />
    </Shell>
  );
}
