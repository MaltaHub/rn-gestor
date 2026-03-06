import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RN Gestor Web",
  description: "Gestao comercial moderna com Vercel + Supabase"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
