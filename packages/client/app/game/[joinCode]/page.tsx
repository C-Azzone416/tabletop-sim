import { auth } from "../../../auth";
import { GameClient } from "./GameClient";
import { parseSeatOptions } from "./parseSeatOptions";

interface PageProps {
  params: Promise<{ joinCode: string }>;
  searchParams: Promise<{ profileId?: string; playerName?: string; seatOptions?: string }>;
}

export default async function GamePage({ params, searchParams }: PageProps) {
  const isDev = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  const [{ joinCode }, resolvedSearch, session] = await Promise.all([params, searchParams, auth()]);
  const profileId = session?.user?.id ?? (isDev ? resolvedSearch.profileId : undefined) ?? "";
  const playerName = session?.user?.name ?? (isDev ? resolvedSearch.playerName : undefined) ?? "";
  const seatOptions = isDev ? parseSeatOptions(resolvedSearch.seatOptions) : [];
  return (
    <GameClient
      joinCode={joinCode}
      profileId={profileId}
      playerName={playerName}
      seatOptions={seatOptions}
    />
  );
}
