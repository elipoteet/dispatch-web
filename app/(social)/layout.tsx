import { SocialHeader } from "@/components/social/SocialHeader";

// Chrome for the new campus-social surface — /, /signup, /login,
// /onboarding, /p/[id], /u/[handle] (public URL /@handle, see
// next.config.ts). Deliberately minimal: just the brand mark and
// sign-in/out state, no research-desk nav. Scoped under .social so the
// loosened radius (defined in app/globals.css) stays out of the
// equity-research surface in app/(research)/.
export default function SocialLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="social">
      <SocialHeader />
      <main className="social-main">{children}</main>
    </div>
  );
}
