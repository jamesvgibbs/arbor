import { useQuery, useQueryClient } from "@tanstack/react-query";
import { healthCheckQueryOptions } from "../lib/worktreeReactQuery";
import {
  githubStartAuthMutationOptions,
  githubPollAuthMutationOptions,
} from "../lib/githubReactQuery";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { HealthCheckResult } from "@arbortools/contracts";

type CheckStatus = "ok" | "missing" | "not_configured" | "invalid";

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === "ok") {
    return <span className="inline-block size-2 rounded-full bg-green-500" />;
  }
  if (status === "not_configured") {
    return <span className="inline-block size-2 rounded-full bg-yellow-500" />;
  }
  return <span className="inline-block size-2 rounded-full bg-red-500" />;
}

function FixLink({
  check,
  onAuthClick,
}: {
  check: keyof HealthCheckResult;
  onAuthClick: () => void;
}) {
  switch (check) {
    case "git":
      return (
        <a
          href="https://git-scm.com/downloads"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary hover:underline"
        >
          Fix this
        </a>
      );
    case "claudeCode":
      return (
        <a
          href="https://docs.anthropic.com/en/docs/claude-code/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary hover:underline"
        >
          Fix this
        </a>
      );
    case "github":
      return (
        <button
          type="button"
          onClick={onAuthClick}
          className="text-[10px] text-primary hover:underline"
        >
          Fix this
        </button>
      );
    case "ide":
      return (
        <span className="text-[10px] text-muted-foreground">
          Set in Settings
        </span>
      );
    default:
      return null;
  }
}

export function HealthCheckStrip() {
  const queryClient = useQueryClient();
  const healthQuery = useQuery(healthCheckQueryOptions());
  const startAuthMutation = useMutation(githubStartAuthMutationOptions({ queryClient }));
  const pollAuthMutation = useMutation(githubPollAuthMutationOptions({ queryClient }));
  const pollingRef = useRef(false);

  const handleAuthClick = useCallback(() => {
    startAuthMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (
          !pollingRef.current &&
          data.status === "device_flow_started" &&
          data.deviceFlow
        ) {
          pollingRef.current = true;
          pollAuthMutation.mutate(
            {
              deviceCode: data.deviceFlow.deviceCode,
              interval: data.deviceFlow.interval,
            },
            {
              onSettled: () => {
                pollingRef.current = false;
              },
            },
          );
        }
      },
    });
  }, [startAuthMutation, pollAuthMutation]);

  if (!healthQuery.data) return null;

  const data = healthQuery.data;
  const checks = [
    { key: "git" as const, label: "Git", status: data.git.status, detail: data.git.version },
    { key: "claudeCode" as const, label: "Claude Code", status: data.claudeCode.status, detail: data.claudeCode.version },
    { key: "github" as const, label: "GitHub", status: data.github.status, detail: data.github.username },
    { key: "ide" as const, label: "IDE", status: data.ide.status, detail: data.ide.name },
  ];

  const allOk = checks.every((c) => c.status === "ok");

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-card px-3">
      {checks.map((check) => (
        <div key={check.key} className="flex items-center gap-1.5">
          <StatusDot status={check.status} />
          <span className="text-[10px] text-muted-foreground">
            {check.label}
            {check.status === "ok" && check.detail ? `: ${check.detail}` : ""}
          </span>
          {check.status !== "ok" && check.status !== "not_configured" && (
            <FixLink check={check.key} onAuthClick={handleAuthClick} />
          )}
          {check.key === "ide" && check.status === "not_configured" && (
            <FixLink check={check.key} onAuthClick={handleAuthClick} />
          )}
        </div>
      ))}
    </div>
  );
}
