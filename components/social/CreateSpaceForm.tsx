"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CreateSpaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    // create_space() (0011_spaces.sql) does the insert into both spaces
    // and space_members atomically — "the creator becomes the owner and
    // the first member" has to happen as one unit, which PostgREST can't
    // guarantee across two sequential .insert() calls from here.
    const { data, error } = await supabase.rpc("create_space", {
      p_name: name.trim(),
      p_description: description.trim() || null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const slug = data?.[0]?.slug as string | undefined;
    if (slug) {
      router.push(`/s/${slug}`);
      router.refresh();
    } else {
      router.push("/");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="social-field">
        <label htmlFor="spaceName">Name</label>
        <input
          id="spaceName"
          type="text"
          required
          placeholder="UNH Investment Club"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="social-field">
        <label htmlFor="spaceDescription">Description (optional)</label>
        <input
          id="spaceDescription"
          type="text"
          placeholder="Where the pitch discussion actually lives."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && <div className="social-error">{error}</div>}
      <button className="social-btn social-btn-primary" type="submit" disabled={loading || !name.trim()}>
        {loading ? "Creating…" : "Create space"}
      </button>
    </form>
  );
}
