import { GeminiCredentialInputSchema } from "../../domain/ai/AIAccess";

/**
 * Request/session-only secret holder. The private field is intentionally not
 * enumerable, so JSON.stringify(store) yields `{}` rather than the credential.
 * Creating a fresh instance is the only recovery after page reload.
 */
export class TransientBYOKStore {
  #credential: string | null = null;

  set(rawCredential: string) {
    this.#credential = GeminiCredentialInputSchema.parse(rawCredential);
  }

  read(): string | null {
    return this.#credential;
  }

  hasCredential(): boolean {
    return this.#credential !== null;
  }

  clear() {
    this.#credential = null;
  }
}
