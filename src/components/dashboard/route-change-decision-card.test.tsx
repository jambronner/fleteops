import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { RouteChangeDecisionCard } from "@/components/dashboard/route-change-decision-card";
import { ToastProvider } from "@/components/ui/toast-provider";

const router: AppRouterInstance = {
  bfcacheId: "demo-router",
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

test("renders an actionable current-to-proposed route change on the dashboard", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <ToastProvider>
        <RouteChangeDecisionCard
          canManage
          locale="en"
          task={{
            id: "22222222-2222-4222-8222-222222222222",
            title: "Approve changes to MX-241",
            metadata: {
              proposalVersion: 1,
              requiresHumanApproval: true,
              action: "update_route",
              routeResolution: {
                shipmentId: "11111111-1111-4111-8111-111111111111",
                reason: "Matched an explicit route reference.",
              },
              routeReference: "MX-241",
              routeStatus: "in_transit",
              currentValues: {
                pickupDate: null,
                deliveryDateExpected: "2026-08-02",
                deliveryDateActual: null,
              },
              proposedUpdates: {
                pickupDate: null,
                deliveryDateExpected: "2026-08-03",
                deliveryDateActual: null,
              },
              confidence: 0.94,
              source: {
                channel: "email",
                subject: "Move route MX-241",
              },
            },
          }}
        />
      </ToastProvider>
    </AppRouterContext.Provider>,
  );

  assert.match(html, /MX-241/);
  assert.match(html, /Expected delivery/);
  assert.match(html, /Approve/);
  assert.match(html, /Reject/);
  assert.match(html, /Move route MX-241/);
});
