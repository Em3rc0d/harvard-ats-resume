import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateCareerVaultId } from '../../lib/client/CareerVaultCapability';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('Career Vault capability works on HTTP-like browser contexts without crypto.randomUUID', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
      crypto: {
        getRandomValues(bytes: Uint8Array) {
          bytes.fill(0);
          return bytes;
        },
      },
    },
  });

  try {
    const id = getOrCreateCareerVaultId();
    assert.match(id, UUID_V4_PATTERN);
    assert.equal(id, '00000000-0000-4000-8000-000000000000');
    assert.equal(storage.get('ats2:career-vault-id'), id);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
