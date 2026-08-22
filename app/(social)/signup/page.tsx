import type { Metadata } from "next";
import { EmailCodeForm } from "@/components/social/EmailCodeForm";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <EmailCodeForm mode="signup" />;
}
