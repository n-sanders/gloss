import type { Metadata } from "next";
import { Library } from "@/components/library/Library";
import "./library/library.css";

export const metadata: Metadata = { title: "Library" };

export default function Home() {
  return <Library />;
}
