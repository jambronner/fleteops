import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EvidenceWorkspaceShell } from "./evidence-workspace-shell";

test("EvidenceWorkspaceShell renders a concise, counted triage navigation", () => {
  const html = renderToStaticMarkup(
    <EvidenceWorkspaceShell
      canUpload
      inboxCount={7}
      initialView="triage"
      locale="en"
      recent={<p>Recent panel</p>}
      recentCount={12}
      review={<p>Review panel</p>}
      reviewCount={3}
      triage={<p>Triage panel</p>}
      upload={<p>Upload panel</p>}
    />,
  );

  assert.match(html, /Evidence workspace views/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /Triage panel/);
  assert.match(html, />7</);
  assert.match(html, />3</);
  assert.match(html, />12</);
  assert.match(html, /Upload/);
  assert.doesNotMatch(html, /Review panel/);
  assert.match(html, /grid-cols-2/);
  assert.match(html, /sm:flex/);
  assert.doesNotMatch(html, /overflow-x-auto/);
});

test("EvidenceWorkspaceShell hides upload for read-only users and can open review first", () => {
  const html = renderToStaticMarkup(
    <EvidenceWorkspaceShell
      canUpload={false}
      inboxCount={0}
      initialView="review"
      locale="es-MX"
      recent={<p>Panel reciente</p>}
      recentCount={4}
      review={<p>Panel de revisión</p>}
      reviewCount={2}
      triage={<p>Panel de clasificación</p>}
      upload={<p>Panel de carga</p>}
    />,
  );

  assert.match(html, /Panel de revisión/);
  assert.match(html, /Revisión de entrada/);
  assert.doesNotMatch(html, /Panel de carga/);
  assert.doesNotMatch(html, />Cargar</);
});
