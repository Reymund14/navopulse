import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NavoPulse", template: "%s · NavoPulse" },
  description: "Smart city civic engagement, disaster response, and AI public assistance for Navotas City.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/brand/icon-192.png", sizes: "192x192" }], apple: "/brand/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2a2c66",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
