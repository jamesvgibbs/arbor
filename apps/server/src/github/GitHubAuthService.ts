import type { DeviceFlowResponse, DeviceFlowTokenResponse } from "./types";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";

/** Maximum time (ms) to poll before giving up on device flow. */
const POLL_TIMEOUT_MS = 900_000; // 15 minutes

export class GitHubAuthService {
  /**
   * Initiate the GitHub Device Flow.
   * Returns a device code + user code for the user to enter at the verification URI.
   */
  static async startDeviceFlow(clientId: string): Promise<DeviceFlowResponse> {
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: "repo read:user",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Failed to start device flow: ${res.status} ${res.statusText} - ${text}`,
      );
    }

    const data = (await res.json()) as DeviceFlowResponse;
    return data;
  }

  /**
   * Poll GitHub for the access token after the user has entered the device code.
   * Handles `slow_down`, `authorization_pending`, `expired_token`, and `access_denied`.
   */
  static async pollForToken(
    clientId: string,
    deviceCode: string,
    interval: number,
  ): Promise<DeviceFlowTokenResponse> {
    let currentInterval = interval;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(currentInterval * 1000);

      const res = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Token poll request failed: ${res.status} ${res.statusText} - ${text}`,
        );
      }

      const data = (await res.json()) as
        | DeviceFlowTokenResponse
        | { error: string; error_description?: string; interval?: number };

      if ("access_token" in data) {
        return data;
      }

      const error = (data as { error: string }).error;

      switch (error) {
        case "authorization_pending":
          // User hasn't entered the code yet; keep polling.
          break;

        case "slow_down":
          // GitHub is asking us to increase the polling interval.
          currentInterval = (data as { interval?: number }).interval
            ? (data as { interval: number }).interval
            : currentInterval + 5;
          break;

        case "expired_token":
          throw new Error(
            "Device code expired. Please restart the authentication flow.",
          );

        case "access_denied":
          throw new Error("User denied the authorization request.");

        default:
          throw new Error(
            `Unexpected device flow error: ${error} - ${(data as { error_description?: string }).error_description ?? ""}`,
          );
      }
    }

    throw new Error("Device flow polling timed out.");
  }

  /**
   * Validate an access token by calling the GitHub user endpoint.
   * Returns the authenticated user's username and avatar URL.
   */
  static async validateToken(
    token: string,
  ): Promise<{ username: string; avatarUrl: string }> {
    const res = await fetch(GITHUB_API_USER_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Token validation failed: ${res.status} ${res.statusText} - ${text}`,
      );
    }

    const data = (await res.json()) as {
      login: string;
      avatar_url: string;
    };

    return {
      username: data.login,
      avatarUrl: data.avatar_url,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
