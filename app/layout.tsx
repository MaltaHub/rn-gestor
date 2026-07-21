import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth/auth-provider";
import { GlobalErrorListener } from "@/components/shared/global-error-listener";
import "./globals.css";
import "@/styles/anuncio-insights.css";

export const metadata: Metadata = {
  title: "RN Gestor Web",
  description: "Gestao comercial moderna com Vercel + Supabase"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <GlobalErrorListener />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
