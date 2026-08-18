import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Pencil, Reply, Send, Trash2 } from "lucide-react";
import { Alert, Avatar, Button, Card, Skeleton, TextArea, useToast } from "@idds/react";
import { API_BASE_URL, authHeaders, avatarUrl, currentUser } from "../lib/api";

const MAX_COMMENT_LENGTH = 1000;

const formatCommentDate = (date) => new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(date));

const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "K";

function CommentComposer({ label, initialValue = "", busy, onCancel, onSubmit }) {
  const [content, setContent] = useState(initialValue);

  const submit = async (event) => {
    event.preventDefault();
    if (!content.trim()) return;
    const submitted = await onSubmit(content.trim());
    if (submitted) setContent("");
  };

  return (
    <form className="mt-4" onSubmit={submit}>
      <TextArea
        label={label}
        value={content}
        onChange={setContent}
        placeholder="Tulis tanggapan yang bermanfaat dan sopan…"
        maxLength={MAX_COMMENT_LENGTH}
        showCharCount
        minRows={3}
        maxRows={8}
        disabled={busy}
      />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {onCancel && <Button type="button" hierarchy="tertiary" size="sm" disabled={busy} onClick={onCancel}>Batal</Button>}
        <Button type="submit" hierarchy="primary" size="sm" prefixIcon={<Send size={15} />} disabled={busy || !content.trim()}>{busy ? "Mengirim…" : "Kirim komentar"}</Button>
      </div>
    </form>
  );
}

