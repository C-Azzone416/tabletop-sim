import { notFound } from "next/navigation";
import { DevLoader } from "./DevLoader";

export default function DevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevLoader />;
}
