import { auth } from "../../../auth";
import { GameClient } from "./GameClient";

interface PageProps {
  params: Promise<{ joinCode: string }>;
  searchParams: Promise<{ profileId?: string; playerName?: string }>;
}

export default async function GamePage({ params, searchParams }: PageProps) {
  const [{ joinCode }, resolvedSearch, session] = await Promise.all([params, searchParams, auth()]);
  const profileId = session?.user?.id ?? resolvedSearch.profileId ?? "";
  const playerName = session?.user?.name ?? resolvedSearch.playerName ?? "";
  return (
    <GameClient
      joinCode={joinCode}
      profileId={profileId}
      playerName={playerName}
    />
  );
}
