import { z } from "zod";

export const documentLifecycleRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("restore"),
  }),
]);

export type DocumentLifecycleRequest = z.infer<typeof documentLifecycleRequestSchema>;
