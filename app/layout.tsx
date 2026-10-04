import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Noto_Sans_Devanagari, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import Providers from "./ui/Providers";
import { themeInitScript } from "./ui/theme/ThemeProvider";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Serif display face for headings — the signature editorial voice.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
});

// Handwritten marker face for the homepage pull-quote.
const caveat = Caveat({
  variable: "--font-handwritten",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
export const metadata: Metadata = {
  title: "Sushanka Lamichhane – DevOps Engineer & Full-Stack Developer",
  description:
    "DevOps Engineer and Full-Stack Developer from Nepal. AWS · Docker · Kubernetes · Terraform · CI/CD · Red Hat Certified.",
  keywords: [
    "Sushanka Lamichhane",
    "developer portfolio",
    "web developer",
    "software developer",
    "full stack developer",
    "frontend developer",
    "React developer",
    "Next.js developer",
    "portfolio",
    "DevOps engineer",
    "cloud infrastructure",
    "AWS",
    "Docker",
    "Kubernetes",
    "Terraform",
    "CI/CD",
    "Linux",
    "Red Hat",
    "Ansible",
    "Jenkins",
  ],
  authors: [{ name: "Sushanka Lamichhane" }],
  creator: "Sushanka Lamichhane",
  metadataBase: new URL("https://sushanka.com.np"),
  openGraph: {
    title: "Sushanka Lamichhane – DevOps Engineer & Full-Stack Developer",
    description:
      "DevOps Engineer and Full-Stack Developer from Nepal. AWS · Docker · Kubernetes · Terraform · CI/CD · Red Hat Certified.",
    url: "https://sushanka.com.np",
    siteName: "Sushanka Lamichhane Portfolio",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "Sushanka Lamichhane Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sushanka Lamichhane – DevOps Engineer & Full-Stack Developer",
    description:
      "DevOps Engineer and Full-Stack Developer from Nepal. AWS · Docker · Kubernetes · Terraform · CI/CD · Red Hat Certified.",
    images: ["/profile.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="canonical" href="https://sushanka.com.np" />
        {/* Set theme before paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Umami analytics — privacy-friendly, cookieless page view tracking. */}
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="33496c24-217f-414d-8213-f9b51c8575bf"
        />
      </head>

      <body
        className={`${geist.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${notoSansDevanagari.variable} ${caveat.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
