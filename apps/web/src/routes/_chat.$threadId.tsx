import { ThreadId, type WorktreeSessionWithSize } from "@arbortools/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareIcon, GitPullRequestIcon } from "lucide-react";

import ChatView from "../components/ChatView";
import { PRDiffViewer } from "../components/diff/PRDiffViewer";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { worktreeListQueryOptions } from "../lib/worktreeReactQuery";
import { cn } from "~/lib/utils";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { inline: boolean }) => {
  if (props.inline) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-4 text-center text-xs text-muted-foreground/70">
        Loading diff viewer...
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[560px] shrink-0 items-center justify-center border-l border-border bg-card px-4 text-center text-xs text-muted-foreground/70">
      Loading diff viewer...
    </aside>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <Suspense fallback={<DiffLoadingFallback inline />}>
          <DiffPanel mode="sidebar" />
        </Suspense>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function SessionTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: "chat" | "prdiff";
  onTabChange: (tab: "chat" | "prdiff") => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      <button
        type="button"
        onClick={() => onTabChange("chat")}
        className={cn(
          "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
          activeTab === "chat"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <MessageSquareIcon className="size-3.5" />
        Chat
      </button>
      <button
        type="button"
        onClick={() => onTabChange("prdiff")}
        className={cn(
          "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
          activeTab === "prdiff"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <GitPullRequestIcon className="size-3.5" />
        Diff
      </button>
    </div>
  );
}

function ChatThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const activeThread = useStore((store) =>
    store.threads.find((thread) => thread.id === threadId),
  );
  const draftThread = useComposerDraftStore((store) =>
    store.draftThreadsByThreadId[threadId] ?? null,
  );
  const worktreePath = activeThread?.worktreePath ?? draftThread?.worktreePath ?? null;

  // Find the worktree session matching this thread
  const worktreeListQuery = useQuery({
    ...worktreeListQueryOptions(),
    // Ensure we have fresh data when a worktree thread is active
    enabled: worktreePath !== null,
  });
  const matchingSession: WorktreeSessionWithSize | null = useMemo(() => {
    if (!worktreePath || !worktreeListQuery.data) return null;
    return (
      worktreeListQuery.data.sessions.find(
        (s) => s.worktreePath === worktreePath,
      ) ?? null
    );
  }, [worktreePath, worktreeListQuery.data]);

  const hasSession = matchingSession !== null;

  // Tab state — kept as React state, not URL, to avoid interfering with diff search params
  const [activeTab, setActiveTab] = useState<"chat" | "prdiff">("chat");

  // Pending "Ask Claude" prompt to pre-fill when switching back to Chat
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const diffOpen = search.diff === "1";
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId]);

  const switchTab = useCallback(
    (tab: "chat" | "prdiff") => {
      setActiveTab(tab);
    },
    [],
  );

  const handleAskClaude = useCallback(
    (prompt: string) => {
      setPendingPrompt(prompt);
      setActiveTab("chat");
    },
    [],
  );

  // Clear pending prompt once we've switched to chat tab and it's been consumed
  useEffect(() => {
    if (activeTab === "chat" && pendingPrompt) {
      window.dispatchEvent(
        new CustomEvent("arbor:prefill-composer", {
          detail: { prompt: pendingPrompt },
        }),
      );
      setPendingPrompt(null);
    }
  }, [activeTab, pendingPrompt]);

  // Reset tab when switching threads
  useEffect(() => {
    setActiveTab("chat");
  }, [threadId]);

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [navigate, routeThreadExists, threadsHydrated, threadId]);

  if (!threadsHydrated || !routeThreadExists) {
    return null;
  }

  // PR Diff tab view (full screen, no turn diff sidebar)
  if (activeTab === "prdiff" && matchingSession) {
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <div className="flex h-full flex-col">
          <SessionTabBar activeTab={activeTab} onTabChange={switchTab} />
          <div className="min-h-0 flex-1">
            <PRDiffViewer session={matchingSession} onAskClaude={handleAskClaude} />
          </div>
        </div>
      </SidebarInset>
    );
  }

  // Chat tab view (with optional turn diff sidebar/sheet)
  const chatContent = (
    <div className="flex h-full flex-col">
      {hasSession && <SessionTabBar activeTab="chat" onTabChange={switchTab} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatView key={threadId} threadId={threadId} />
      </div>
    </div>
  );

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          {chatContent}
        </SidebarInset>
        <DiffPanelInlineSidebar diffOpen={diffOpen} onCloseDiff={closeDiff} onOpenDiff={openDiff} />
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        {chatContent}
      </SidebarInset>
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        <Suspense fallback={<DiffLoadingFallback inline={false} />}>
          <DiffPanel mode="sheet" />
        </Suspense>
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
