import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Cargo Load Planner",
  description: "Gemma 4 Cargo Workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}