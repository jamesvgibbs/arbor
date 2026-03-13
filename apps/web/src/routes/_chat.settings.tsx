import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { type ProviderKind, type IDEKind } from "@arbortools/contracts";
import { getModelOptions, normalizeModelSlug } from "@arbortools/shared/model";
import {
  GitBranchIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExternalLinkIcon,
  UserIcon,
  AlertTriangleIcon,
  FolderOpenIcon,
  InfoIcon,
} from "lucide-react";
import { MAX_CUSTOM_MODEL_LENGTH, useAppSettings } from "../appSettings";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isElectron } from "../env";
import { useTheme } from "../hooks/useTheme";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import {
  githubAuthStatusQueryOptions,
  githubStartAuthMutationOptions,
  githubPollAuthMutationOptions,
  githubLogoutMutationOptions,
  githubReposQueryOptions,
  githubAddRepoMutationOptions,
  githubRemoveRepoMutationOptions,
} from "../lib/githubReactQuery";
import {
  ideSettingsQueryOptions,
  ideUpdateSettingsMutationOptions,
  arborSettingsQueryOptions,
  arborUpdateSettingsMutationOptions,
} from "../lib/worktreeReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { APP_VERSION } from "../branding";
import { SidebarInset } from "~/components/ui/sidebar";

const THEME_OPTIONS = [
  {
    value: "system",
    label: "System",
    description: "Match your OS appearance setting.",
  },
  {
    value: "light",
    label: "Light",
    description: "Always use the light theme.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark theme.",
  },
] as const;

const MODEL_PROVIDER_SETTINGS: Array<{
  provider: ProviderKind;
  title: string;
  description: string;
  placeholder: string;
  example: string;
}> = [
  {
    provider: "codex",
    title: "Codex",
    description: "Save additional Codex model slugs for the picker and `/model` command.",
    placeholder: "your-codex-model-slug",
    example: "gpt-6.7-codex-ultra-preview",
  },
] as const;

function getCustomModelsForProvider(
  settings: ReturnType<typeof useAppSettings>["settings"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
    default:
      return settings.customCodexModels;
  }
}

function getDefaultCustomModelsForProvider(
  defaults: ReturnType<typeof useAppSettings>["defaults"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
    default:
      return defaults.customCodexModels;
  }
}

function patchCustomModels(provider: ProviderKind, models: string[]) {
  switch (provider) {
    case "codex":
    default:
      return { customCodexModels: models };
  }
}

