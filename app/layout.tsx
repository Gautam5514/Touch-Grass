import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AiPrefetch from "@/components/AiPrefetch";
import BottomNav, { SideNav } from "@/components/BottomNav";
import ServiceWorker from "@/components/ServiceWorker";
import StorageGate from "@/components/StorageGate";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "WildQuest AI: Explore more. Scroll less.", template: "%s · WildQuest AI" },
  description: "Nature missions for a walk outside. Open-source AI running on your phone checks each discovery, and your photos never leave the device.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "WildQuest", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1d5c42", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh lg:flex">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-forest focus:px-4 focus:py-3 focus:text-white">
          Skip to content
        </a>
        <SideNav />
        <div className="flex min-h-dvh flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-28 pt-6 md:max-w-3xl md:px-8 md:pt-10 lg:max-w-4xl lg:px-16 lg:pb-16 lg:pt-16">
            <StorageGate>{children}</StorageGate>
          </div>
        </div>
        <BottomNav />
        <ServiceWorker />
        <AiPrefetch />
      </body>
    </html>
  );
}
