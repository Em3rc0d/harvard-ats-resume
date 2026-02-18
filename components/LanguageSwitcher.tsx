'use client';

import { useLanguage } from './LanguageProvider';

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    const languages = [
        { code: 'en', label: '🇺🇸 EN' },
        { code: 'es', label: '🇪🇸 ES' },
        { code: 'fr', label: '🇫🇷 FR' },
        { code: 'pt', label: '🇧🇷 PT' },
    ] as const;

    return (
        <div className="relative">
            <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="appearance-none bg-white border border-gray-200 text-gray-700 py-1 pl-3 pr-8 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-300 transition-colors"
            >
                {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.label}
                    </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
            </div>
        </div>
    );
}
