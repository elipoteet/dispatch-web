import type { Metadata } from "next";
import { EmailCodeForm } from "@/components/social/EmailCodeForm";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ invite?: string }> };

export default async function SignUpPage(props: Props) {
  const { invite } = await props.searchParams;
  return <EmailCodeForm mode="signup" inviteToken={invite} />;
}
