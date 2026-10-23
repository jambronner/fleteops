import { z } from "zod";
import { isDemoMode } from "./runtime-mode";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const toBoolean = (value: unknown) => value === true || value === "1" || value === "true";
const trimToUndefined = (value: string | undefined) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};
const normalizeAuthProvider = (value: unknown) => {
  if (value === "local_dev") {
    return "local";
  }

  return value;
};

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  NEXT_PUBLIC_MARKETING_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DATABASE_MIGRATION_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DATABASE_POOL_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(5)),
  DEFAULT_LOCALE: z.preprocess(emptyToUndefined, z.string().default("es-MX")),
  DEFAULT_TIMEZONE: z.preprocess(
    emptyToUndefined,
    z.string().default("America/Mexico_City"),
  ),
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AUTH_PROVIDER: z.preprocess(
    (value) => normalizeAuthProvider(emptyToUndefined(value)),
    z.enum(["local", "clerk", "supabase"]).default("local"),
  ),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SESSION_MAX_AGE_DAYS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(14),
  ),
  WHATSAPP_VERIFY_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  WHATSAPP_APP_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  WHATSAPP_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EVOLUTION_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EVOLUTION_API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  EVOLUTION_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EMAIL_INGEST_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MAILERSEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MAILERSEND_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().default("FleteOps <onboarding@resend.dev>")),
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_REGION: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_DRIVER: z.preprocess(emptyToUndefined, z.enum(["local", "s3"]).default("local")),
  LOCAL_STORAGE_ROOT: z.preprocess(emptyToUndefined, z.string().default(".storage")),
  ASSET_SIGNING_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DOCUMENT_MAX_FILE_SIZE_MB: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().default(25),
  ),
  TENANT_STORAGE_QUOTA_MB: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().default(1024),
  ),
  EMAIL_MAX_ATTACHMENTS_PER_MESSAGE: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(10),
  ),
  EMAIL_MAX_ATTACHMENT_TOTAL_MB: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().default(50),
  ),
  IMPORT_MAX_FILE_SIZE_MB: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(12),
  ),
  DOCLING_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DOCLING_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_MODEL_EXTRACTION: z.preprocess(emptyToUndefined, z.string().default("gpt-4.1-mini")),
  OPENAI_MODEL_SUMMARY: z.preprocess(emptyToUndefined, z.string().default("gpt-4.1")),
  OPENROUTER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENROUTER_MODEL_VISION: z.preprocess(
    emptyToUndefined,
    z.string().default("google/gemini-2.5-flash-lite"),
  ),
  INNGEST_EVENT_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  INNGEST_SIGNING_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SHARED_SERVICES_GATEWAY_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SHARED_SERVICES_SCAN_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SHARED_SERVICES_SCAN_REQUIRED: z.preprocess(toBoolean, z.boolean().default(false)),
  ALLOW_LOCAL_AUTH_IN_PRODUCTION: z.preprocess(toBoolean, z.boolean().default(false)),
});

const configuredEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  DEFAULT_LOCALE: process.env.DEFAULT_LOCALE,
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SESSION_MAX_AGE_DAYS: process.env.SESSION_MAX_AGE_DAYS,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  EVOLUTION_WEBHOOK_SECRET: process.env.EVOLUTION_WEBHOOK_SECRET,
  EVOLUTION_API_BASE_URL: process.env.EVOLUTION_API_BASE_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EMAIL_INGEST_WEBHOOK_SECRET: process.env.EMAIL_INGEST_WEBHOOK_SECRET,
  MAILERSEND_API_KEY: process.env.MAILERSEND_API_KEY,
  MAILERSEND_WEBHOOK_SECRET: process.env.MAILERSEND_WEBHOOK_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  CRON_SECRET: process.env.CRON_SECRET,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
  ASSET_SIGNING_SECRET: process.env.ASSET_SIGNING_SECRET,
  DOCUMENT_MAX_FILE_SIZE_MB: process.env.DOCUMENT_MAX_FILE_SIZE_MB,
  TENANT_STORAGE_QUOTA_MB: process.env.TENANT_STORAGE_QUOTA_MB,
  EMAIL_MAX_ATTACHMENTS_PER_MESSAGE: process.env.EMAIL_MAX_ATTACHMENTS_PER_MESSAGE,
  EMAIL_MAX_ATTACHMENT_TOTAL_MB: process.env.EMAIL_MAX_ATTACHMENT_TOTAL_MB,
  IMPORT_MAX_FILE_SIZE_MB: process.env.IMPORT_MAX_FILE_SIZE_MB,
  DOCLING_BASE_URL: process.env.DOCLING_BASE_URL,
  DOCLING_API_KEY: process.env.DOCLING_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL_EXTRACTION: process.env.OPENAI_MODEL_EXTRACTION,
  OPENAI_MODEL_SUMMARY: process.env.OPENAI_MODEL_SUMMARY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL_VISION: process.env.OPENROUTER_MODEL_VISION,
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  SHARED_SERVICES_GATEWAY_URL: process.env.SHARED_SERVICES_GATEWAY_URL,
  SHARED_SERVICES_SCAN_TOKEN: process.env.SHARED_SERVICES_SCAN_TOKEN,
  SHARED_SERVICES_SCAN_REQUIRED: process.env.SHARED_SERVICES_SCAN_REQUIRED,
  ALLOW_LOCAL_AUTH_IN_PRODUCTION: process.env.ALLOW_LOCAL_AUTH_IN_PRODUCTION,
};

