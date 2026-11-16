import type { Metadata } from "next";
import { CitizenShell } from "@/components/citizen/CitizenShell";

export const metadata: Metadata = { title: "NavoPulse", appleWebApp: { capable: true, title: "NavoPulse", statusBarStyle: "default" } };

export default function CitizenLayout({ children }: { children: React.ReactNode }) {
  return <CitizenShell>{children}</CitizenShell>;
}
