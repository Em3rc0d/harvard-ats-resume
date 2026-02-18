import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CVEngine - AI Professional Resume Builder',
  description: 'Build ATS-optimized professional resumes with AI. Get keyword matching analysis, ATS scoring, and professional formatting for tech professionals.',
  keywords: ['ATS resume', 'professional resume', 'AI resume builder', 'job application', 'resume optimization', 'tech resume'],
  authors: [{ name: 'CVEngine' }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'CVEngine - AI Professional Resume Builder',
    description: 'Build ATS-optimized professional resumes with AI-powered keyword matching and professional formatting.',
    siteName: 'CVEngine',
  },
};

import { LanguageProvider } from '@/components/LanguageProvider';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2563EB" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
