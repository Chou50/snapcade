import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scene2Game",
  description: "Turn this exact moment into a playable game.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