function GitHubSettingsSection() {
  const queryClient = useQueryClient();
  const authQuery = useQuery(githubAuthStatusQueryOptions());
  const reposQuery = useQuery(githubReposQueryOptions());

  const startAuthMutation = useMutation(githubStartAuthMutationOptions({ queryClient }));
  const pollAuthMutation = useMutation(githubPollAuthMutationOptions({ queryClient }));
  const logoutMutation = useMutation(githubLogoutMutationOptions({ queryClient }));
  const addRepoMutation = useMutation(githubAddRepoMutationOptions({ queryClient }));
  const removeRepoMutation = useMutation(githubRemoveRepoMutationOptions({ queryClient }));

  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const isAuthenticated = authQuery.data?.authenticated === true;
  const repos = reposQuery.data ?? [];

  const handleStartAuth = useCallback(() => {
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

  const handleAddRepo = useCallback(() => {
    const trimmed = repoInput.trim();
    if (!trimmed) {
      setRepoError("Enter a repository in owner/repo format.");
      return;
    }
    const parts = trimmed.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setRepoError("Invalid format. Use owner/repo (e.g. facebook/react).");
      return;
    }
    const [owner, repo] = parts;
    if (repos.some((r) => r.owner === owner && r.repo === repo)) {
      setRepoError("That repository is already added.");
      return;
    }
    setRepoError(null);
    addRepoMutation.mutate({ owner, repo });
    setRepoInput("");
  }, [repoInput, repos, addRepoMutation]);

  return (
    <>
      {/* GitHub Authentication */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-foreground">GitHub</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect your GitHub account to review pull requests.
          </p>
        </div>

        {authQuery.isLoading && (
          <div className="rounded-lg border border-border bg-background px-3 py-4 text-xs text-muted-foreground">
            Checking GitHub connection...
          </div>
        )}

        {isAuthenticated && authQuery.data && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-3">
              {authQuery.data.avatarUrl ? (
                <img
                  src={authQuery.data.avatarUrl}
                  alt={authQuery.data.username ?? "GitHub user"}
                  className="size-8 rounded-full"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <UserIcon className="size-4 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {authQuery.data.username ?? "Connected"}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircleIcon className="size-3 text-green-500" />
                  GitHub connected
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => logoutMutation.mutate(undefined)}
              disabled={logoutMutation.isPending}
            >
              Disconnect
            </Button>
          </div>
        )}

        {authQuery.isSuccess && !isAuthenticated && !startAuthMutation.data && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
              No GitHub account connected.
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleStartAuth}
              disabled={startAuthMutation.isPending}
            >
              <GitBranchIcon className="size-3.5" />
              {startAuthMutation.isPending ? "Starting..." : "Connect GitHub"}
            </Button>
          </div>
        )}

        {startAuthMutation.data &&
          startAuthMutation.data.status === "device_flow_started" &&
          !isAuthenticated && (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-4 text-center">
                <p className="mb-2 text-xs text-muted-foreground">
                  Enter this code on GitHub to authenticate:
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-foreground">
                  {startAuthMutation.data.deviceFlow.userCode}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <a
                  href={startAuthMutation.data.deviceFlow.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Open GitHub
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
              {pollAuthMutation.isPending && (
                <p className="text-center text-xs text-muted-foreground">
                  Waiting for authorization...
                </p>
              )}
              {pollAuthMutation.data?.error && (
                <p className="text-center text-xs text-destructive">
                  {pollAuthMutation.data.error}
                </p>
              )}
            </div>
          )}

        {startAuthMutation.isError && (
          <p className="mt-2 text-xs text-destructive">
            Failed to start authentication. Please try again.
          </p>
        )}
      </section>

      {/* Repositories */}
      {isAuthenticated && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-foreground">Repositories</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage GitHub repositories to track for pull requests.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <label htmlFor="github-repo-input" className="block flex-1 space-y-1">
                <span className="text-xs font-medium text-foreground">Add repository</span>
                <Input
                  id="github-repo-input"
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    if (repoError) setRepoError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    handleAddRepo();
                  }}
                  placeholder="owner/repo"
                  spellCheck={false}
                />
                <span className="text-xs text-muted-foreground">
                  Example: <code>facebook/react</code>
                </span>
              </label>

              <Button
                className="sm:mt-6"
                type="button"
                onClick={handleAddRepo}
                disabled={addRepoMutation.isPending}
              >
                Add repository
              </Button>
            </div>

            {repoError ? <p className="text-xs text-destructive">{repoError}</p> : null}

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Tracked repositories: {repos.length}
              </p>

              {repos.length > 0 ? (
                <div className="space-y-2">
                  {repos.map((r) => {
                    const slug = `${r.owner}/${r.repo}`;
                    return (
                      <div
                        key={slug}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {slug}
                          </code>
                        </div>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            removeRepoMutation.mutate({ owner: r.owner, repo: r.repo })
                          }
                          disabled={removeRepoMutation.isPending}
                          aria-label={`Remove ${slug}`}
                        >
                          <XCircleIcon className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                  No repositories tracked yet.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

const IDE_LABELS: Record<IDEKind, string> = {
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
};

function IDESettingsSection() {
  const queryClient = useQueryClient();
  const ideQuery = useQuery({
    ...ideSettingsQueryOptions(),
    refetchOnMount: "always", // Re-run detection when settings screen opens
  });
  const updateMutation = useMutation(ideUpdateSettingsMutationOptions({ queryClient }));

  const preferredIDE = ideQuery.data?.preferredIDE ?? null;
  const detected = ideQuery.data?.detectedIDEs;
  const detectedList: IDEKind[] = detected
    ? (Object.entries(detected) as [IDEKind, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  // Check if preferred IDE is set but no longer detected
  const preferredNotDetected =
    preferredIDE !== null && detected && !detected[preferredIDE];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Preferred IDE</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the IDE used to open worktrees. Only IDEs detected in your PATH are shown.
        </p>
      </div>

      {ideQuery.isLoading && (
        <div className="rounded-lg border border-border bg-background px-3 py-4 text-xs text-muted-foreground">
          Detecting installed IDEs...
        </div>
      )}

      {ideQuery.isSuccess && detectedList.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
          No supported IDEs detected in PATH. Install Cursor, Windsurf, or VS Code and ensure their CLI command is available.
        </div>
      )}

      {ideQuery.isSuccess && detectedList.length > 0 && (
        <div className="space-y-3">
          {preferredNotDetected && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
              <AlertTriangleIcon className="size-3.5 shrink-0" />
              {IDE_LABELS[preferredIDE!]} no longer detected in PATH
            </div>
          )}

          <select
            value={preferredIDE ?? ""}
            onChange={(e) => {
              const value = e.target.value || null;
              updateMutation.mutate({
                preferredIDE: value as IDEKind | null,
              });
            }}
            className="h-8 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 outline-none focus:border-ring focus:ring-2 focus:ring-ring/24"
          >
            <option value="">Not set</option>
            {detectedList.map((ide) => (
              <option key={ide} value={ide}>
                {IDE_LABELS[ide]}
              </option>
            ))}
          </select>

          <p className="text-xs text-muted-foreground">
            Detected: {detectedList.map((ide) => IDE_LABELS[ide]).join(", ")}
          </p>
        </div>
      )}
    </section>
  );
}

const REFRESH_INTERVAL_OPTIONS = [
  { value: 60_000, label: "1 minute" },
  { value: 300_000, label: "5 minutes" },
  { value: 900_000, label: "15 minutes" },
  { value: 0, label: "Manual only" },
] as const;

function WorktreeSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(arborSettingsQueryOptions());
  const updateMutation = useMutation(arborUpdateSettingsMutationOptions({ queryClient }));
  const [basePathNotice, setBasePathNotice] = useState(false);

  const basePath = settingsQuery.data?.basePath ?? "";
  const cleanupBehavior = settingsQuery.data?.cleanupBehavior ?? "prompt";

  const handlePickFolder = useCallback(async () => {
    const api = ensureNativeApi();
    const folder = await api.dialogs.pickFolder();
    if (folder) {
      updateMutation.mutate({ basePath: folder });
      setBasePathNotice(true);
    }
  }, [updateMutation]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Worktrees</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure where worktrees are created and cleanup behavior.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Base path</p>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                {basePath || "Loading..."}
              </code>
            </div>
            <Button size="sm" variant="outline" onClick={handlePickFolder}>
              Change
            </Button>
          </div>
          {basePathNotice && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <InfoIcon className="size-3 shrink-0" />
              New base path applies to future worktrees only.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <div>
            <p className="text-sm font-medium text-foreground">Prompt when closing a session</p>
            <p className="text-xs text-muted-foreground">
              When enabled, you'll be asked to confirm before cleaning up a worktree.
            </p>
          </div>
          <Switch
            checked={cleanupBehavior === "prompt"}
            onCheckedChange={(checked) =>
              updateMutation.mutate({
                cleanupBehavior: checked ? "prompt" : "manual",
              })
            }
            aria-label="Prompt when closing a session"
          />
        </div>
      </div>
    </section>
  );
}

function PRListSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(arborSettingsQueryOptions());
  const updateMutation = useMutation(arborUpdateSettingsMutationOptions({ queryClient }));

  const refreshIntervalMs = settingsQuery.data?.refreshIntervalMs ?? 300_000;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">PR List</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control how often pull request data is refreshed from GitHub.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Refresh interval</p>
        <select
          value={refreshIntervalMs}
          onChange={(e) => {
            updateMutation.mutate({ refreshIntervalMs: Number(e.target.value) });
          }}
          className="h-8 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 outline-none focus:border-ring focus:ring-2 focus:ring-ring/24"
        >
          {REFRESH_INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {refreshIntervalMs === 0
            ? "PR list will only refresh when you manually trigger it."
            : "Changes take effect immediately."}
        </p>
      </div>
    </section>
  );
}

function SettingsRouteView() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { settings, defaults, updateSettings } = useAppSettings();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});

  const keybindingsConfigPath = serverConfigQuery.data?.keybindingsConfigPath ?? null;
  const availableEditors = serverConfigQuery.data?.availableEditors;

  const openKeybindingsFile = useCallback(() => {
    if (!keybindingsConfigPath) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    const api = ensureNativeApi();
    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenKeybindingsError("No available editors found.");
      setIsOpeningKeybindings(false);
      return;
    }
    void api.shell
      .openInEditor(keybindingsConfigPath, editor)
      .catch((error) => {
        setOpenKeybindingsError(
          error instanceof Error ? error.message : "Unable to open keybindings file.",
        );
      })
      .finally(() => {
        setIsOpeningKeybindings(false);
      });
  }, [availableEditors, keybindingsConfigPath]);

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const customModelInput = customModelInputByProvider[provider];
      const customModels = getCustomModelsForProvider(settings, provider);
      const normalized = normalizeModelSlug(customModelInput, provider);
      if (!normalized) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "Enter a model slug.",
        }));
        return;
      }
      if (getModelOptions(provider).some((option) => option.slug === normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That model is already built in.",
        }));
        return;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
        }));
        return;
      }
      if (customModels.includes(normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That custom model is already saved.",
        }));
        return;
      }

      updateSettings(patchCustomModels(provider, [...customModels, normalized]));
      setCustomModelInputByProvider((existing) => ({
        ...existing,
        [provider]: "",
      }));
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [customModelInputByProvider, settings, updateSettings],
  );

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      updateSettings(
        patchCustomModels(
          provider,
          customModels.filter((model) => model !== slug),
        ),
      );
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [settings, updateSettings],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Settings
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure app-level preferences for this device.
              </p>
            </header>

            <GitHubSettingsSection />

            <IDESettingsSection />

            <WorktreeSettingsSection />

            <PRListSettingsSection />

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Appearance</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose how Arbor handles light and dark mode.
                </p>
              </div>

              <div className="space-y-2" role="radiogroup" aria-label="Theme preference">
                {THEME_OPTIONS.map((option) => {
                  const selected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected
                          ? "border-primary/60 bg-primary/8 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => setTheme(option.value)}
                    >
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">{option.label}</span>
                        <span className="text-xs">{option.description}</span>
                      </span>
                      {selected ? (
                        <span className="rounded bg-primary/14 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Active theme: <span className="font-medium text-foreground">{resolvedTheme}</span>
              </p>
            </section>

            {/* Codex App Server settings removed — Arbor uses Claude Code */}

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Models</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save additional provider model slugs so they appear in the chat model picker and
                  `/model` command suggestions.
                </p>
              </div>

              <div className="space-y-5">
                {MODEL_PROVIDER_SETTINGS.map((providerSettings) => {
                  const provider = providerSettings.provider;
                  const customModels = getCustomModelsForProvider(settings, provider);
                  const customModelInput = customModelInputByProvider[provider];
                  const customModelError = customModelErrorByProvider[provider] ?? null;
                  return (
                    <div
                      key={provider}
                      className="rounded-xl border border-border bg-background/50 p-4"
                    >
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-foreground">
                          {providerSettings.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {providerSettings.description}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <label
                            htmlFor={`custom-model-slug-${provider}`}
                            className="block flex-1 space-y-1"
                          >
                            <span className="text-xs font-medium text-foreground">
                              Custom model slug
                            </span>
                            <Input
                              id={`custom-model-slug-${provider}`}
                              value={customModelInput}
                              onChange={(event) => {
                                const value = event.target.value;
                                setCustomModelInputByProvider((existing) => ({
                                  ...existing,
                                  [provider]: value,
                                }));
                                if (customModelError) {
                                  setCustomModelErrorByProvider((existing) => ({
                                    ...existing,
                                    [provider]: null,
                                  }));
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                addCustomModel(provider);
                              }}
                              placeholder={providerSettings.placeholder}
                              spellCheck={false}
                            />
                            <span className="text-xs text-muted-foreground">
                              Example: <code>{providerSettings.example}</code>
                            </span>
                          </label>

                          <Button
                            className="sm:mt-6"
                            type="button"
                            onClick={() => addCustomModel(provider)}
                          >
                            Add model
                          </Button>
                        </div>

                        {customModelError ? (
                          <p className="text-xs text-destructive">{customModelError}</p>
                        ) : null}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <p>Saved custom models: {customModels.length}</p>
                            {customModels.length > 0 ? (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  updateSettings(
                                    patchCustomModels(provider, [
                                      ...getDefaultCustomModelsForProvider(defaults, provider),
                                    ]),
                                  )
                                }
                              >
                                Reset custom models
                              </Button>
                            ) : null}
                          </div>

                          {customModels.length > 0 ? (
                            <div className="space-y-2">
                              {customModels.map((slug) => (
                                <div
                                  key={`${provider}:${slug}`}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                                >
                                  <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                                    {slug}
                                  </code>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => removeCustomModel(provider, slug)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                              No custom models saved yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Responses</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Control how assistant output is rendered during a turn.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Stream assistant messages</p>
                  <p className="text-xs text-muted-foreground">
                    Show token-by-token output while a response is in progress.
                  </p>
                </div>
                <Switch
                  checked={settings.enableAssistantStreaming}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      enableAssistantStreaming: Boolean(checked),
                    })
                  }
                  aria-label="Stream assistant messages"
                />
              </div>

              {settings.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        enableAssistantStreaming: defaults.enableAssistantStreaming,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Keybindings</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open the persisted <code>keybindings.json</code> file to edit advanced bindings
                  directly.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">Config file path</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {keybindingsConfigPath ?? "Resolving keybindings path..."}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!keybindingsConfigPath || isOpeningKeybindings}
                    onClick={openKeybindingsFile}
                  >
                    {isOpeningKeybindings ? "Opening..." : "Open keybindings.json"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Opens in your preferred editor selection.
                </p>
                {openKeybindingsError ? (
                  <p className="text-xs text-destructive">{openKeybindingsError}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Safety</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Additional guardrails for destructive local actions.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Confirm thread deletion</p>
                  <p className="text-xs text-muted-foreground">
                    Ask for confirmation before deleting a thread and its chat history.
                  </p>
                </div>
                <Switch
                  checked={settings.confirmThreadDelete}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      confirmThreadDelete: Boolean(checked),
                    })
                  }
                  aria-label="Confirm thread deletion"
                />
              </div>

              {settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        confirmThreadDelete: defaults.confirmThreadDelete,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Review Context</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Control how CLAUDE.md review context is generated for new PR sessions.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Initialize Claude context on new review sessions
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Run <code>claude /init</code> to generate a repo-aware CLAUDE.md before starting
                    each review session. When disabled, only the PR header is written.
                  </p>
                </div>
                <Switch
                  checked={settings.autoInitReviewContext}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      autoInitReviewContext: Boolean(checked),
                    })
                  }
                  aria-label="Initialize Claude context on new review sessions"
                />
              </div>

              {settings.autoInitReviewContext !== defaults.autoInitReviewContext ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        autoInitReviewContext: defaults.autoInitReviewContext,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">About</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Application version and environment information.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Version</p>
                  <p className="text-xs text-muted-foreground">
                    Current version of the application.
                  </p>
                </div>
                <code className="text-xs font-medium text-muted-foreground">{APP_VERSION}</code>
              </div>
            </section>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/settings")({
  component: SettingsRouteView,
});
