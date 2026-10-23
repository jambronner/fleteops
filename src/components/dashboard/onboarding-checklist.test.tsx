import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingChecklistPresentation } from "./onboarding-checklist";

const checklist = {
  steps: [
    { id: "channel" as const, done: false },
    { id: "route" as const, done: true },
    { id: "evidence" as const, done: false },
    { id: "team" as const, done: false },
  ],
  completed: 1,
  total: 4,
};

test("OnboardingChecklistPresentation renders nothing after success", () => {
  const html = renderToStaticMarkup(
    <OnboardingChecklistPresentation
      checklist={checklist}
      locale="en"
      onDismiss={() => null}
      onRetry={() => null}
      requestState={{ status: "success" }}
    />,
  );

  assert.equal(html, "");
});

test("OnboardingChecklistPresentation keeps English and Spanish failures actionable", () => {
  const english = renderToStaticMarkup(
    <OnboardingChecklistPresentation
      checklist={checklist}
      locale="en"
      onDismiss={() => null}
      onRetry={() => null}
      requestState={{ status: "failure", retry: true }}
    />,
  );
  const spanish = renderToStaticMarkup(
    <OnboardingChecklistPresentation
      checklist={checklist}
      locale="es-MX"
      onDismiss={() => null}
      onRetry={() => null}
      requestState={{ status: "failure", retry: true }}
    />,
  );

  assert.match(english, /We couldn&#x27;t hide the checklist\./);
  assert.match(english, />Try again</);
  assert.match(spanish, /No pudimos ocultar la lista\./);
  assert.match(spanish, />Intentar de nuevo</);
});

test("a retry-pending presentation keeps the failure surface visible and disables retry", () => {
  const html = renderToStaticMarkup(
    <OnboardingChecklistPresentation
      checklist={checklist}
      locale="en"
      onDismiss={() => null}
      onRetry={() => null}
      requestState={{ status: "pending", retry: true }}
    />,
  );

  assert.match(html, /We couldn&#x27;t hide the checklist\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Try again<\/button>/);
});

test("initial pending disables dismiss natively", () => {
  const html = renderToStaticMarkup(
    <OnboardingChecklistPresentation
      checklist={checklist}
      locale="en"
      onDismiss={() => null}
      onRetry={() => null}
      requestState={{ status: "pending", retry: false }}
    />,
  );

  assert.match(html, /<button[^>]*aria-label="Hide checklist"[^>]*disabled=""/);
});
