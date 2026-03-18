import type { GitHubPRReviewComment } from "@arbortools/contracts";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function GitHubCommentDisplay({
  comment,
  replies,
}: {
  comment: GitHubPRReviewComment;
  replies?: readonly GitHubPRReviewComment[] | undefined;
}) {
  const allComments = [comment, ...(replies ?? [])];

  return (
    <div className="border-t border-b border-emerald-500/20 bg-emerald-500/5">
      {allComments.map((c) => (
        <div key={c.id} className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <img
              src={c.authorAvatarUrl}
              alt={c.author}
              className="size-4 rounded-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="text-[11px] font-medium text-foreground">{c.author}</span>
            <span className="text-[10px] text-muted-foreground/50">
              {formatRelativeTime(c.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/90">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
