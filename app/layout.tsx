import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL("https://getthe.com"),
  title: {
    default: "GetThe Domain Marketplace",
    template: "%s | GetThe"
  },
  description:
    "AI-enabled domain marketplace for mid-tier domain sellers and buyers.",
  alternates: {
    canonical: "https://getthe.com"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <SiteHeader />
          {children}
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
