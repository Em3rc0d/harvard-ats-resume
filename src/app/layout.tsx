import type { Metadata } from "next";
import "./globals.css";
import "./b2.css";

export const metadata: Metadata = {
  title: "CV Engine vNext",
  description: "Evidence-bound career intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
