const CAREER_VAULT_STORAGE_KEY = 'ats2:career-vault-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileCareerVaultId: string | undefined;

/**
 * Browser-held opaque capability used to continue the same Career Vault and
 * Opportunity History before an authenticated account boundary exists.
 */
export function getOrCreateCareerVaultId(): string {
  try {
    const existing = window.localStorage.getItem(CAREER_VAULT_STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const created = window.crypto.randomUUID();
    window.localStorage.setItem(CAREER_VAULT_STORAGE_KEY, created);
    return created;
  } catch {
    volatileCareerVaultId ??= window.crypto.randomUUID();
    return volatileCareerVaultId;
  }
}
