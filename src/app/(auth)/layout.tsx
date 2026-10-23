import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-surface px-4 py-3 text-ink md:px-7">
      {children}
    </div>
  );
}
