import type { Metadata } from "next";
import { isDemoMode } from "@/lib/runtime-mode";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "FleteOps",
  description:
    "Broker-first logistics reconciliation platform for WhatsApp-native shipment operations.",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <body>
        {!isDemoMode() && <script
          // Applies the persisted (or system) theme before first paint.
          dangerouslySetInnerHTML={{
            __html:
              `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
