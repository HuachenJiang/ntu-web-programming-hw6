import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IB AAHL AI Study Assistant Bot",
  description: "Telegram-based AI study assistant for IB AAHL learners.",
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
