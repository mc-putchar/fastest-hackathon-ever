import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dream Agent",
  description: "A semi-autonomous digital bureaucracy operator for Berlin-first tasks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
