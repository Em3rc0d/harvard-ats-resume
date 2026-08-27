import { createSupabaseServerClient } from "../../infrastructure/supabase/server";

export type AuthenticatedUser = Readonly<{
  userId: string;
}>;

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string" || userId.length === 0) {
    throw new AuthenticationRequiredError();
  }

  return { userId };
}
