import "./globals.css";
import "./motion.css";
import type { Metadata } from "next";
import { AppMotion } from '@/components/app-motion';
export const metadata: Metadata = { title: "TableSync", description: "Collaborative dining, without the split-bill headache." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><AppMotion>{children}</AppMotion></body></html>; }
