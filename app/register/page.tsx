import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/actions/user";
import LoginGate from "../login-gate";

export default async function RegisterPage() {
  const user = await getCurrentAppUser();

  if (user) {
    redirect("/panel");
  }

  return <LoginGate initialTab="register" />;
}
