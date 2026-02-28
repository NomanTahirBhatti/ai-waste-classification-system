import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Waste Classifier (Prototype)",
  description: "AI-based smart waste classification prototype",
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