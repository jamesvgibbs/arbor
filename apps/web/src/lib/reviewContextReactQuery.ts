import type {
  ReviewContextDetectResult,
  ReviewContextInitInput,
  ReviewContextInitResult,
} from "@arbortools/contracts";
import { mutationOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

export function reviewContextDetectMutationOptions() {
  return mutationOptions({
    mutationKey: ["reviewContext", "detect"] as const,
    mutationFn: async (params: { worktreePath: string }): Promise<ReviewContextDetectResult> => {
      const api = ensureNativeApi();
      return api.reviewContext.detect(params);
    },
  });
}

export function reviewContextInitMutationOptions() {
  return mutationOptions({
    mutationKey: ["reviewContext", "init"] as const,
    mutationFn: async (params: ReviewContextInitInput): Promise<ReviewContextInitResult> => {
      const api = ensureNativeApi();
      return api.reviewContext.init(params);
    },
  });
}
