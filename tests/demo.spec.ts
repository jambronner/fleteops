import { test, expect } from "@playwright/test";

test("English review, safe intake, import and reset work without external requests", async ({page}, testInfo) => {
  const external:string[]=[]; const errors:string[]=[];
  page.on("request", r=>{ if(!r.url().startsWith("http://127.0.0.1:3100/")) external.push(r.url()); });
  page.on("pageerror", e=>errors.push(e.message));
  await page.goto("/demo");
  await expect(page.getByRole("heading",{name:"Route workspace"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("demo-desktop.png")});
  await expect(page.getByRole("button",{name:"Approve readiness"})).toBeDisabled();
  await page.getByLabel("Intake source").selectOption("demo-blocked");
  await page.getByRole("button",{name:"Simulate receipt"}).click();
  await expect(page.getByRole("status")).toHaveText("Intake held; route unchanged");
  await expect(page.getByRole("button",{name:"Accept demo evidence"})).toHaveCount(0);
  await page.getByLabel("Intake source").selectOption("demo-dispatch");
  await page.getByRole("button",{name:"Simulate receipt"}).click();
  await expect(page.getByRole("button",{name:"Approve readiness"})).toBeDisabled();
  await page.getByRole("button",{name:"Accept demo evidence"}).click();
  await page.getByRole("button",{name:"Approve readiness"}).click();
  await expect(page.getByRole("status")).toHaveText("Readiness approved");
  await page.getByRole("button",{name:"Import demo CSV"}).click();
  await page.getByRole("button",{name:"Import routes",exact:true}).click();
  await expect(page.getByRole("button",{name:/DEMO-004/})).toBeVisible();
  await page.getByRole("button",{name:"Import demo CSV"}).click();
  await page.getByRole("button",{name:"Import routes",exact:true}).click();
  await expect(page.locator("dialog").getByRole("alert")).toContainText("already exists");
  await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.getByRole("button",{name:"Activity",exact:true}).click();
  await expect(page.getByText("Readiness approved",{exact:true})).toBeVisible();
  page.once("dialog", d=>d.accept());
  await page.getByRole("button",{name:"Reset demo"}).click();
  await expect(page.getByRole("button",{name:/DEMO-004/})).toHaveCount(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test("Spanish source controls, decisions and mobile layout are usable", async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844}); await page.goto("/demo");
  await page.getByLabel("Language").selectOption("es-MX");
  await expect(page.locator("html")).toHaveAttribute("lang","es-MX");
  await expect(page.getByRole("heading",{name:"Espacio de rutas"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("demo-mobile-es.png")});
  await page.getByRole("button",{name:/DEMO-002/}).click();
  await expect(page.getByRole("button",{name:"Aprobar preparación"})).toBeDisabled();
  await page.getByRole("button",{name:"Simular recibo"}).click();
  await page.getByRole("button",{name:"Aceptar evidencia demo"}).click();
  await page.getByRole("button",{name:"Retener ruta"}).click();
  await expect(page.getByRole("status")).toHaveText("Ruta retenida");
  await page.getByRole("button",{name:"Aprobar preparación"}).click();
  await page.getByRole("button",{name:"Fuentes",exact:true}).click();
  const row = page.getByRole("heading",{name:"Nueva fuente demo"}).locator("..").locator("..");
  await row.getByRole("button",{name:"Aprobar fuente"}).click();
  await expect(row.getByRole("button",{name:"Aprobar fuente"})).toBeDisabled();
  await row.getByRole("button",{name:"Bloquear fuente"}).click();
  await expect(row.getByRole("button",{name:"Bloquear fuente"})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("connected endpoints deny every mutation method in demo mode", async ({request}) => {
  for(const path of ["/api/shipments","/api/webhooks/evolution","/api/webhooks/whatsapp","/api/webhooks/email-routing","/api/inngest","/api/digests/run","/api/auth/local/session","/api/storage/objects/example","/api/partners/contacts"]) {
    for(const method of ["GET","POST","PUT","PATCH","DELETE"]) {
      const res=await request.fetch(path,{method,headers:{"x-middleware-subrequest":"middleware:middleware:middleware:middleware:middleware"}});
      expect(res.status(),`${method} ${path}`).toBe(403);
    }
  }
  expect((await request.get("/api/health")).status()).toBe(200);
});
