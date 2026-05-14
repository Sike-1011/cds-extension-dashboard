import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CDS Extension Dashboard",
  description: "Manager dashboard for CDS Loans Automator access control"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
