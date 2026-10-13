import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PowderPredictor — Northeast Snow Intelligence & Alpine Microclimates",
  description:
    "Atmospheric lapse rate downscaling and mountain snow forecasts for 26 Northeast peaks across Vermont, New Hampshire, Maine, New York, and Massachusetts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0c0f] text-[#f4f3ef] selection:bg-white/15 selection:text-white">
        {children}
      </body>
    </html>
  );
}
