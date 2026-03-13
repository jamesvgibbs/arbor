import { Schema, Struct } from "effect";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

import {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  ORCHESTRATION_WS_CHANNELS,
  OrchestrationGetFullThreadDiffInput,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotInput,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsInput,
} from "./orchestration";
import {
  GitCheckoutInput,
  GitCreateBranchInput,
  GitPreparePullRequestThreadInput,
  GitCreateWorktreeInput,
  GitInitInput,
  GitListBranchesInput,
  GitPullInput,
  GitPullRequestRefInput,
  GitRemoveWorktreeInput,
  GitRunStackedActionInput,
  GitStatusInput,
} from "./git";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalWriteInput,
} from "./terminal";
import { KeybindingRule } from "./keybindings";
import { ProjectSearchEntriesInput, ProjectWriteFileInput } from "./project";
import { OpenInEditorInput } from "./editor";
import { ServerConfigUpdatedPayload } from "./server";
import {
  GITHUB_WS_METHODS,
  GitHubPollAuthInput,
  GitHubAddRepoInput,
  GitHubRemoveRepoInput,
  GitHubPRListInput,
  GitHubPRDetailsInput,
  GitHubRefreshInput,
} from "./github";
import {
  WORKTREE_WS_METHODS,
  WorktreeCreateInput as WorktreeCreateInputSchema,
  WorktreeRemoveInput as WorktreeRemoveInputSchema,
  WorktreeGetDiskSizeInput as WorktreeGetDiskSizeInputSchema,
  WorktreeUpdateSettingsInput as WorktreeUpdateSettingsInputSchema,
  WorktreeCheckLifecycleInput as WorktreeCheckLifecycleInputSchema,
  IDEUpdateSettingsInput as IDEUpdateSettingsInputSchema,
  WorktreeOpenInIDEInput as WorktreeOpenInIDEInputSchema,
} from "./worktree";
import {
  REVIEW_CONTEXT_WS_METHODS,
  ReviewContextDetectInput as ReviewContextDetectInputSchema,
  ReviewContextInitInput as ReviewContextInitInputSchema,
} from "./reviewContext";

// ── WebSocket RPC Method Names ───────────────────────────────────────

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Git methods
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitInit: "git.init",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverUpsertKeybinding: "server.upsertKeybinding",
} as const;

// ── Push Event Channels ──────────────────────────────────────────────

export const WS_CHANNELS = {
  terminalEvent: "terminal.event",
  serverWelcome: "server.welcome",
  serverConfigUpdated: "server.configUpdated",
} as const;

// -- Tagged Union of all request body schemas ─────────────────────────

const tagRequestBody = <const Tag extends string, const Fields extends Schema.Struct.Fields>(
  tag: Tag,
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    Struct.assign({ _tag: Schema.tag(tag) }),
    // PreserveChecks is safe here. No existing schema should have checks depending on the tag
    { unsafePreserveChecks: true },
  );

const WebSocketRequestBody = Schema.Union([
  // Orchestration methods
  tagRequestBody(
    ORCHESTRATION_WS_METHODS.dispatchCommand,
    Schema.Struct({ command: ClientOrchestrationCommand }),
  ),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getSnapshot, OrchestrationGetSnapshotInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnDiff, OrchestrationGetTurnDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getFullThreadDiff, OrchestrationGetFullThreadDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.replayEvents, OrchestrationReplayEventsInput),

  // Project Search
  tagRequestBody(WS_METHODS.projectsSearchEntries, ProjectSearchEntriesInput),
  tagRequestBody(WS_METHODS.projectsWriteFile, ProjectWriteFileInput),

  // Shell methods
  tagRequestBody(WS_METHODS.shellOpenInEditor, OpenInEditorInput),

  // Git methods
  tagRequestBody(WS_METHODS.gitPull, GitPullInput),
  tagRequestBody(WS_METHODS.gitStatus, GitStatusInput),
  tagRequestBody(WS_METHODS.gitRunStackedAction, GitRunStackedActionInput),
  tagRequestBody(WS_METHODS.gitListBranches, GitListBranchesInput),
  tagRequestBody(WS_METHODS.gitCreateWorktree, GitCreateWorktreeInput),
  tagRequestBody(WS_METHODS.gitRemoveWorktree, GitRemoveWorktreeInput),
  tagRequestBody(WS_METHODS.gitCreateBranch, GitCreateBranchInput),
  tagRequestBody(WS_METHODS.gitCheckout, GitCheckoutInput),
  tagRequestBody(WS_METHODS.gitInit, GitInitInput),
  tagRequestBody(WS_METHODS.gitResolvePullRequest, GitPullRequestRefInput),
  tagRequestBody(WS_METHODS.gitPreparePullRequestThread, GitPreparePullRequestThreadInput),

  // Terminal methods
  tagRequestBody(WS_METHODS.terminalOpen, TerminalOpenInput),
  tagRequestBody(WS_METHODS.terminalWrite, TerminalWriteInput),
  tagRequestBody(WS_METHODS.terminalResize, TerminalResizeInput),
  tagRequestBody(WS_METHODS.terminalClear, TerminalClearInput),
  tagRequestBody(WS_METHODS.terminalRestart, TerminalRestartInput),
  tagRequestBody(WS_METHODS.terminalClose, TerminalCloseInput),

  // GitHub methods
  tagRequestBody(GITHUB_WS_METHODS.getAuthStatus, Schema.Struct({})),
  tagRequestBody(GITHUB_WS_METHODS.startAuth, Schema.Struct({})),
  tagRequestBody(GITHUB_WS_METHODS.pollAuth, GitHubPollAuthInput),
  tagRequestBody(GITHUB_WS_METHODS.logout, Schema.Struct({})),
  tagRequestBody(GITHUB_WS_METHODS.listRepos, Schema.Struct({})),
  tagRequestBody(GITHUB_WS_METHODS.addRepo, GitHubAddRepoInput),
  tagRequestBody(GITHUB_WS_METHODS.removeRepo, GitHubRemoveRepoInput),
  tagRequestBody(GITHUB_WS_METHODS.listPRs, GitHubPRListInput),
  tagRequestBody(GITHUB_WS_METHODS.getPRDetails, GitHubPRDetailsInput),
  tagRequestBody(GITHUB_WS_METHODS.refreshPRs, GitHubRefreshInput),

  // Worktree methods
  tagRequestBody(WORKTREE_WS_METHODS.create, WorktreeCreateInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.list, Schema.Struct({})),
  tagRequestBody(WORKTREE_WS_METHODS.remove, WorktreeRemoveInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.getDiskSize, WorktreeGetDiskSizeInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.getSettings, Schema.Struct({})),
  tagRequestBody(WORKTREE_WS_METHODS.updateSettings, WorktreeUpdateSettingsInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.checkLifecycle, WorktreeCheckLifecycleInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.detectIDEs, Schema.Struct({})),
  tagRequestBody(WORKTREE_WS_METHODS.getIDESettings, Schema.Struct({})),
  tagRequestBody(WORKTREE_WS_METHODS.updateIDESettings, IDEUpdateSettingsInputSchema),
  tagRequestBody(WORKTREE_WS_METHODS.openInIDE, WorktreeOpenInIDEInputSchema),

  // Review Context methods
  tagRequestBody(REVIEW_CONTEXT_WS_METHODS.detect, ReviewContextDetectInputSchema),
  tagRequestBody(REVIEW_CONTEXT_WS_METHODS.init, ReviewContextInitInputSchema),

  // Server meta
  tagRequestBody(WS_METHODS.serverGetConfig, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverUpsertKeybinding, KeybindingRule),
]);

