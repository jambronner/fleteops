import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { getSessionForTenant } from "@/lib/auth/session";
import { canWriteDocuments } from "@/lib/documents/policy";
import {
  buildOperatorExtractionRequest,
  operatorExtractionRequestSchema,
} from "@/lib/documents/extraction-request";
import { inngest } from "@/inngest/client";
import {
  getDocumentRoutingReadiness,
  hydrateStoredDocumentExtractionRequest,
  previewDocumentRouting,
  runDocumentExtraction,
} from "@/lib/documents/service";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  try {
    const payload = operatorExtractionRequestSchema.parse(await request.json());
    const session = await getSessionForTenant(payload.tenantId);

    if (!session) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    if (!canWriteDocuments(session)) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to request document extraction." },
        { status: 403 },
      );
    }

    const extractionRequest = buildOperatorExtractionRequest({
      ...payload,
      tenantId: session.tenant.id,
    });
    const hydratedRequest =
      await hydrateStoredDocumentExtractionRequest(extractionRequest);
    const routing = previewDocumentRouting(hydratedRequest);
    const readiness = getDocumentRoutingReadiness(routing);

    if (!readiness.canProcess) {
      return NextResponse.json(
        {
          ok: false,
          error: "No extraction provider is configured for this document.",
          routing,
          readiness,
        },
        { status: 409 },
      );
    }

    if (!env.INNGEST_EVENT_KEY) {
      try {
        const extraction = await runDocumentExtraction(extractionRequest);

        return NextResponse.json(
          {
            ok: true,
            accepted: true,
            processed: true,
            routing,
            readiness,
            extraction,
            message: "Document extraction ran immediately because Inngest is not configured.",
          },
          { status: 200 },
        );
      } catch (error) {
        return NextResponse.json(
          {
            ok: false,
            accepted: true,
            processed: false,
            error: error instanceof Error ? error.message : "Document extraction failed.",
            routing,
            readiness,
          },
          { status: 500 },
        );
      }
    }

    await inngest.send({
      name: "document/extraction.requested",
      data: extractionRequest,
    });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        processed: false,
        routing,
        readiness,
        message: "Document extraction was queued for processing.",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to request document extraction.",
      },
      { status: 400 },
    );
  }
}
