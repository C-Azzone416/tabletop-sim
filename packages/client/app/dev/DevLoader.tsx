"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export function DevLoader() {
  const router = useRouter();

  useEffect(() => {
    async function seed() {
      const res = await fetch(`${SERVER_URL}/dev/seed`, { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      const { joinCode, profileId, playerName } = await res.json();
      await signIn("credentials", { name: playerName, redirect: false });
      router.push(`/game/${joinCode}?profileId=${profileId}&playerName=${encodeURIComponent(playerName)}`);
    }
    seed().catch(console.error);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-500">Starting dev game…</p>
    </div>
  );
}
