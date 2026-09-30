"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Trash2, Loader2, RefreshCw, Heart, Crown, MessageCircle } from "lucide-react";

interface Reply {
  _id: string;
  userId?: string;
  name: string;
  avatar?: string;
  message: string;
  isAdmin?: boolean;
  isHidden?: boolean;
  createdAt?: string;
}

interface Entry {
  _id: string;
  name: string;
  message: string;
  avatar?: string;
  image?: string;
  userId?: string;
  isAdmin?: boolean;
  isHidden?: boolean;
  isTextHidden?: boolean;
  isImageHidden?: boolean;
  likes?: string[];
  replies?: Reply[];
  createdAt: string;
}

export default function AdminGuestbookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/guestbook")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setError("Failed to load entries."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleHide = async (entry: Entry, field: 'isHidden' | 'isTextHidden' | 'isImageHidden' = 'isHidden') => {
    setBusyId(entry._id + field);
    try {
      const payload = { [field]: !entry[field] };
      const res = await fetch(`/api/admin/guestbook/${entry._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setEntries((prev) =>
        prev.map((e) => (e._id === entry._id ? { ...e, [field]: data[field] } : e))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (entry: Entry) => {
    if (!confirm(`Delete ${entry.name}'s message permanently? Its photo will also be removed.`)) return;
    setBusyId(entry._id);
    try {
      const res = await fetch(`/api/admin/guestbook/${entry._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setEntries((prev) => prev.filter((e) => e._id !== entry._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleReplyHide = async (entryId: string, reply: Reply) => {
    setBusyId(reply._id);
    try {
      const res = await fetch(`/api/admin/guestbook/${entryId}/reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply._id, isHidden: !reply.isHidden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setEntries((prev) =>
        prev.map((e) =>
          e._id === entryId
            ? {
                ...e,
                replies: (e.replies ?? []).map((r) =>
                  r._id === reply._id ? { ...r, isHidden: data.isHidden } : r
                ),
              }
            : e
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  };

  const removeReply = async (entryId: string, reply: Reply) => {
    if (!confirm(`Delete ${reply.name}'s reply permanently?`)) return;
    setBusyId(reply._id);
    try {
      const res = await fetch(`/api/admin/guestbook/${entryId}/reply`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setEntries((prev) =>
        prev.map((e) =>
          e._id === entryId
            ? { ...e, replies: (e.replies ?? []).filter((r) => r._id !== reply._id) }
            : e
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Guestbook Moderation</h1>
          <p className="mt-1 text-sm text-white/40">
            Hide or delete any visitor message or reply. Deleting a message also removes its photo.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-white/50">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-white/50">No guestbook entries yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry._id}
              className={`rounded-xl border p-4 transition-colors ${
                entry.isHidden
                  ? "border-white/5 bg-white/[0.01] opacity-60"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {entry.avatar && (
                      <img
                        src={entry.avatar}
                        alt=""
                        className="h-6 w-6 rounded-full"
                      />
                    )}
                    <span className="text-sm font-semibold text-white">{entry.name}</span>
                    {entry.isAdmin && (
                      <span className="inline-flex items-center gap-1 rounded bg-yellow-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-400">
                        <Crown size={11} className="fill-current" /> Admin
                      </span>
                    )}
                    {entry.isHidden && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        All Hidden
                      </span>
                    )}
                    {entry.isTextHidden && !entry.isHidden && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        Text Hidden
                      </span>
                    )}
                    {entry.isImageHidden && !entry.isHidden && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        Image Hidden
                      </span>
                    )}
                    <span className="text-xs text-white/30">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    {(entry.likes?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-white/40">
                        <Heart size={12} /> {entry.likes!.length}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-white/70">{entry.message}</p>
                  {entry.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.image}
                      alt="attachment"
                      className="mt-3 h-24 w-auto rounded-lg border border-white/10 object-cover"
                    />
                  )}

                  {/* Replies */}
                  {entry.replies && entry.replies.length > 0 && (
                    <div className="mt-4 space-y-2 border-l-2 border-white/10 pl-3">
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/30">
                        <MessageCircle size={12} /> {entry.replies.length}{" "}
                        {entry.replies.length === 1 ? "reply" : "replies"}
                      </p>
                      {entry.replies.map((reply) => (
                        <div
                          key={reply._id}
                          className={`flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 ${
                            reply.isHidden ? "opacity-50" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-white/90">
                                {reply.name}
                              </span>
                              {reply.isAdmin && (
                                <span className="inline-flex items-center gap-1 rounded bg-yellow-400/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-yellow-400">
                                  <Crown size={9} className="fill-current" /> Admin
                                </span>
                              )}
                              {reply.isHidden && (
                                <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                                  Hidden
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-white/60">{reply.message}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => toggleReplyHide(entry._id, reply)}
                              disabled={busyId === reply._id}
                              title={reply.isHidden ? "Show reply" : "Hide reply"}
                              className="grid h-6 w-6 place-items-center rounded border border-white/10 text-white/50 transition-colors hover:text-white disabled:opacity-50"
                            >
                              {busyId === reply._id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : reply.isHidden ? (
                                <Eye size={12} />
                              ) : (
                                <EyeOff size={12} />
                              )}
                            </button>
                            <button
                              onClick={() => removeReply(entry._id, reply)}
                              disabled={busyId === reply._id}
                              title="Delete reply"
                              className="grid h-6 w-6 place-items-center rounded border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2 flex-col sm:flex-row">
                  <div className="flex gap-1 flex-col items-center border border-white/5 bg-white/5 rounded-lg p-1">
                    <span className="text-[9px] uppercase text-white/40 font-semibold">All</span>
                    <button
                      onClick={() => toggleHide(entry, 'isHidden')}
                      disabled={busyId === entry._id + 'isHidden'}
                      title={entry.isHidden ? "Show completely" : "Hide completely"}
                      className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 transition-colors hover:text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {busyId === entry._id + 'isHidden' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : entry.isHidden ? (
                        <Eye size={14} />
                      ) : (
                        <EyeOff size={14} />
                      )}
                    </button>
                  </div>
                  
                  <div className="flex gap-1 flex-col items-center border border-white/5 bg-white/5 rounded-lg p-1">
                    <span className="text-[9px] uppercase text-white/40 font-semibold">Text</span>
                    <button
                      onClick={() => toggleHide(entry, 'isTextHidden')}
                      disabled={busyId === entry._id + 'isTextHidden'}
                      title={entry.isTextHidden ? "Show text" : "Hide text"}
                      className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 transition-colors hover:text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {busyId === entry._id + 'isTextHidden' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : entry.isTextHidden ? (
                        <Eye size={14} />
                      ) : (
                        <EyeOff size={14} />
                      )}
                    </button>
                  </div>

                  {entry.image && (
                    <div className="flex gap-1 flex-col items-center border border-white/5 bg-white/5 rounded-lg p-1">
                      <span className="text-[9px] uppercase text-white/40 font-semibold">Img</span>
                      <button
                        onClick={() => toggleHide(entry, 'isImageHidden')}
                        disabled={busyId === entry._id + 'isImageHidden'}
                        title={entry.isImageHidden ? "Show image" : "Hide image"}
                        className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 transition-colors hover:text-white hover:bg-white/10 disabled:opacity-50"
                      >
                        {busyId === entry._id + 'isImageHidden' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : entry.isImageHidden ? (
                          <Eye size={14} />
                        ) : (
                          <EyeOff size={14} />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-1 flex-col items-center ml-2">
                    <span className="text-[9px] uppercase text-white/40 font-semibold invisible">Del</span>
                    <button
                      onClick={() => remove(entry)}
                      disabled={busyId === entry._id}
                      title="Delete permanently"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {busyId === entry._id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