// Never initialize a real adapter from inherited configuration in the demo.
export const env = envSchema.parse(isDemoMode() ? {} : configuredEnv);

export function getRuntimeEnvValue(name: string) {
  return isDemoMode() ? undefined : trimToUndefined(process.env[name]);
}

export function getDoclingBaseUrl() {
  return getRuntimeEnvValue("DOCLING_BASE_URL") ?? env.DOCLING_BASE_URL;
}

export function getDoclingApiKey() {
  return getRuntimeEnvValue("DOCLING_API_KEY") ?? env.DOCLING_API_KEY;
}

export function getOpenRouterApiKey() {
  return getRuntimeEnvValue("OPENROUTER_API_KEY") ?? env.OPENROUTER_API_KEY;
}

export function getOpenRouterVisionModel() {
  return getRuntimeEnvValue("OPENROUTER_MODEL_VISION") ?? env.OPENROUTER_MODEL_VISION;
}

export function getResendApiKey() {
  return getRuntimeEnvValue("RESEND_API_KEY") ?? env.RESEND_API_KEY;
}

export function getOutboundEmailFrom() {
  return getRuntimeEnvValue("EMAIL_FROM") ?? env.EMAIL_FROM;
}

export function getCronSecret() {
  return getRuntimeEnvValue("CRON_SECRET") ?? env.CRON_SECRET;
}

export function getSharedServicesGatewayUrl() {
  return getRuntimeEnvValue("SHARED_SERVICES_GATEWAY_URL") ?? env.SHARED_SERVICES_GATEWAY_URL;
}

export function getSharedServicesScanToken() {
  return getRuntimeEnvValue("SHARED_SERVICES_SCAN_TOKEN") ?? env.SHARED_SERVICES_SCAN_TOKEN;
}

export function isDocumentScanRequired() {
  const runtimeValue = getRuntimeEnvValue("SHARED_SERVICES_SCAN_REQUIRED");
  if (runtimeValue !== undefined) {
    return runtimeValue === "1" || runtimeValue === "true";
  }

  return env.SHARED_SERVICES_SCAN_REQUIRED;
}

export function isLocalAuthAllowedInProduction() {
  const runtimeValue = getRuntimeEnvValue("ALLOW_LOCAL_AUTH_IN_PRODUCTION");
  if (runtimeValue !== undefined) {
    return runtimeValue === "1" || runtimeValue === "true";
  }

  return env.ALLOW_LOCAL_AUTH_IN_PRODUCTION;
}

export function getAppUrl() {
  return getRuntimeEnvValue("NEXT_PUBLIC_APP_URL") ?? env.NEXT_PUBLIC_APP_URL;
}

export function getMarketingUrl() {
  return getRuntimeEnvValue("NEXT_PUBLIC_MARKETING_URL") ?? env.NEXT_PUBLIC_MARKETING_URL;
}

export function getStorageDriverName() {
  const runtimeValue = getRuntimeEnvValue("STORAGE_DRIVER");
  if (runtimeValue === "local" || runtimeValue === "s3") {
    return runtimeValue;
  }

  return env.STORAGE_DRIVER;
}

export function getS3StorageConfig() {
  return {
    bucket: getRuntimeEnvValue("S3_BUCKET") ?? env.S3_BUCKET ?? null,
    region: getRuntimeEnvValue("S3_REGION") ?? env.S3_REGION ?? "auto",
    endpoint: getRuntimeEnvValue("S3_ENDPOINT") ?? env.S3_ENDPOINT ?? null,
    accessKeyId: getRuntimeEnvValue("S3_ACCESS_KEY_ID") ?? env.S3_ACCESS_KEY_ID ?? null,
    secretAccessKey:
      getRuntimeEnvValue("S3_SECRET_ACCESS_KEY") ?? env.S3_SECRET_ACCESS_KEY ?? null,
  };
}

export function getDocumentMaxFileSizeBytes() {
  return Math.floor(env.DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024);
}

export function getTenantStorageQuotaBytes() {
  return Math.floor(env.TENANT_STORAGE_QUOTA_MB * 1024 * 1024);
}

export function getEmailMaxAttachmentTotalBytes() {
  return Math.floor(env.EMAIL_MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024);
}
