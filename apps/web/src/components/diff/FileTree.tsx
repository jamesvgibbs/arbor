import type { PRChangedFile } from "@arbortools/contracts";
import { FileIcon, FilePlusIcon, FileMinusIcon, FileEditIcon, ArrowRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";

function statusIcon(status: PRChangedFile["status"]) {
  switch (status) {
    case "added":
      return <FilePlusIcon className="size-3.5 shrink-0 text-green-500" />;
    case "removed":
      return <FileMinusIcon className="size-3.5 shrink-0 text-red-500" />;
    case "renamed":
      return <ArrowRightIcon className="size-3.5 shrink-0 text-blue-400" />;
    case "modified":
    case "changed":
      return <FileEditIcon className="size-3.5 shrink-0 text-yellow-500" />;
    default:
      return <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}

function shortenPath(filename: string): string {
  const parts = filename.split("/");
  if (parts.length <= 2) return filename;
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}

interface FileTreeProps {
  files: readonly PRChangedFile[];
  selectedFile: string | null;
  onSelectFile: (filename: string) => void;
  totalAdditions: number;
  totalDeletions: number;
}

export function FileTree({
  files,
  selectedFile,
  onSelectFile,
  totalAdditions,
  totalDeletions,
}: FileTreeProps) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <p className="text-[11px] font-medium text-foreground">Changed Files</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.map((file) => (
          <button
            key={file.filename}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
              selectedFile === file.filename
                ? "bg-accent text-accent-foreground"
                : "text-foreground/80 hover:bg-accent/50",
            )}
            onClick={() => onSelectFile(file.filename)}
            title={file.filename}
          >
            {statusIcon(file.status)}
            <span className="min-w-0 flex-1 truncate text-[11px]">
              {shortenPath(file.filename)}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {file.additions > 0 && <span className="text-green-500">+{file.additions}</span>}
              {file.additions > 0 && file.deletions > 0 && " "}
              {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
            </span>
          </button>
        ))}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
          {totalAdditions > 0 && (
            <>
              , <span className="text-green-500">+{totalAdditions}</span>
            </>
          )}
          {totalDeletions > 0 && (
            <>
              , <span className="text-red-500">-{totalDeletions}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
