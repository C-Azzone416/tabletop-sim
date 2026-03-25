import { auth } from "../../../auth";
import { GameClient } from "./GameClient";

interface PageProps {
  params: Promise<{ joinCode: string }>;
}

export default async function GamePage({ params }: PageProps) {
  const [{ joinCode }, session] = await Promise.all([params, auth()]);
  return (
    <GameClient
      joinCode={joinCode}
      profileId={session?.user?.id ?? ""}
      playerName={session?.user?.name ?? ""}
    />
  );
}
