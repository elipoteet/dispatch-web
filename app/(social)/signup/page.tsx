import type { Metadata } from "next";
import { EmailCodeForm } from "@/components/social/EmailCodeForm";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ invite?: string; confirmed?: string }> };

export default async function SignUpPage(props: Props) {
  const { invite, confirmed } = await props.searchParams;
  // Set only when this signup was reached via InviteModal's "Verify and
  // join" button (docs/invite-modal-build-brief.md) — i.e. the visitor
  // already confirmed intent to join at /j/[token] before ever getting
  // here, so onboarding should auto-join afterward rather than showing
  // the modal a second time. Threaded through exactly like invite is.
  return <EmailCodeForm mode="signup" inviteToken={invite} inviteConfirmed={confirmed === "1"} />;
}
