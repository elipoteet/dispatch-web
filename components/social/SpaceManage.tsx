"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import type { SpaceMember } from "@/lib/social/spaces";

// Owner-only controls: rename, edit description, remove a member, transfer
// ownership, delete the space. No prototype reference exists for any of
// this (only invite copy/regenerate appear there) — built from this app's
// existing form/pill-button language instead. Kept as one small,
// collapsed-by-default section rather than a separate settings page,
// since none of this is needed often.
export function SpaceManage({
  spaceId,
  name,
  description,
  members,
  viewerId,
}: {
  spaceId: string;
  name: string;
  description: string | null;
  members: SpaceMember[];
  viewerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [descDraft, setDescDraft] = useState(description ?? "");
  const [transferTo, setTransferTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherMembers = members.filter((m) => m.id !== viewerId);

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("spaces")
      .update({ name: nameDraft.trim(), description: descDraft.trim() || null })
      .eq("id", spaceId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingDetails(false);
    router.refresh();
  }

  async function handleRemoveMember(profileId: string, displayName: string) {
    if (!window.confirm(`Remove ${displayName} from this space?`)) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("space_members")
      .delete()
      .eq("space_id", spaceId)
      .eq("profile_id", profileId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function handleTransfer() {
    if (!transferTo) return;
    const target = members.find((m) => m.id === transferTo);
    if (!target) return;
    if (!window.confirm(`Make ${target.displayName} the owner? You'll become a regular member.`)) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("transfer_space_ownership", {
      p_space_id: spaceId,
      p_new_owner_id: transferTo,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${name}"? This can't be undone, and everyone loses access immediately.`)) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("spaces")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", spaceId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="space-manage-toggle" onClick={() => setOpen(true)}>
        Manage space
      </button>
    );
  }

  return (
    <div className="space-manage">
      <button type="button" className="space-manage-toggle" onClick={() => setOpen(false)}>
        Hide manage
      </button>

      {editingDetails ? (
        <form onSubmit={handleSaveDetails} className="space-manage-section">
          <div className="social-field">
            <label htmlFor="spaceManageName">Name</label>
            <input id="spaceManageName" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} required />
          </div>
          <div className="social-field">
            <label htmlFor="spaceManageDesc">Description</label>
            <input id="spaceManageDesc" value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="social-btn social-btn-primary social-btn-small" type="submit" disabled={loading}>
              Save
            </button>
            <button
              type="button"
              className="social-btn social-btn-small"
              onClick={() => {
                setEditingDetails(false);
                setNameDraft(name);
                setDescDraft(description ?? "");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-manage-section">
          <button type="button" className="social-btn social-btn-small" onClick={() => setEditingDetails(true)}>
            Rename / edit description
          </button>
        </div>
      )}

      <div className="space-manage-section">
        <span className="space-manage-label">Members</span>
        {otherMembers.length === 0 ? (
          <p className="hint">Nobody else has joined yet.</p>
        ) : (
          otherMembers.map((m) => (
            <div key={m.id} className="space-manage-member-row">
              <Avatar avatarUrl={m.avatarUrl} displayName={m.displayName} className="avatar--sm" />
              <span>{m.displayName}</span>
              <button
                type="button"
                className="social-btn social-btn-small"
                style={{ marginLeft: "auto" }}
                onClick={() => handleRemoveMember(m.id, m.displayName)}
                disabled={loading}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {otherMembers.length > 0 && (
        <div className="space-manage-section">
          <span className="space-manage-label">Transfer ownership</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              <option value="">Choose a member</option>
              {otherMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="social-btn social-btn-small"
              onClick={handleTransfer}
              disabled={!transferTo || loading}
            >
              Transfer
            </button>
          </div>
        </div>
      )}

      <div className="space-manage-section">
        <button type="button" className="social-btn social-btn-small" onClick={handleDelete} disabled={loading}>
          Delete space
        </button>
      </div>

      {error && <div className="social-error">{error}</div>}
    </div>
  );
}
