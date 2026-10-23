import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchableMultiSelectInput } from "./searchable-multi-select-input";
import { SearchableSelectInput } from "./searchable-select-input";
import { resolveSearchableSelectorKeydown } from "./searchable-selector-keyboard";

const componentSources = {
  single: readFileSync(join(process.cwd(), "src/components/ui/searchable-select-input.tsx"), "utf8"),
  multi: readFileSync(join(process.cwd(), "src/components/ui/searchable-multi-select-input.tsx"), "utf8"),
};

const options = [
  { value: "acme", label: "Acme Logistics" },
  { value: "globex", label: "Globex Freight" },
  { value: "soylent", label: "Soylent Hauling" },
];

function assertComponentContract(pattern: RegExp, message: string) {
  for (const [kind, source] of Object.entries(componentSources)) {
    assert.match(source, pattern, `${kind}: ${message}`);
  }
}

function assertHiddenSubmission(markup: string, name: string, value: string) {
  assert.match(
    markup,
    new RegExp(`<input(?=[^>]*type="hidden")(?=[^>]*name="${name}")(?=[^>]*value="${value}")[^>]*/>`),
  );
}

test("resolves the searchable selector keyboard decision table", () => {
  const cases = [
    [{ key: "ArrowDown", isOpen: false, activeIndex: -1, itemCount: 3 }, { handled: true, nextActiveIndex: 0, action: "open" }],
    [{ key: "ArrowUp", isOpen: false, activeIndex: 0, itemCount: 3 }, { handled: true, nextActiveIndex: 2, action: "open" }],
    [{ key: "ArrowDown", isOpen: true, activeIndex: 2, itemCount: 3 }, { handled: true, nextActiveIndex: 0, action: "none" }],
    [{ key: "ArrowUp", isOpen: true, activeIndex: 0, itemCount: 3 }, { handled: true, nextActiveIndex: 2, action: "none" }],
    [{ key: "Home", isOpen: true, activeIndex: 2, itemCount: 3 }, { handled: true, nextActiveIndex: 0, action: "none" }],
    [{ key: "End", isOpen: true, activeIndex: 0, itemCount: 3 }, { handled: true, nextActiveIndex: 2, action: "none" }],
    [{ key: "Enter", isOpen: true, activeIndex: 1, itemCount: 3 }, { handled: true, nextActiveIndex: 1, action: "select" }],
    [{ key: "Enter", isOpen: false, activeIndex: 0, itemCount: 3 }, { handled: false, nextActiveIndex: 0, action: "none" }],
    [{ key: "Escape", isOpen: true, activeIndex: 1, itemCount: 3 }, { handled: true, nextActiveIndex: -1, action: "close" }],
    [{ key: "Escape", isOpen: false, activeIndex: 1, itemCount: 3 }, { handled: false, nextActiveIndex: 1, action: "none" }],
    [{ key: "Tab", isOpen: true, activeIndex: 1, itemCount: 3 }, { handled: false, nextActiveIndex: 1, action: "none" }],
    [{ key: "ArrowDown", isOpen: false, activeIndex: -1, itemCount: 0 }, { handled: true, nextActiveIndex: -1, action: "open" }],
  ] as const;

  for (const [input, expected] of cases) {
    assert.deepEqual(resolveSearchableSelectorKeydown(input), expected, input.key);
  }
});

test("Escape clears active state and the next navigation opens from an inactive selector", () => {
  const close = resolveSearchableSelectorKeydown({
    key: "Escape",
    isOpen: true,
    activeIndex: 1,
    itemCount: 3,
  });
  assert.deepEqual(close, { handled: true, nextActiveIndex: -1, action: "close" });

  const reopen = resolveSearchableSelectorKeydown({
    key: "ArrowDown",
    isOpen: false,
    activeIndex: close.nextActiveIndex,
    itemCount: 3,
  });
  assert.deepEqual(reopen, { handled: true, nextActiveIndex: 0, action: "open" });
});

