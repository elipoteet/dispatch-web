import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserSpaces } from "@/lib/social/spaces";
import { EmptyState } from "@/components/social/EmptyState";

export const metadata: Metadata = {
  title: "Spaces",
  robots: { index: false, follow: false },
};

// A full-page Spaces index, reachable from the mobile bottom nav's
// "Spaces" tab — the left sidebar can show every Space as its own row,
// but a bottom nav only has one tap target for all of them, so there
// needs to be somewhere for that tap to land. Not a new product surface:
// same getUserSpaces data the sidebar already renders, just as a full
// page instead of a nav section. Desktop users have no reason to land
// here (the sidebar already shows this list, and the bottom nav that
// links here is hidden above 900px), but the route works either way.
export default async function SpacesIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const { data: hasProfile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!hasProfile) redirect("/onboarding");

  const spaces = await getUserSpaces(supabase, user.id);

  return (
    <div className="social-content-card">
      <div className="social-orientation">
        <p>Your Spaces.</p>
      </div>

      {spaces.length === 0 ? (
        <EmptyState headline="No Spaces yet." sub="Create one, or ask a club officer for an invite link." />
      ) : (
        <div className="spaces-index-list">
          {spaces.map((space) => (
            <Link key={space.id} href={`/s/${space.slug}`} className="spaces-index-row">
              <span className="spaces-index-name">{space.name}</span>
              {space.unreadCount > 0 && <span className="nav-space-count">{space.unreadCount}</span>}
            </Link>
          ))}
        </div>
      )}

      <Link href="/s/new" className="social-btn social-btn-small" style={{ marginTop: 16 }}>
        + New space
      </Link>
    </div>
  );
}
