import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { StatBar } from "./stat-bar";

test("StatBar wraps metrics into a compact mobile grid", () => {
  const html = renderToStaticMarkup(
    <StatBar
      items={[
        { label: "Needs route link", value: 1, tone: "accent" },
        { label: "Linked to route", value: 6, tone: "success" },
        { label: "Routes with evidence", value: 3 },
        { label: "Routes waiting", value: 0, tone: "warning" },
      ]}
    />,
  );

  assert.match(html, /grid-cols-2/);
  assert.match(html, /w-full/);
  assert.match(html, /sm:flex/);
  assert.doesNotMatch(html, /flex-shrink-0/);
});
