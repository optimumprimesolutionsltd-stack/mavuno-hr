import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZawadiHR — AI Payroll & HR Platform for Kenya",
  description:
    "AI-powered payroll, HR and workforce management for the Kenyan market. PAYE, SHIF, NSSF, Housing Levy — fully automated.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#07090f] text-slate-200 antialiased">{children}</body>
    </html>
  );
}
