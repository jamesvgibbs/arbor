/**
 * ClaudeCodeAdapterLive - Scoped live implementation for the Claude Code provider adapter.
 *
 * Wraps `ClaudeCodeProcessManager` behind the `ClaudeCodeAdapter` service contract and
 * maps manager failures into the shared `ProviderAdapterError` algebra.
 *
 * @module ClaudeCodeAdapterLive
 */
import {
  type ProviderEvent,
  type ProviderRuntimeEvent,
  type ProviderUserInputAnswers,
  RuntimeItemId,
  RuntimeRequestId,
  ProviderItemId,
  ThreadId,
  TurnId,
  EventId,
} from "@arbortools/contracts";
import { Effect, Layer, Queue, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { ClaudeCodeAdapter, type ClaudeCodeAdapterShape } from "../Services/ClaudeCodeAdapter.ts";
import { ClaudeCodeProcessManager } from "../../claudeCodeProcessManager.ts";
import { type EventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = "claudeCode" as const;

export interface ClaudeCodeAdapterLiveOptions {
  readonly manager?: ClaudeCodeProcessManager;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

function toRequestError(threadId: ThreadId, method: string, cause: unknown): ProviderAdapterError {
  const normalized = toMessage(cause, "").toLowerCase();
  if (normalized.includes("unknown session")) {
    return new ProviderAdapterSessionNotFoundError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: toMessage(cause, `${method} failed`),
    cause,
  });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function runtimeEventBase(
  event: ProviderEvent,
  canonicalThreadId: ThreadId,
): Omit<ProviderRuntimeEvent, "type" | "payload"> {
  return {
    eventId: event.id,
    provider: event.provider,
    threadId: canonicalThreadId,
    createdAt: event.createdAt,
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.itemId ? { itemId: RuntimeItemId.makeUnsafe(event.itemId) } : {}),
    raw: {
      source: "claudeCode.stream-json",
      method: event.method,
      payload: event.payload ?? {},
    },
  };
}

function mapClaudeCodeToRuntimeEvents(
  event: ProviderEvent,
  canonicalThreadId: ThreadId,
): ReadonlyArray<ProviderRuntimeEvent> {
  const payload = asObject(event.payload);

  if (event.kind === "error") {
    if (!event.message) return [];
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "runtime.error",
        payload: {
          message: event.message,
          class: "provider_error",
          ...(event.payload !== undefined ? { detail: event.payload } : {}),
        },
      },
    ];
  }

  if (event.method === "session/connecting") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "session.state.changed",
        payload: {
          state: "starting",
          ...(event.message ? { reason: event.message } : {}),
        },
      },
    ];
  }

  if (event.method === "session/ready") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "session.started",
        payload: {
          ...(event.message ? { message: event.message } : {}),
        },
      },
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "session.state.changed",
        payload: {
          state: "ready",
          ...(event.message ? { reason: event.message } : {}),
        },
      },
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "thread.started",
        payload: {
          providerThreadId: canonicalThreadId,
        },
      },
    ];
  }

  if (event.method === "item/agentMessage/delta") {
    const delta = event.textDelta ?? asString(payload?.delta);
    if (!delta || delta.length === 0) return [];
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "content.delta",
        payload: {
          streamKind: "assistant_text",
          delta,
        },
      },
    ];
  }

  if (event.method === "item/tool/started") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "item.started",
        payload: {
          itemType: "command_execution",
          status: "inProgress",
          ...(event.message ? { title: event.message } : {}),
          ...(event.payload !== undefined ? { data: event.payload } : {}),
        },
      },
    ];
  }

  if (event.method === "turn/completed") {
    const turnPayload = asObject(event.payload);
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "turn.completed",
        payload: {
          state: asString(turnPayload?.status) === "failed" ? "failed" : "completed",
          ...(asNumber(turnPayload?.totalCostUsd) !== undefined
            ? { totalCostUsd: asNumber(turnPayload?.totalCostUsd) }
            : {}),
          ...(turnPayload?.usage !== undefined ? { usage: turnPayload.usage } : {}),
          ...(asObject(turnPayload?.modelUsage)
            ? { modelUsage: asObject(turnPayload?.modelUsage) }
            : {}),
        },
      },
    ];
  }

  if (event.method === "turn/failed") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "runtime.error",
        payload: {
          message: event.message ?? "Turn failed",
          class: "provider_error",
          ...(event.payload !== undefined ? { detail: event.payload } : {}),
        },
      },
    ];
  }

  if (event.method === "account/rateLimits/updated") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "account.rate-limits.updated",
        payload: {
          rateLimits: event.payload ?? {},
        },
      },
    ];
  }

  if (event.method === "session/processExited" || event.method === "session/processError") {
    return [
      {
        ...runtimeEventBase(event, canonicalThreadId),
        type: "session.exited",
        payload: {
          ...(event.message ? { reason: event.message } : {}),
          exitKind: event.method === "session/processError" ? "error" : "graceful",
        },
      },
    ];
  }

  return [];
}

