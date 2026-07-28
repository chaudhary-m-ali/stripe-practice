"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const EMPTY: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;

  // useActionState wires a Server Action to a form and gives back its
  // returned state plus a pending flag — no useEffect, no fetch.
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <div>
      <div className="mb-6 inline-flex rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              mode === value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {value === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        {mode === "signup" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Full name</span>
            <input
              name="full_name"
              type="text"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Ada Lovelace"
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            placeholder="At least 6 characters"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending
            ? "Working…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>

        {state.error ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {state.error}
          </p>
        ) : null}

        {state.message ? (
          <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
