import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QueryClient } from "@tanstack/react-query";
import type { APIKeyStatus } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";

/** Apply refreshed image model catalog into the cached api-keys query. */
export function patchApiKeyImageModels(
  queryClient: QueryClient,
  provider: LLMProvider,
  imageModels: string[],
  currentImageModel?: string | null,
): void {
  queryClient.setQueryData<ApiResponse<APIKeyStatus[]>>(
    queryKeys.settings.apiKeys,
    (previous) => {
      if (!previous?.data) {
        return previous;
      }
      return {
        ...previous,
        data: previous.data.map((item) => {
          if (item.provider !== provider) {
            return item;
          }
          const nextImageModel = currentImageModel ?? item.currentImageModel;
          return {
            ...item,
            currentImageModel: nextImageModel,
            imageModels: Array.from(new Set([
              ...imageModels,
              nextImageModel ?? "",
            ].filter(Boolean))),
            supportsImageGeneration: Boolean(nextImageModel || imageModels.length > 0),
          };
        }),
      };
    },
  );
}
