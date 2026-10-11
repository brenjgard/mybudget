import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";
import FeedbackButton from "./components/FeedbackButton";
import appleStartupSizes from "./data/apple-startup-sizes.json";

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
  appleWebApp: {
    capable: true, title: "Harbor", statusBarStyle: "default",
    startupImage: appleStartupSizes.flatMap(([width, height, scale]) => ["portrait", "landscape"].map((orientation) => ({
      url: `/apple-startup/${(orientation === "portrait" ? width : height) * scale}x${(orientation === "portrait" ? height : width) * scale}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})`,
    }))),
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/harbor-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/harbor-favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
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
      <body style={{ backgroundColor: "#F8FAFC" }} className={`${geistSans.variable} antialiased flex flex-col min-h-screen`}>
        <NavBar />
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
