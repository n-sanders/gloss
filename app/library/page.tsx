import { redirect } from "next/navigation";

/** The shelf is the home page now; old links and bookmarks land there. */
export default function LibraryPage() {
  redirect("/");
}
