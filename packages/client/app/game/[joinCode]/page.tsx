import { auth } from "../../../auth";
import { GameClient } from "./GameClient";

interface PageProps {
  params: Promise<{ joinCode: string }>;
  searchParams: Promise<{ profileId?: string; playerName?: string }>;
}

export default async function GamePage({ params, searchParams }: PageProps) {
  const isDev = process.env.NODE_ENV !== "production";
  const [{ joinCode }, resolvedSearch, session] = await Promise.all([params, searchParams, auth()]);
  const profileId = session?.user?.id ?? (isDev ? resolvedSearch.profileId : undefined) ?? "";
  const playerName = session?.user?.name ?? (isDev ? resolvedSearch.playerName : undefined) ?? "";
  return (
    <GameClient
      joinCode={joinCode}
      profileId={profileId}
      playerName={playerName}
    />
  );
}
