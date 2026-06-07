import { redirect } from "next/navigation";

/** "/" redirects to the public self-service lookup (also handled by middleware). */
export default function Home() {
  redirect("/status");
}
