"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function readForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    fullName: String(formData.get("full_name") ?? "").trim(),
    next: String(formData.get("next") ?? "/premium"),
  };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password, next } = readForm(formData);

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  // redirect() throws internally, so it must be outside any try/catch.
  redirect(next);
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password, fullName, next } = readForm(formData);

  if (!fullName || !email || !password) {
    return { error: "Full name, email and password are required." };
  }
  if (fullName.length < 2) {
    return { error: "Please enter your full name." };
  }
  if (fullName.length > 80) {
    return { error: "That name is too long (80 characters max)." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Lands in auth.users.raw_user_meta_data, which the handle_new_user
      // trigger copies into profiles.full_name.
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // When "Confirm email" is ON in Supabase, signUp returns a user but no
  // session — they have to click the link in the email first.
  if (data.user && !data.session) {
    return {
      message: `Check ${email} for a confirmation link, then sign in.`,
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
