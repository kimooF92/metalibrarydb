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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", ibmPlexSans.variable, manropeHeading.variable)}>
      <body className={`${inter.className} bg-background text-foreground min-h-screen flex flex-col antialiased`}>
        <Navigation />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
