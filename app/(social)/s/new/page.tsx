import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateSpaceForm } from "@/components/social/CreateSpaceForm";

export const metadata: Metadata = {
  title: "New Space",
  robots: { index: false, follow: false },
};

// A plain full-page form, matching this surface's existing pattern
// (onboarding/signup/login are all full pages) rather than a modal — no
// prototype reference exists for this at all; the prototype's "+ New
// space" nav link is a bare toast placeholder, not a real form.
export default async function NewSpacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <div className="social-auth-wrap">
      <div className="social-auth-card">
        <h1>Start a space.</h1>
        <p className="sub">
          A private room for a club, a pitch team, or any finance group that already talks somewhere worse. You
          become its owner — invite people with a link once it exists.
        </p>
        <CreateSpaceForm />
      </div>
    </div>
  );
}
