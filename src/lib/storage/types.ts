export type StorageDriverName = "local" | "s3";

export type StoredObjectRef = {
  driver: StorageDriverName;
  key: string;
  contentType?: string | null;
  size?: number | null;
  originalFileName?: string | null;
};

export interface StorageDriver {
  name: StorageDriverName;
  putObject(args: {
    key: string;
    body: Uint8Array;
    contentType?: string | null;
    originalFileName?: string | null;
  }): Promise<StoredObjectRef>;
  readObject(args: { key: string }): Promise<Uint8Array>;
  createSignedReadUrl(args: {
    key: string;
    expiresInSeconds?: number;
    fileName?: string | null;
  }): Promise<string>;
  deleteObject(args: { key: string }): Promise<void>;
}
