import { getCurrentAppUser } from "@/lib/actions/user";
import LandingClient from "./LandingClient";

export default async function Landing() {
  const user = await getCurrentAppUser();

  return <LandingClient isAuthenticated={!!user} />;
}
