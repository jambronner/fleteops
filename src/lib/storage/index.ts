import { getStorageDriverName } from "@/lib/env";
import type { StorageDriver } from "@/lib/storage/types";

let cachedDriver: StorageDriver | null = null;

export async function getStorageDriver(): Promise<StorageDriver> {
  const driverName = getStorageDriverName();

  if (cachedDriver?.name === driverName) {
    return cachedDriver;
  }

  if (driverName === "s3") {
    const { s3StorageDriver } = await import("@/lib/storage/s3");
    cachedDriver = s3StorageDriver;
    return s3StorageDriver;
  }

  const { localStorageDriver } = await import("@/lib/storage/local");
  cachedDriver = localStorageDriver;
  return localStorageDriver;
}