export const WebSocketRequest = Schema.Struct({
  id: TrimmedNonEmptyString,
  body: WebSocketRequestBody,
});
export type WebSocketRequest = typeof WebSocketRequest.Type;

export const WebSocketResponse = Schema.Struct({
  id: TrimmedNonEmptyString,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
    }),
  ),
});
export type WebSocketResponse = typeof WebSocketResponse.Type;

export const WsPushSequence = NonNegativeInt;
export type WsPushSequence = typeof WsPushSequence.Type;

export const WsWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type WsWelcomePayload = typeof WsWelcomePayload.Type;

export interface WsPushPayloadByChannel {
  readonly [WS_CHANNELS.serverWelcome]: WsWelcomePayload;
  readonly [WS_CHANNELS.serverConfigUpdated]: typeof ServerConfigUpdatedPayload.Type;
  readonly [WS_CHANNELS.terminalEvent]: typeof TerminalEvent.Type;
  readonly [ORCHESTRATION_WS_CHANNELS.domainEvent]: OrchestrationEvent;
}

export type WsPushChannel = keyof WsPushPayloadByChannel;
export type WsPushData<C extends WsPushChannel> = WsPushPayloadByChannel[C];

const makeWsPushSchema = <const Channel extends string, Payload extends Schema.Schema<any>>(
  channel: Channel,
  payload: Payload,
) =>
  Schema.Struct({
    type: Schema.Literal("push"),
    sequence: WsPushSequence,
    channel: Schema.Literal(channel),
    data: payload,
  });

export const WsPushServerWelcome = makeWsPushSchema(WS_CHANNELS.serverWelcome, WsWelcomePayload);
export const WsPushServerConfigUpdated = makeWsPushSchema(
  WS_CHANNELS.serverConfigUpdated,
  ServerConfigUpdatedPayload,
);
export const WsPushTerminalEvent = makeWsPushSchema(WS_CHANNELS.terminalEvent, TerminalEvent);
export const WsPushOrchestrationDomainEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.domainEvent,
  OrchestrationEvent,
);

export const WsPushChannelSchema = Schema.Literals([
  WS_CHANNELS.serverWelcome,
  WS_CHANNELS.serverConfigUpdated,
  WS_CHANNELS.terminalEvent,
  ORCHESTRATION_WS_CHANNELS.domainEvent,
]);
export type WsPushChannelSchema = typeof WsPushChannelSchema.Type;

export const WsPush = Schema.Union([
  WsPushServerWelcome,
  WsPushServerConfigUpdated,
  WsPushTerminalEvent,
  WsPushOrchestrationDomainEvent,
]);
export type WsPush = typeof WsPush.Type;

export type WsPushMessage<C extends WsPushChannel> = Extract<WsPush, { channel: C }>;

export const WsPushEnvelopeBase = Schema.Struct({
  type: Schema.Literal("push"),
  sequence: WsPushSequence,
  channel: WsPushChannelSchema,
  data: Schema.Unknown,
});
export type WsPushEnvelopeBase = typeof WsPushEnvelopeBase.Type;

// ── Union of all server → client messages ─────────────────────────────

export const WsResponse = Schema.Union([WebSocketResponse, WsPush]);
export type WsResponse = typeof WsResponse.Type;