test("both selectors initially render closed combobox ARIA without an active descendant", () => {
  const markup = renderToStaticMarkup(
    <Fragment>
      <SearchableSelectInput locale="en" name="carrier" label="Carrier" options={options} placeholder="Search" emptyMessage="None" />
      <SearchableMultiSelectInput locale="en" name="carriers" label="Carriers" options={options} placeholder="Search" emptyMessage="None" />
    </Fragment>,
  );
  const comboboxes = markup.match(/<input[^>]*role="combobox"[^>]*\/>/g) ?? [];

  assert.equal(comboboxes.length, 2);
  for (const combobox of comboboxes) {
    assert.match(combobox, /aria-autocomplete="list"/);
    assert.match(combobox, /aria-controls="[^"]+-listbox"/);
    assert.match(combobox, /aria-expanded="false"/);
    assert.doesNotMatch(combobox, /aria-activedescendant=/);
  }
  assert.doesNotMatch(markup, /role="listbox"/);
});

test("both selectors preserve their hidden form submission values", () => {
  const markup = renderToStaticMarkup(
    <Fragment>
      <SearchableSelectInput locale="en" name="carrier" label="Carrier" options={options} defaultValue="acme" placeholder="Search" emptyMessage="None" />
      <SearchableMultiSelectInput locale="en" name="carriers" label="Carriers" options={options} defaultValues={["globex", "soylent"]} placeholder="Search" emptyMessage="None" />
    </Fragment>,
  );

  assertHiddenSubmission(markup, "carrier", "acme");
  assertHiddenSubmission(markup, "carriers", "globex");
  assertHiddenSubmission(markup, "carriers", "soylent");
});

test("both selectors wire the shared resolver to their keyboard handler and ARIA state", () => {
  assertComponentContract(
    /onKeyDown=\{\(event\) => \{\s+const decision = resolveSearchableSelectorKeydown\(\{\s+key: event\.key,\s+isOpen,\s+activeIndex,\s+itemCount,\s+\}\);[\s\S]*?setActiveIndex\(decision\.nextActiveIndex\);[\s\S]*?decision\.action === "open"[\s\S]*?decision\.action === "close"[\s\S]*?decision\.action === "select"/,
    "the onKeyDown handler must execute every resolver action",
  );
  assertComponentContract(
    /role="combobox"\s+aria-activedescendant=\{activeOptionId\}\s+aria-autocomplete="list"\s+aria-controls=\{listboxId\}\s+aria-expanded=\{isOpen\}/,
    "the combobox must expose its active descendant, listbox, and open state",
  );
  assertComponentContract(
    /const activeOptionId = !isOpen \|\| activeIndex < 0 \|\| activeIndex >= itemCount\s+\? undefined\s+: `\$\{reactId\}-option-\$\{activeIndex\}`/,
    "closed or inactive controls must not expose a stale active descendant",
  );
});

test("rendered keyboard rows reserve index zero for create and keep filtered option selection aligned", () => {
  assertComponentContract(
    /const itemCount = filteredOptions\.length \+ \(canCreate \? 1 : 0\);[\s\S]*?id=\{`\$\{reactId\}-option-0`\}[\s\S]*?filteredOptions\.map\(\(option, index\) => \{[\s\S]*?const optionIndex = index \+ \(canCreate \? 1 : 0\);[\s\S]*?id=\{`\$\{reactId\}-option-\$\{optionIndex\}`\}[\s\S]*?role="option"/,
    "create is the first rendered option and filtered options follow it",
  );
  assertComponentContract(
    /const optionIndex = activeIndex - \(canCreate \? 1 : 0\);\s+const option = filteredOptions\[optionIndex\];[\s\S]*?if \(option\) \{\s+(?:commitSelection|addSelection)\(option\);/,
    "Enter must select the rendered filtered option at the active keyboard index",
  );
});

test("both selectors activate an active create row through their asynchronous create path", () => {
  assertComponentContract(
    /async function handleCreate\(\) \{[\s\S]*?const created = await onCreateOption\(query\.trim\(\)\);\s+(?:commitSelection|addSelection)\(created\);/,
    "the create path awaits the supplied creator and selects its result",
  );
  assertComponentContract(
    /if \(canCreate && activeIndex === 0\) \{\s+void handleCreate\(\);/,
    "Enter on the active create row must invoke the existing asynchronous create path",
  );
});
