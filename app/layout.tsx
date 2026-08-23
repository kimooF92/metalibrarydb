import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { cn } from "@/lib/utils";

const manropeHeading = Manrope({subsets:['latin'],variable:'--font-heading'});

const ibmPlexSans = IBM_Plex_Sans({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meta Ad Library Tracker",
  description: "Monitor Meta Ad Library search URLs and track active ad result counts over time.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

import { ToastProvider } from "@/components/toast-context";
import { AppShell } from "@/components/app-shell";
import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", ibmPlexSans.variable, manropeHeading.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const saved = localStorage.getItem('theme');
                  if (saved === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground h-screen w-screen flex flex-col md:flex-row antialiased overflow-hidden`}>
        <ToastProvider>
          <AppShell>
            {children}
          </AppShell>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}

