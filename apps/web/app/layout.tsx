import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "TableSync", description: "Collaborative dining, without the split-bill headache." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
