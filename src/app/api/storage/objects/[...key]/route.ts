import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { readLocalObject } from "@/lib/storage/local";
import { verifyObjectReadToken } from "@/lib/storage/signing";

export const runtime = "nodejs";

const contentTypeByExtension: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function inferContentType(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return contentTypeByExtension[extension] ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const params = await context.params;
  const objectKey = params.key.join("/");
  const expires = Number(request.nextUrl.searchParams.get("expires"));
  const signature = request.nextUrl.searchParams.get("signature") ?? "";
  const fileName = request.nextUrl.searchParams.get("filename") ?? objectKey.split("/").pop() ?? "file";

  if (!Number.isFinite(expires) || !signature) {
    return NextResponse.json({ ok: false, error: "Missing signed read parameters." }, { status: 400 });
  }

  if (!verifyObjectReadToken({ key: objectKey, expires, signature })) {
    return NextResponse.json({ ok: false, error: "Invalid or expired signed read URL." }, { status: 403 });
  }

  try {
    const file = await readLocalObject(objectKey);

    return new NextResponse(file, {
      status: 200,
      headers: {
        "content-type": inferContentType(objectKey),
        "content-disposition": `inline; filename="${fileName}"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Stored file not found." }, { status: 404 });
  }
}
