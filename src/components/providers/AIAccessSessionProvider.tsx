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
import type { AIAccessMode } from "../../domain/ai/AIAccess";
import { TransientBYOKStore } from "../../application/ai/TransientBYOKStore";

type AIAccessSessionContextValue = {
  mode: AIAccessMode | null;
  hasByokCredential: boolean;
  selectMode: (mode: AIAccessMode) => void;
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
  const [hasByokCredential, setHasByokCredential] = useState(false);

  const clearSessionSecrets = useCallback(() => {
    storeRef.current?.clear();
    setHasByokCredential(false);
  }, []);

  const selectMode = useCallback(
    (nextMode: AIAccessMode) => {
      if (nextMode !== "BYOK_GEMINI") {
        clearSessionSecrets();
      }
      setMode(nextMode);
    },
    [clearSessionSecrets],
  );

  const setByokCredential = useCallback((credential: string) => {
    storeRef.current?.set(credential);
    setHasByokCredential(true);
  }, []);

  const readByokCredential = useCallback(() => storeRef.current?.read() ?? null, []);

  const resetAIAccess = useCallback(() => {
    clearSessionSecrets();
    setMode(null);
  }, [clearSessionSecrets]);

  const value = useMemo<AIAccessSessionContextValue>(
    () => ({
      mode,
      hasByokCredential,
      selectMode,
      setByokCredential,
      readByokCredential,
      clearSessionSecrets,
      resetAIAccess,
    }),
    [
      mode,
      hasByokCredential,
      selectMode,
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
  if (!context) {
    throw new Error("useAIAccessSession must be used inside AIAccessSessionProvider");
  }
  return context;
}
