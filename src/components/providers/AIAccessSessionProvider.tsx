"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AIAccessMode, UserAIProvider } from "../../domain/ai/AIAccess";
import { TransientBYOKStore } from "../../application/ai/TransientBYOKStore";

type AIAccessSessionContextValue = {
  mode: AIAccessMode | null;
  provider: UserAIProvider;
  hasByokCredential: boolean;
  selectMode: (mode: AIAccessMode) => void;
  selectProvider: (provider: UserAIProvider) => void;
  setByokCredential: (credential: string) => void;
  readByokCredential: () => string | null;
  clearSessionSecrets: () => void;
  resetAIAccess: () => void;
};

const AIAccessSessionContext = createContext<AIAccessSessionContextValue | null>(null);

export function AIAccessSessionProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<TransientBYOKStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new TransientBYOKStore();
  }

  const [mode, setMode] = useState<AIAccessMode | null>(null);
  const [provider, setProvider] = useState<UserAIProvider>("GEMINI");
  const [hasByokCredential, setHasByokCredential] = useState(false);

  const clearSessionSecrets = useCallback(() => {
    storeRef.current?.clear();
    setHasByokCredential(false);
  }, []);

  const selectMode = useCallback(
    (nextMode: AIAccessMode) => {
      if (nextMode !== "BYOK_GEMINI") clearSessionSecrets();
      setMode(nextMode);
    },
    [clearSessionSecrets],
  );

  const selectProvider = useCallback((nextProvider: UserAIProvider) => {
    clearSessionSecrets();
    setProvider(nextProvider);
  }, [clearSessionSecrets]);

  const setByokCredential = useCallback((credential: string) => {
    storeRef.current?.set(credential);
    setHasByokCredential(true);
  }, []);

  const readByokCredential = useCallback(() => storeRef.current?.read() ?? null, []);

  const resetAIAccess = useCallback(() => {
    clearSessionSecrets();
    setProvider("GEMINI");
    setMode(null);
  }, [clearSessionSecrets]);

  const value = useMemo<AIAccessSessionContextValue>(
    () => ({
      mode,
      provider,
      hasByokCredential,
      selectMode,
      selectProvider,
      setByokCredential,
      readByokCredential,
      clearSessionSecrets,
      resetAIAccess,
    }),
    [
      mode,
      provider,
      hasByokCredential,
      selectMode,
      selectProvider,
      setByokCredential,
      readByokCredential,
      clearSessionSecrets,
      resetAIAccess,
    ],
  );

  return <AIAccessSessionContext.Provider value={value}>{children}</AIAccessSessionContext.Provider>;
}

export function useAIAccessSession() {
  const context = useContext(AIAccessSessionContext);
  if (!context) throw new Error("useAIAccessSession must be used inside AIAccessSessionProvider");
  return context;
}
