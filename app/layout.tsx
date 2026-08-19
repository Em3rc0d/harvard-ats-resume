import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { LanguageProvider } from '@/components/LanguageProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CV Engine — Career Opportunity Intelligence',
  description: 'Evidence-bound career intelligence for reviewing career evidence, assessing job opportunities, and generating traceable resume versions with guardrails.',
  keywords: [
    'career intelligence',
    'career evidence',
    'job opportunity assessment',
    'resume provenance',
    'ATS resume',
    'job application',
  ],
  authors: [{ name: 'CV Engine' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'CV Engine — Career Opportunity Intelligence',
    description: 'Evidence before persuasion: candidate truth, market truth, explainable fit, and traceable resume generation.',
    siteName: 'CV Engine',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2563EB" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
