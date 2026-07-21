"use client";

import { useState } from "react";
import LoginForm from "@/components/LoginForm";
import PasswordAuthForm from "@/components/PasswordAuthForm";

/** The /login sign-in surface: a segmented toggle between the two auth methods,
 * both of which end in the same session. "Password" is email + password
 * (PasswordAuthForm) and is the default; "Email link" is the original
 * passwordless magic link (LoginForm), one tab click away for anyone who
 * prefers it. */
export default function AuthPanel({ next, isDev = false }: { next?: string; isDev?: boolean }) {
  const [method, setMethod] = useState<"link" | "password">("password");

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="flex rounded-md border border-[#E8E0D0]/20 p-1 text-sm"
      >
        {(
          [
            ["link", "Email link"],
            ["password", "Password"],
          ] as const
        ).map(([value, label]) => {
          const active = method === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMethod(value)}
              className={`flex-1 rounded px-3 py-1.5 transition ${
                active
                  ? "bg-[#E8E0D0]/15 text-[#E8E0D0]"
                  : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {method === "link" ? (
        <LoginForm next={next} isDev={isDev} autoFocus={false} />
      ) : (
        <PasswordAuthForm next={next} />
      )}
    </div>
  );
}
