import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/SettingsPage";
import "../library/library.css";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsPage />;
}
