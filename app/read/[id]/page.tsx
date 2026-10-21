import type { Metadata } from "next";
import { Reader } from "@/components/reader/Reader";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Reading" };

export default async function ReadPage({ params }: Props) {
  const { id } = await params;
  return <Reader id={id} initial={null} />;
}
