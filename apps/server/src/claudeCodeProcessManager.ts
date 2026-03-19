import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import readline from "node:readline";

import {
  EventId,
  ThreadId,
  TurnId,
  type ProviderEvent,
  type ProviderSession,
  type RuntimeMode,
} from "@arbortools/contracts";
import { normalizeModelSlug } from "@arbortools/shared/model";

export interface ClaudeCodeStartSessionInput {
  readonly threadId: ThreadId;
  readonly cwd?: string;
  readonly model?: string;
  readonly providerOptions?: {
    readonly claudeCode?: { readonly binaryPath?: string | undefined };
  };
  readonly runtimeMode: RuntimeMode;
}

export interface ClaudeCodeSendTurnInput {
  readonly threadId: ThreadId;
  readonly input?: string;
  readonly model?: string;
}

interface ClaudeCodeSessionContext {
  session: ProviderSession;
  child: ChildProcessWithoutNullStreams | null;
  output: readline.Interface | null;
  currentTurnId: TurnId | null;
  claudeSessionId: string | null;
  stopping: boolean;
  cwd: string;
  model: string | undefined;
  binaryPath: string;
  runtimeMode: RuntimeMode;
}

export interface ClaudeCodeThreadTurnSnapshot {
  id: TurnId;
  items: unknown[];
}

export interface ClaudeCodeThreadSnapshot {
  threadId: string;
  turns: ClaudeCodeThreadTurnSnapshot[];
}

export interface ClaudeCodeProcessManagerEvents {
  event: [event: ProviderEvent];
}

function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fallback
    }
  }
  child.kill();
}

export class ClaudeCodeProcessManager extends EventEmitter<ClaudeCodeProcessManagerEvents> {
  private readonly sessions = new Map<ThreadId, ClaudeCodeSessionContext>();

  private emitEvent(event: ProviderEvent): void {
    this.emit("event", event);
  }

