"use client";

import { useOptimistic } from "react";
import type { FeedPost, Reply } from "./queries";

// First use of React 19's useOptimistic in this codebase — per
// docs/phase-four.md's "architectural note," used deliberately just here
// (where a user needs to see their own submission immediately) rather
// than converting the whole app to client-rendered state. The dispatched
// action (addOptimisticPost/addOptimisticReply below) MUST be called
// inside a transition (React throws otherwise) — each composer/reply box
// wraps its own call in startTransition, this hook only owns the state.
//
// Reconciliation is automatic, not something this hook manages by hand:
// once the real insert succeeds and router.refresh() re-fetches the true
// server data, the optimistic layer resets against the new `initialPosts`
// prop (which now already contains the real row), so the temporary entry
// is replaced by the real one without a visible jump. If the insert
// fails, the caller never lets that refresh happen, so the optimistic
// entry needs to be explicitly reverted — see each composer's own
// try/catch.
// Only "add" — editing/deleting an existing post (PostActions) only ever
// happens on /p/[id], one post at a time, not inside a list, so that path
// goes through PostDetailClient's own inline useOptimistic instead of
// this hook.
export function useOptimisticFeed(initialPosts: FeedPost[]) {
  return useOptimistic(initialPosts, (state: FeedPost[], action: { type: "add"; post: FeedPost }) => {
    if (action.type === "add") return [action.post, ...state];
    return state;
  });
}

export type ReplyAction =
  | { type: "add"; reply: Reply }
  | { type: "update"; id: string; patch: Partial<Reply> };

export function useOptimisticReplies(initialReplies: Reply[]) {
  return useOptimistic(initialReplies, (state: Reply[], action: ReplyAction) => {
    if (action.type === "add") return [...state, action.reply];
    if (action.type === "update") return state.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r));
    return state;
  });
}
