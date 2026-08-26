const CAREER_VAULT_STORAGE_KEY = 'ats2:career-vault-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileCareerVaultId: string | undefined;

function createOpaqueUuid(): string {
  const cryptoApi = window.crypto;

  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * Browser-held opaque capability used to continue the same Career Vault and
 * Opportunity History before an authenticated account boundary exists.
 *
 * `crypto.randomUUID()` is only exposed by browsers in secure contexts. Local
 * RC testing may intentionally use an HTTP WSL address, so fall back to
 * `crypto.getRandomValues()` and construct an RFC 4122 version-4 UUID without
 * weakening the opaque capability into a predictable identifier.
 */
export function getOrCreateCareerVaultId(): string {
  try {
    const existing = window.localStorage.getItem(CAREER_VAULT_STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
  } catch {
    // Storage may be unavailable (privacy mode, sandboxing, browser policy).
    // Continue with an in-memory capability rather than blocking generation.
  }

  if (volatileCareerVaultId) return volatileCareerVaultId;

  const created = createOpaqueUuid();

  try {
    window.localStorage.setItem(CAREER_VAULT_STORAGE_KEY, created);
  } catch {
    volatileCareerVaultId = created;
  }

  return created;
}
