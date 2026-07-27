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

import { SidebarProvider } from "@/components/sidebar-context";

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
        <SidebarProvider>
          <Navigation />
          <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col p-4 md:px-6 md:py-5 bg-background">
            {children}
          </main>
        </SidebarProvider>
      </body>
    </html>
  );
}
