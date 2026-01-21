import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "0x55aa - Personal Blog",
  description: "Laravel Developer, Cybersecurity Enthusiast, Open Source Contributor",
  keywords: ["Laravel", "PHP", "Cybersecurity", "Open Source", "RF", "SDR"],
  authors: [{ name: "Anurag" }],
  openGraph: {
    title: "0x55aa - Personal Blog",
    description: "Laravel Developer, Cybersecurity Enthusiast, Open Source Contributor",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
