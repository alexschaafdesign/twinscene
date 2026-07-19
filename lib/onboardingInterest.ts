// Interest signal for onboarding roles that don't have a real feature behind
// them yet (photographer, venue owner/employee — see migration 0029). Not a
// claim or a profile, just "notify me when this ships."

import { sql } from "./db.ts";

export type OnboardingInterestRole = "photographer" | "venue";

export const ONBOARDING_INTEREST_ROLES: OnboardingInterestRole[] = ["photographer", "venue"];

export function isOnboardingInterestRole(value: unknown): value is OnboardingInterestRole {
  return typeof value === "string" && (ONBOARDING_INTEREST_ROLES as string[]).includes(value);
}

// Idempotent — revisiting onboarding and clicking "notify me" again is a
// no-op, not a duplicate row.
export async function recordOnboardingInterest(userId: number, role: OnboardingInterestRole): Promise<void> {
  await sql`
    insert into onboarding_interest (user_id, role)
    values (${userId}, ${role})
    on conflict (user_id, role) do nothing
  `;
}