function CommentNode({ comment, depth, user, canWriteComment, actionId, replyingTo, editingId, onReply, onEdit, onDelete, onCancelReply, onCancelEdit, canModerate }) {
  const isOwner = user?.id === comment.author?.id;
  const replyIsOpen = replyingTo === comment.id;
  const editIsOpen = editingId === comment.id;
  const isBusy = Boolean(actionId);
  const nodeStyle = depth ? { marginLeft: `${Math.min(depth, 4) * 12}px` } : undefined;

  return (
    <li className={depth ? "mt-4 border-l border-stroke-secondary pl-3" : ""} style={nodeStyle}>
      <div className="rounded-xl bg-surface-secondary p-4">
        {comment.is_deleted ? (
          <p className="text-sm italic text-content-secondary">Komentar telah dihapus.</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Avatar src={avatarUrl(comment.author?.avatar_url) || undefined} alt={comment.author?.full_name || "Pengguna"} initials={initials(comment.author?.full_name)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-semibold text-content-primary">{comment.author?.full_name || "Pengguna"}</p>
                  {comment.author?.role === "pegawai" && <span className="text-xs font-medium text-content-guide">Pegawai</span>}
                  <span className="text-xs text-content-secondary">{formatCommentDate(comment.created_at)}{comment.updated_at !== comment.created_at ? " · diedit" : ""}</span>
                </div>
                {editIsOpen ? (
                  <CommentComposer
                    label="Ubah komentar"
                    initialValue={comment.content}
                    busy={isBusy}
                    onCancel={onCancelEdit}
                    onSubmit={(content) => onEdit(comment.id, content)}
                  />
                ) : (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-content-primary">{comment.content}</p>
                )}
              </div>
            </div>

            {!editIsOpen && (canWriteComment || canModerate) && (
              <div className="mt-3 flex flex-wrap gap-1 pl-11">
                {canWriteComment && <Button type="button" hierarchy="link" size="sm" prefixIcon={<Reply size={14} />} disabled={isBusy} onClick={() => onReply(comment.id)}>Balas</Button>}
                {canWriteComment && isOwner && <Button type="button" hierarchy="link" size="sm" prefixIcon={<Pencil size={14} />} disabled={isBusy} onClick={() => onEdit(comment.id)}>Ubah</Button>}
                {(isOwner || canModerate) && <Button type="button" hierarchy="link" size="sm" prefixIcon={<Trash2 size={14} />} disabled={isBusy} onClick={() => onDelete(comment.id, canModerate && !isOwner)}>{canModerate && !isOwner ? "Sembunyikan" : "Hapus"}</Button>}
              </div>
            )}

            {replyIsOpen && (
              <div className="pl-0 sm:pl-11">
                <CommentComposer label="Balas komentar" busy={isBusy} onCancel={onCancelReply} onSubmit={(content) => onReply(comment.id, content)} />
              </div>
            )}
          </>
        )}
      </div>

      {comment.replies?.length > 0 && (
        <ol className="list-none p-0" aria-label="Balasan komentar">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              user={user}
              canWriteComment={canWriteComment}
              actionId={actionId}
              replyingTo={replyingTo}
              editingId={editingId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onCancelReply={onCancelReply}
              onCancelEdit={onCancelEdit}
              canModerate={canModerate}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

export default function CommentsSection({ assetId, canModerate = false }) {
  const { toast } = useToast();
  const [comments, setComments] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const user = currentUser();
  const canWriteComment = ["user", "pegawai"].includes(user?.role);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/assets/${assetId}/comments`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat komentar");
      setComments(result.data || []);
      setTotalItems(result.totalItems || 0);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const request = async (url, options, successMessage) => {
    setActionId(url);
    setError("");
    try {
      const response = await fetch(url, options);
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "Komentar tidak dapat diproses");
      await loadComments();
      toast({ title: successMessage, state: "positive", position: "top-right" });
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setActionId("");
    }
  };

  const createComment = async (content, parentId = null) => {
    const completed = await request(
      `${API_BASE_URL}/api/assets/${assetId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }),
      },
      parentId ? "Balasan berhasil dikirim" : "Komentar berhasil dikirim",
    );
    if (completed) setReplyingTo(null);
    return completed;
  };

  const handleReply = async (commentId, content) => {
    if (content === undefined) {
      setEditingId(null);
      setReplyingTo(commentId);
      return false;
    }
    return createComment(content, commentId);
  };

  const handleEdit = async (commentId, content) => {
    if (content === undefined) {
      setReplyingTo(null);
      setEditingId(commentId);
      return false;
    }
    const completed = await request(
      `${API_BASE_URL}/api/assets/${assetId}/comments/${commentId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ content }) },
      "Komentar berhasil diubah",
    );
    if (completed) setEditingId(null);
    return completed;
  };

  const handleDelete = async (commentId, moderation = false) => {
    if (!window.confirm(`${moderation ? "Sembunyikan" : "Hapus"} komentar ini? Balasan yang ada akan tetap ditampilkan.`)) return;
    await request(
      moderation ? `${API_BASE_URL}/api/assets/admin/${assetId}/comments/${commentId}` : `${API_BASE_URL}/api/assets/${assetId}/comments/${commentId}`,
      { method: "DELETE", headers: authHeaders() },
      moderation ? "Komentar berhasil disembunyikan" : "Komentar berhasil dihapus",
    );
  };

  return (
    <section className="mt-10" aria-labelledby="comments-heading">
      <Card className="overflow-hidden" title={<span id="comments-heading" className="flex items-center gap-2"><MessageCircle size={20} /> Diskusi ({totalItems})</span>} description="Bagikan pengalaman, pertanyaan, atau praktik baik terkait pengetahuan ini.">
        <div className="px-4 pb-5 md:px-6">
          {canWriteComment ? (
            <CommentComposer label="Tambahkan komentar" busy={Boolean(actionId)} onSubmit={(content) => createComment(content)} />
          ) : (
            <div className="mt-4 rounded-lg bg-surface-secondary p-4 text-sm text-content-secondary">
              {user ? "Akun ini memiliki akses baca untuk diskusi." : <>Ingin ikut berdiskusi? <Link className="font-semibold text-content-guide" to="/login">Masuk</Link> untuk menulis komentar atau membalas diskusi.</>}
            </div>
          )}

          {error && <div className="mt-5"><Alert variant="danger" message={error} /></div>}
          {loading ? (
            <div className="mt-6 space-y-4"><Skeleton height="112px" rounded="lg" /><Skeleton height="96px" rounded="lg" /></div>
          ) : comments.length ? (
            <ol className="mt-6 list-none space-y-4 p-0">
              {comments.map((comment) => (
                <CommentNode
                  key={comment.id}
                  comment={comment}
                  depth={0}
                  user={user}
                  canWriteComment={canWriteComment}
                  actionId={actionId}
                  replyingTo={replyingTo}
                  editingId={editingId}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onCancelReply={() => setReplyingTo(null)}
                  onCancelEdit={() => setEditingId(null)}
                  canModerate={canModerate}
                />
              ))}
            </ol>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-stroke-primary px-5 py-8 text-center text-sm text-content-secondary">Belum ada komentar. Jadilah yang pertama memulai diskusi.</div>
          )}
        </div>
      </Card>
    </section>
  );
}
