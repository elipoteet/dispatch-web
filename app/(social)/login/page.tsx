import type { Metadata } from "next";
import { EmailCodeForm } from "@/components/social/EmailCodeForm";

export const metadata: Metadata = {
  title: "Log In",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <EmailCodeForm mode="login" />;
}