const makeClaudeCodeAdapter = (options?: ClaudeCodeAdapterLiveOptions) =>
  Effect.gen(function* () {
    const nativeEventLogger = options?.nativeEventLogger;

    const manager = yield* Effect.acquireRelease(
      Effect.sync(() => options?.manager ?? new ClaudeCodeProcessManager()),
      (manager) =>
        Effect.sync(() => {
          try {
            manager.stopAll();
          } catch {
            // Finalizers should never fail
          }
        }),
    );

    const startSession: ClaudeCodeAdapterShape["startSession"] = (input) => {
      if (input.provider !== undefined && input.provider !== PROVIDER) {
        return Effect.fail(
          new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
          }),
        );
      }

      return Effect.tryPromise({
        try: () =>
          manager.startSession({
            threadId: input.threadId,
            ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.providerOptions?.claudeCode
              ? {
                  providerOptions: {
                    claudeCode: input.providerOptions.claudeCode,
                  },
                }
              : {}),
            runtimeMode: input.runtimeMode,
          }),
        catch: (cause) =>
          new ProviderAdapterProcessError({
            provider: PROVIDER,
            threadId: input.threadId,
            detail: toMessage(cause, "Failed to start Claude Code adapter session."),
            cause,
          }),
      });
    };

    const sendTurn: ClaudeCodeAdapterShape["sendTurn"] = (input) =>
      Effect.tryPromise({
        try: () =>
          manager.sendTurn({
            threadId: input.threadId,
            ...(input.input !== undefined ? { input: input.input } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
          }),
        catch: (cause) => toRequestError(input.threadId, "turn/start", cause),
      }).pipe(
        Effect.map((result) => ({
          ...result,
          threadId: input.threadId,
        })),
      );

    const interruptTurn: ClaudeCodeAdapterShape["interruptTurn"] = (threadId) =>
      Effect.tryPromise({
        try: () => manager.interruptTurn(threadId),
        catch: (cause) => toRequestError(threadId, "turn/interrupt", cause),
      });

    const readThread: ClaudeCodeAdapterShape["readThread"] = (threadId) =>
      Effect.try({
        try: () => {
          const snapshot = manager.readThread(threadId);
          return { threadId, turns: snapshot.turns };
        },
        catch: (cause) => toRequestError(threadId, "thread/read", cause),
      });

    const rollbackThread: ClaudeCodeAdapterShape["rollbackThread"] = (threadId, numTurns) => {
      if (!Number.isInteger(numTurns) || numTurns < 1) {
        return Effect.fail(
          new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be an integer >= 1.",
          }),
        );
      }
      return Effect.try({
        try: () => {
          const snapshot = manager.rollbackThread(threadId, numTurns);
          return { threadId, turns: snapshot.turns };
        },
        catch: (cause) => toRequestError(threadId, "thread/rollback", cause),
      });
    };

    const respondToRequest: ClaudeCodeAdapterShape["respondToRequest"] = (
      _threadId,
      _requestId,
      _decision,
    ) => Effect.void;

    const respondToUserInput: ClaudeCodeAdapterShape["respondToUserInput"] = (
      _threadId,
      _requestId,
      _answers,
    ) => Effect.void;

    const stopSession: ClaudeCodeAdapterShape["stopSession"] = (threadId) =>
      Effect.tryPromise({
        try: () => manager.stopSession(threadId),
        catch: () => toRequestError(threadId, "stopSession", new Error("Failed to stop session")),
      });

    const listSessions: ClaudeCodeAdapterShape["listSessions"] = () =>
      Effect.sync(() => manager.listSessions());

    const hasSession: ClaudeCodeAdapterShape["hasSession"] = (threadId) =>
      Effect.sync(() => manager.hasSession(threadId));

    const stopAll: ClaudeCodeAdapterShape["stopAll"] = () =>
      Effect.tryPromise({
        try: () => manager.stopAll(),
        catch: () =>
          new ProviderAdapterProcessError({
            provider: PROVIDER,
            threadId: ThreadId.makeUnsafe("all"),
            detail: "Failed to stop all Claude Code sessions.",
          }),
      });

    const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();

    yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const services = yield* Effect.services<never>();
        const listener = (event: ProviderEvent) =>
          Effect.gen(function* () {
            if (nativeEventLogger) {
              yield* nativeEventLogger.write(event, event.threadId);
            }
            const runtimeEvents = mapClaudeCodeToRuntimeEvents(event, event.threadId);
            if (runtimeEvents.length === 0) {
              yield* Effect.logDebug("ignoring unhandled Claude Code provider event", {
                method: event.method,
                threadId: event.threadId,
                turnId: event.turnId,
              });
              return;
            }
            yield* Queue.offerAll(runtimeEventQueue, runtimeEvents);
          }).pipe(Effect.runPromiseWith(services));
        manager.on("event", listener);
        return listener;
      }),
      (listener) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            manager.off("event", listener);
          });
          yield* Queue.shutdown(runtimeEventQueue);
        }),
    );

    return {
      provider: PROVIDER,
      capabilities: {
        sessionModelSwitch: "restart-session",
      },
      startSession,
      sendTurn,
      interruptTurn,
      readThread,
      rollbackThread,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      stopAll,
      streamEvents: Stream.fromQueue(runtimeEventQueue),
    } satisfies ClaudeCodeAdapterShape;
  });

export const ClaudeCodeAdapterLive = Layer.effect(ClaudeCodeAdapter, makeClaudeCodeAdapter());

export function makeClaudeCodeAdapterLive(options?: ClaudeCodeAdapterLiveOptions) {
  return Layer.effect(ClaudeCodeAdapter, makeClaudeCodeAdapter(options));
}
