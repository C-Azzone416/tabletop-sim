import type { Metadata } from "next";
import { Archivo, Archivo_Black } from "next/font/google";
import { Providers } from "./providers";
import "@/styles/theme.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tabletop Simulator",
  description: "A multiplayer tabletop gaming platform",
};

// Stops mobile browsers force-darkening the app themselves, which would
// wreck the player seat colors (DESIGN-APPENDIX.md §16).
export const viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1B2E" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${archivoBlack.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
