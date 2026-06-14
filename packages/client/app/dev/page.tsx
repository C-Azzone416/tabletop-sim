import { notFound } from "next/navigation";
import { DevLoader } from "./DevLoader";

export default function DevPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "true") {
    notFound();
  }

  return <DevLoader />;
}
