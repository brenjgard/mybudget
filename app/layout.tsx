import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";
import FeedbackButton from "./components/FeedbackButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harbor",
  description: "Plan ahead. Stay ahead.",
  applicationName: "Harbor",
  other: { "apple-mobile-web-app-capable": "yes" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Harbor", statusBarStyle: "default" },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    icon: "/harbor-logo.svg",
  },
};

export const viewport: Viewport = { themeColor: "#1B3A5C", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased flex flex-col min-h-screen`}>
        <NavBar />
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
