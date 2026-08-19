'use client';

import { useLanguage } from './LanguageProvider';
import { ChevronDown } from 'lucide-react';

const LANGUAGES = [
    { code: 'en', label: '🇺🇸 EN' },
    { code: 'es', label: '🇪🇸 ES' },
    { code: 'fr', label: '🇫🇷 FR' },
    { code: 'pt', label: '🇧🇷 PT' },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]['code'];

const ACCESSIBLE_LABEL: Record<LanguageCode, string> = {
    en: 'Select language',
    es: 'Seleccionar idioma',
    fr: 'Choisir la langue',
    pt: 'Selecionar idioma',
};

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="relative">
            <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                aria-label={ACCESSIBLE_LABEL[language]}
                className="appearance-none bg-white border border-gray-200 text-gray-700 py-1 pl-3 pr-8 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-300 transition-colors"
            >
                {LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
            </div>
        </div>
    );
}
