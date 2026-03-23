import { GameClient } from "./GameClient";

interface PageProps {
  params: Promise<{ joinCode: string }>;
}

export default async function GamePage({ params }: PageProps) {
  const { joinCode } = await params;
  return <GameClient joinCode={joinCode} />;
}
