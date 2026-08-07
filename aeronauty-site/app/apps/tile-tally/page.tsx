import type { Metadata } from "next";
import TileTallyApp from "./TileTallyApp";

export const metadata: Metadata = {
  title: "Game Ledger | Aeronauty",
  description: "A private, flexible game scorekeeper and photo/video memory timeline.",
};

export default function TileTallyPage() {
  return <TileTallyApp />;
}
