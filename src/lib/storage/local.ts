import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { signObjectReadToken } from "@/lib/storage/signing";
import type { StorageDriver } from "@/lib/storage/types";

function getStorageRoot() {
  if (path.isAbsolute(env.LOCAL_STORAGE_ROOT)) {
    return env.LOCAL_STORAGE_ROOT;
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", env.LOCAL_STORAGE_ROOT);
  }

  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.LOCAL_STORAGE_ROOT);
}

function resolveObjectPath(key: string) {
  const normalizedKey = key.replace(/\\/g, "/");
  return path.join(getStorageRoot(), normalizedKey);
}

function encodeObjectKeyForPath(key: string) {
  return key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getPublicAppUrl() {
  const configuredUrl = new URL(env.NEXT_PUBLIC_APP_URL);

  if (
    process.env.VERCEL_URL &&
    ["localhost", "127.0.0.1"].includes(configuredUrl.hostname)
  ) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }

  return configuredUrl;
}

export async function readLocalObject(key: string) {
  return readFile(resolveObjectPath(key));
}

export const localStorageDriver: StorageDriver = {
  name: "local",
  async putObject({ key, body, contentType, originalFileName }) {
    const fullPath = resolveObjectPath(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);

    return {
      driver: "local",
      key,
      contentType: contentType ?? null,
      size: body.byteLength,
      originalFileName: originalFileName ?? null,
    };
  },
  async readObject({ key }) {
    return new Uint8Array(await readFile(resolveObjectPath(key)));
  },
  async createSignedReadUrl({ key, expiresInSeconds = 900, fileName }) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = signObjectReadToken(key, expires);
    const objectPath = encodeObjectKeyForPath(key);
    const url = new URL(`/api/storage/objects/${objectPath}`, getPublicAppUrl());
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", signature);

    if (fileName) {
      url.searchParams.set("filename", fileName);
    }

    return url.toString();
  },
  async deleteObject({ key }) {
    await rm(resolveObjectPath(key), { force: true });
  },
};
