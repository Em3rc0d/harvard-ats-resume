'use client';

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { translations } from '@/lib/translations';

type Language = 'en' | 'es' | 'fr' | 'pt';
type Translations = typeof translations.en;

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = 'language';
const LANGUAGE_CHANGE_EVENT = 'cvengine:language-change';
const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'es', 'fr', 'pt'];

function isLanguage(value: string | null): value is Language {
    return value !== null && SUPPORTED_LANGUAGES.includes(value as Language);
}

function getLanguageSnapshot(): Language {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(saved) ? saved : 'en';
}

function getServerLanguageSnapshot(): Language {
    return 'en';
}

function subscribeToLanguage(callback: () => void) {
    if (typeof window === 'undefined') return () => undefined;

    const handleStorage = (event: StorageEvent) => {
        if (event.key === LANGUAGE_STORAGE_KEY) callback();
    };
    const handleLocalChange = () => callback();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLocalChange);

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLocalChange);
    };
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
    const language = useSyncExternalStore(
        subscribeToLanguage,
        getLanguageSnapshot,
        getServerLanguageSnapshot,
    );

    const handleSetLanguage = useCallback((lang: Language) => {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
    }, []);

    const value = useMemo(() => ({
        language,
        setLanguage: handleSetLanguage,
        t: translations[language],
    }), [handleSetLanguage, language]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
