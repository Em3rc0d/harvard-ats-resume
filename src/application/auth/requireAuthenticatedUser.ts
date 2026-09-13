import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../infrastructure/supabase/server";

export type AuthenticatedUser = Readonly<{
  userId: string;
}>;

export type AuthenticatedSupabaseContext = Readonly<{
  user: AuthenticatedUser;
  client: SupabaseClient;
}>;

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthenticatedSupabaseContext(): Promise<AuthenticatedSupabaseContext> {
  const client = await createSupabaseServerClient();
  // getUser() verifies the session with Supabase Auth instead of trusting a still-valid
  // local JWT after the underlying user has been deleted.
  const { data, error } = await client.auth.getUser();
  const userId = data.user?.id;

  if (error || typeof userId !== "string" || userId.length === 0) {
    throw new AuthenticationRequiredError();
  }

  return { user: { userId }, client };
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  return (await requireAuthenticatedSupabaseContext()).user;
}