  private emitLifecycleEvent(
    context: ClaudeCodeSessionContext,
    method: string,
    message: string,
  ): void {
    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "session",
      provider: "claudeCode",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method,
      message,
    });
  }

  private emitErrorEvent(context: ClaudeCodeSessionContext, method: string, message: string): void {
    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "error",
      provider: "claudeCode",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method,
      message,
    });
  }

  private updateSession(context: ClaudeCodeSessionContext, patch: Partial<ProviderSession>): void {
    Object.assign(context.session, patch, { updatedAt: new Date().toISOString() });
  }

  private requireSession(threadId: ThreadId): ClaudeCodeSessionContext {
    const context = this.sessions.get(threadId);
    if (!context) {
      throw new Error(`Unknown session for thread ${threadId}`);
    }
    return context;
  }

  async startSession(input: ClaudeCodeStartSessionInput): Promise<ProviderSession> {
    const threadId = input.threadId;
    const now = new Date().toISOString();
    const resolvedCwd = input.cwd ?? process.cwd();
    const binaryPath = input.providerOptions?.claudeCode?.binaryPath ?? "claude";
    const model = normalizeModelSlug(input.model, "claudeCode") ?? undefined;

    const session: ProviderSession = {
      provider: "claudeCode",
      status: "connecting",
      runtimeMode: input.runtimeMode,
      model,
      cwd: resolvedCwd,
      threadId,
      createdAt: now,
      updatedAt: now,
    };

    const claudeSessionId = randomUUID();
    const context: ClaudeCodeSessionContext = {
      session,
      child: null,
      output: null,
      currentTurnId: null,
      claudeSessionId,
      stopping: false,
      cwd: resolvedCwd,
      model,
      binaryPath,
      runtimeMode: input.runtimeMode,
    };

    this.sessions.set(threadId, context);
    this.emitLifecycleEvent(context, "session/connecting", "Starting Claude Code session");

    this.updateSession(context, { status: "ready" });
    this.emitLifecycleEvent(
      context,
      "session/ready",
      `Claude Code session ready (${claudeSessionId})`,
    );

    return { ...context.session };
  }

  async sendTurn(input: ClaudeCodeSendTurnInput): Promise<{ threadId: ThreadId; turnId: TurnId }> {
    const context = this.requireSession(input.threadId);
    if (!input.input) {
      throw new Error("Turn input must include text.");
    }

    const turnId = TurnId.makeUnsafe(randomUUID());
    context.currentTurnId = turnId;
    const model = normalizeModelSlug(input.model, "claudeCode") ?? context.model;

    this.updateSession(context, { status: "running", activeTurnId: turnId });

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      context.claudeSessionId!,
    ];

    if (model) {
      args.push("--model", model);
    }

    if (context.runtimeMode === "full-access") {
      args.push("--dangerously-skip-permissions");
    }

    const child = spawn(context.binaryPath, args, {
      cwd: context.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    context.child = child;
    const output = readline.createInterface({ input: child.stdout });
    context.output = output;

    child.stdin.write(input.input);
    child.stdin.end();

    this.attachProcessListeners(context, turnId);

    return { threadId: input.threadId, turnId };
  }

  private attachProcessListeners(context: ClaudeCodeSessionContext, turnId: TurnId): void {
    const { child, output } = context;
    if (!child || !output) return;

    const threadId = context.session.threadId;

    output.on("line", (line: string) => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        this.handleStreamJsonEvent(context, turnId, parsed);
      } catch {
        // Non-JSON line, ignore
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.log(`[claude-code stderr] ${text}`);
      }
    });

    child.on("close", (code: number | null) => {
      if (context.stopping) return;

      if (code !== 0 && code !== null) {
        this.updateSession(context, { status: "ready", activeTurnId: undefined });
        this.emitErrorEvent(
          context,
          "session/processExited",
          `Claude Code process exited with code ${code}`,
        );
      } else {
        this.updateSession(context, { status: "ready", activeTurnId: undefined });
      }
    });

    child.on("error", (error: Error) => {
      if (context.stopping) return;
      this.emitErrorEvent(context, "session/processError", error.message);
      this.updateSession(context, {
        status: "error",
        lastError: error.message,
      });
    });
  }

  private handleStreamJsonEvent(
    context: ClaudeCodeSessionContext,
    turnId: TurnId,
    parsed: Record<string, unknown>,
  ): void {
    const threadId = context.session.threadId;
    const type = parsed.type as string;

    switch (type) {
      case "system": {
        const subtype = parsed.subtype as string | undefined;
        if (subtype === "init") {
          this.emitEvent({
            id: EventId.makeUnsafe(randomUUID()),
            kind: "notification",
            provider: "claudeCode",
            threadId,
            turnId,
            createdAt: new Date().toISOString(),
            method: "session/ready",
            message: `Claude Code initialized (model: ${parsed.model ?? "unknown"})`,
            payload: parsed,
          });
        }
        break;
      }

      case "assistant": {
        const message = parsed.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const blockRecord = block as Record<string, unknown>;
            if (blockRecord.type === "text" && typeof blockRecord.text === "string") {
              this.emitEvent({
                id: EventId.makeUnsafe(randomUUID()),
                kind: "notification",
                provider: "claudeCode",
                threadId,
                turnId,
                createdAt: new Date().toISOString(),
                method: "item/agentMessage/delta",
                textDelta: blockRecord.text,
                payload: parsed,
              });
            } else if (blockRecord.type === "tool_use") {
              this.emitEvent({
                id: EventId.makeUnsafe(randomUUID()),
                kind: "notification",
                provider: "claudeCode",
                threadId,
                turnId,
                createdAt: new Date().toISOString(),
                method: "item/tool/started",
                message: `Tool: ${blockRecord.name ?? "unknown"}`,
                payload: parsed,
              });
            }
          }
        }
        break;
      }

      case "result": {
        const subtype = parsed.subtype as string | undefined;
        if (subtype === "success") {
          this.emitEvent({
            id: EventId.makeUnsafe(randomUUID()),
            kind: "notification",
            provider: "claudeCode",
            threadId,
            turnId,
            createdAt: new Date().toISOString(),
            method: "turn/completed",
            message: "Turn completed",
            payload: {
              status: "completed",
              result: parsed.result,
              totalCostUsd: parsed.total_cost_usd,
              usage: parsed.usage,
              modelUsage: parsed.modelUsage,
              durationMs: parsed.duration_ms,
            },
          });
        } else {
          this.emitEvent({
            id: EventId.makeUnsafe(randomUUID()),
            kind: "error",
            provider: "claudeCode",
            threadId,
            turnId,
            createdAt: new Date().toISOString(),
            method: "turn/failed",
            message: typeof parsed.error === "string" ? parsed.error : "Turn failed",
            payload: parsed,
          });
        }
        break;
      }

      case "rate_limit_event": {
        this.emitEvent({
          id: EventId.makeUnsafe(randomUUID()),
          kind: "notification",
          provider: "claudeCode",
          threadId,
          turnId,
          createdAt: new Date().toISOString(),
          method: "account/rateLimits/updated",
          payload: parsed.rate_limit_info ?? parsed,
        });
        break;
      }

      default: {
        // Forward unknown event types as generic notifications
        this.emitEvent({
          id: EventId.makeUnsafe(randomUUID()),
          kind: "notification",
          provider: "claudeCode",
          threadId,
          turnId,
          createdAt: new Date().toISOString(),
          method: `claudeCode/${type}`,
          payload: parsed,
        });
        break;
      }
    }
  }

  async interruptTurn(threadId: ThreadId): Promise<void> {
    const context = this.requireSession(threadId);
    if (context.child) {
      context.child.kill("SIGINT");
    }
  }

  async stopSession(threadId: ThreadId): Promise<void> {
    const context = this.sessions.get(threadId);
    if (!context) return;

    context.stopping = true;
    if (context.child) {
      killChildTree(context.child);
      context.child = null;
    }
    if (context.output) {
      context.output.close();
      context.output = null;
    }
    this.updateSession(context, { status: "closed" });
    this.sessions.delete(threadId);
  }

  async stopAll(): Promise<void> {
    for (const threadId of [...this.sessions.keys()]) {
      await this.stopSession(threadId);
    }
  }

  hasSession(threadId: ThreadId): boolean {
    return this.sessions.has(threadId);
  }

  listSessions(): ProviderSession[] {
    return [...this.sessions.values()].map((context) => ({ ...context.session }));
  }

  readThread(threadId: ThreadId): ClaudeCodeThreadSnapshot {
    this.requireSession(threadId);
    return { threadId, turns: [] };
  }

  rollbackThread(threadId: ThreadId, _numTurns: number): ClaudeCodeThreadSnapshot {
    this.requireSession(threadId);
    return { threadId, turns: [] };
  }
}
