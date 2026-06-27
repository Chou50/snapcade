import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snapcade — Turn reality into a game",
  description: "Snap a scene. Turn it into a playable game in seconds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
