import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchableMultiSelectInput } from "./searchable-multi-select-input";
import { SearchableSelectInput } from "./searchable-select-input";

/**
 * The attributes this contract inspects on a single element. Parsing is
 * limited to what `renderToStaticMarkup` actually serializes: HTML entities in
 * attribute values and text are decoded, attributes are double-quoted, and void
 * elements (`input`) self-close. This is DOM-equivalent attribute resolution,
 * not source-string substring matching.
 */
type ParsedElement = {
  tag: string;
  attributes: Record<string, string>;
  textContent: string;
};

type HiddenInputExpectation = {
  name: string;
  value: string;
};

type SelectorLabelExpectation = {
  /** Visible label text of a `<label>` element. */
  label: string;
  /**
   * Number of named selector/label instances in the supplied markup. A single
   * multi-select instance may submit multiple hidden inputs, so this counts
   * instances (labels), not hidden inputs.
   */
  instanceCount: number;
  /** Submitted hidden values, validated independently of `instanceCount`. */
  hiddenInputs: HiddenInputExpectation[];
};

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#(?:39|x27)|apos);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
}

/**
 * Minimal well-formed-HTML parser for the output `renderToStaticMarkup`
 * produces: elements are nested or self-closing, attributes are double-quoted,
 * and `<script>`/`<style>` raw-text elements do not appear. Returns a flat list
 * of elements in document order, each carrying its tag, decoded attributes, and
 * decoded direct text content (text inside that element only, not nested).
 */
function parseMarkup(markup: string): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const stack: ParsedElement[] = [];
  let cursor = 0;

  while (cursor < markup.length) {
    const nextTag = markup.indexOf("<", cursor);

    if (nextTag === -1) {
      appendText(markup.slice(cursor));
      break;
    }

    appendText(markup.slice(cursor, nextTag));
    cursor = nextTag;

    if (markup.startsWith("<!--", cursor)) {
      const end = markup.indexOf("-->", cursor + 4);
      cursor = end === -1 ? markup.length : end + 3;
      continue;
    }

    if (markup.startsWith("<!", cursor)) {
      const end = markup.indexOf(">", cursor);
      cursor = end === -1 ? markup.length : end + 1;
      continue;
    }

    const closing = markup.startsWith("</", cursor);
    const endBracket = findTagEnd(markup, cursor);

    if (endBracket === -1) {
      throw new assert.AssertionError({
        message: "Malformed markup: unterminated tag",
      });
    }

    const tagSource = markup.slice(cursor + (closing ? 2 : 1), endBracket);
    const selfClosing = tagSource.endsWith("/");
    const body = selfClosing ? tagSource.slice(0, -1) : tagSource;
    cursor = endBracket + 1;

    if (closing) {
      const name = body.trim();
      const last = stack.pop();

      if (!last || last.tag !== name) {
        throw new assert.AssertionError({
          message: `Malformed markup: unexpected closing tag </${name}>`,
        });
      }

      continue;
    }

    const { tag, attributes } = parseTagBody(body);

    if (!tag) {
      throw new assert.AssertionError({
        message: "Malformed markup: tag without a name",
      });
    }

    const element: ParsedElement = {
      tag,
      attributes,
      textContent: "",
    };
    elements.push(element);

    const isVoid = tag === "input" || tag === "img" || tag === "br" || tag === "hr" || tag === "meta" || tag === "link";

    if (selfClosing || isVoid) {
      continue;
    }

    stack.push(element);
  }

  function appendText(chunk: string) {
    if (!chunk || !stack.length) {
      return;
    }

    const decoded = decodeEntities(chunk);

    if (decoded) {
      stack[stack.length - 1].textContent += decoded;
    }
  }

  return elements;
}

/** Find the `>` that ends the tag starting at `from`, ignoring `>` inside quotes. */
function findTagEnd(markup: string, from: number): number {
  let index = from + 1;
  let inQuotes = false;

  while (index < markup.length) {
    const character = markup[index];

    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ">" && !inQuotes) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function parseTagBody(body: string): {
  tag: string;
  attributes: Record<string, string>;
} {
  const match = body.match(/^\s*([a-zA-Z][a-zA-Z0-9-]*)/);

  if (!match) {
    return { tag: "", attributes: {} };
  }

  const tag = match[1];
  const attributes: Record<string, string> = {};
  const attributePattern = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g;
  let offset = match[0].length;
  let attributeMatch: RegExpExecArray | null;

  while ((attributeMatch = attributePattern.exec(body)) !== null) {
    const name = attributeMatch[1];
    const rawValue = attributeMatch[2];
    attributes[name] = rawValue === undefined ? "" : decodeEntities(rawValue);
    offset = attributeMatch.index + attributeMatch[0].length;
  }

  if (offset < body.length && body.slice(offset).trim()) {
    throw new assert.AssertionError({
      message: `Malformed markup: unparsed tag body near "${body.slice(offset)}"`,
    });
  }

  return { tag, attributes };
}

function isHiddenInput(element: ParsedElement): boolean {
  return (
    element.tag === "input" &&
    element.attributes.type?.toLowerCase() === "hidden"
  );
}

/**
 * Validate that the named selector/label instances in `markup` satisfy the
 * label-association contract:
 *
 * - each `expectation.label` resolves to exactly one `<label>` whose `for`
 *   points at exactly one matching, non-hidden `<input>`,
 * - there are exactly `expectation.instanceCount` such named instances, and
 * - every `expectation.hiddenInputs` entry is present as a submitted hidden
 *   value (independent of the instance count, since a multi-select instance may
 *   submit several).
 *
 * Throws an `assert.AssertionError` when any condition fails.
 */
export function assertSearchableSelectorLabelContract(
  markup: string,
  expectation: SelectorLabelExpectation,
): void {
  assert.ok(
    typeof markup === "string" && markup.length > 0,
    "markup must be a non-empty string",
  );

  const elements = parseMarkup(markup);

  const labels = elements.filter((element) => element.tag === "label");
  const inputs = elements.filter((element) => element.tag === "input");

  assert.ok(
    typeof expectation.label === "string" && expectation.label.length > 0,
    "label must be a non-empty string",
  );
  assert.ok(
    Number.isInteger(expectation.instanceCount) && expectation.instanceCount > 0,
    "instanceCount must be a positive integer",
  );

  // Collect every <label> whose visible text matches the expected label text.
  // The count of these named instances must equal `instanceCount`; a single
  // multi-select instance may still submit several hidden inputs.
  const matchingLabels = labels.filter(
    (label) => normalize(label.textContent) === normalize(expectation.label),
  );

  assert.equal(
    matchingLabels.length,
    expectation.instanceCount,
    `label "${expectation.label}" must appear on exactly ${expectation.instanceCount} instance(s) (found ${matchingLabels.length})`,
  );

  // Each named label must reference exactly one element with the target ID,
  // and that element must itself be a non-hidden input.
  const resolvedTargets: ParsedElement[] = [];

  for (const label of matchingLabels) {
    const htmlFor = label.attributes.for;

    assert.ok(
      typeof htmlFor === "string" && htmlFor.length > 0,
      `label "${expectation.label}" must reference an input via for="…"`,
    );

    const targets = elements.filter(
      (element) => element.attributes.id === htmlFor,
    );

    assert.equal(
      targets.length,
      1,
      `label "${expectation.label}" for="${htmlFor}" must target exactly one element (found ${targets.length})`,
    );

    const target = targets[0];

    assert.ok(target);
    assert.equal(
      target.tag,
      "input",
      `label "${expectation.label}" for="${htmlFor}" must target an input`,
    );
    assert.notEqual(
      isHiddenInput(target),
      true,
      `label "${expectation.label}" must target a visible input, not a hidden one`,
    );

    resolvedTargets.push(target);
  }

  // Require the resolved visible inputs to be distinct: two named labels may
  // not share one visible input.
  const targetIds = resolvedTargets.map((target) => target.attributes.id);

  assert.equal(
    new Set(targetIds).size,
    targetIds.length,
    "each named label must resolve to a distinct visible input",
  );

  // Validate submitted hidden values independently of the instance count.
  const presentHidden = inputs.filter(isHiddenInput);

  for (const expected of expectation.hiddenInputs) {
    assert.ok(
      presentHidden.some(
        (input) =>
          input.attributes.name === expected.name &&
          input.attributes.value === expected.value,
      ),
      `expected hidden input name="${expected.name}" value="${expected.value}" is missing`,
    );
  }
}

/** Normalize whitespace so label text matches regardless of incidental spacing. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const sharedOptions = [
  { value: "acme", label: "Acme Logistics" },
  { value: "globex", label: "Globex Freight" },
  { value: "soylent", label: "Soylent Hauling" },
];

test("searchable selector inputs expose closed combobox contracts with unique controlled listboxes", () => {
  const markup = renderToStaticMarkup(
    <Fragment>
      <SearchableSelectInput
        locale="en"
        name="carrier"
        label="Carrier"
        options={sharedOptions}
        defaultValue="acme"
        placeholder="Search carriers"
        emptyMessage="No carriers"
      />
      <SearchableMultiSelectInput
        locale="en"
        name="carriers"
        label="Carriers"
        options={sharedOptions}
        defaultValues={["globex"]}
        placeholder="Search carriers"
        emptyMessage="No carriers"
      />
    </Fragment>,
  );
  const elements = parseMarkup(markup);
  const visibleInputs = elements.filter(
    (element) => element.tag === "input" && !isHiddenInput(element),
  );

  assert.equal(visibleInputs.length, 2);
  assert.deepEqual(
    visibleInputs.map((input) => input.attributes.role),
    ["combobox", "combobox"],
  );
  assert.deepEqual(
    visibleInputs.map((input) => input.attributes["aria-autocomplete"]),
    ["list", "list"],
  );
  assert.deepEqual(
    visibleInputs.map((input) => input.attributes["aria-expanded"]),
    ["false", "false"],
  );
  assert.ok(visibleInputs.every((input) => !input.attributes["aria-activedescendant"]));

  const listboxIds = visibleInputs.map((input) => input.attributes["aria-controls"]);
  assert.ok(listboxIds.every(Boolean));
  assert.equal(new Set(listboxIds).size, listboxIds.length);
  assert.equal(elements.filter((element) => element.attributes.role === "listbox").length, 0);

  assertSearchableSelectorLabelContract(markup, {
    label: "Carrier",
    instanceCount: 1,
    hiddenInputs: [{ name: "carrier", value: "acme" }],
  });
  assertSearchableSelectorLabelContract(markup, {
    label: "Carriers",
    instanceCount: 1,
    hiddenInputs: [{ name: "carriers", value: "globex" }],
  });
});

test("single SearchableSelectInput associates its label with a visible input and submits one hidden value", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectInput
      locale="en"
      name="carrier"
      label="Carrier"
      options={sharedOptions}
      defaultValue="acme"
      placeholder="Search carriers"
      emptyMessage="No carriers"
    />,
  );

  assertSearchableSelectorLabelContract(markup, {
    label: "Carrier",
    instanceCount: 1,
    hiddenInputs: [{ name: "carrier", value: "acme" }],
  });
});

test("SearchableMultiSelectInput associates its label with one visible input while submitting multiple hidden values", () => {
  const markup = renderToStaticMarkup(
    <SearchableMultiSelectInput
      locale="en"
      name="carriers"
      label="Carriers"
      options={sharedOptions}
      defaultValues={["acme", "globex"]}
      placeholder="Search carriers"
      emptyMessage="No carriers"
    />,
  );

  assertSearchableSelectorLabelContract(markup, {
    label: "Carriers",
    instanceCount: 1,
    hiddenInputs: [
      { name: "carriers", value: "acme" },
      { name: "carriers", value: "globex" },
    ],
  });
});

test("repeated SearchableSelectInput instances each resolve to a distinct visible input", () => {
  const markup = renderToStaticMarkup(
    <Fragment>
      <SearchableSelectInput
        locale="en"
        name="origin"
        label="Origin"
        options={sharedOptions}
        defaultValue="acme"
        placeholder="Search"
        emptyMessage="None"
      />
      <SearchableSelectInput
        locale="en"
        name="destination"
        label="Origin"
        options={sharedOptions}
        defaultValue="globex"
        placeholder="Search"
        emptyMessage="None"
      />
    </Fragment>,
  );

  assertSearchableSelectorLabelContract(markup, {
    label: "Origin",
    instanceCount: 2,
    hiddenInputs: [
      { name: "origin", value: "acme" },
      { name: "destination", value: "globex" },
    ],
  });
});

test("treats mixed-case hidden input types as hidden for targets and submissions", () => {
  assert.throws(
    () =>
      assertSearchableSelectorLabelContract(
        '<label for="carrier-input">Carrier</label><input id="carrier-input" type="HIDDEN" />',
        {
          label: "Carrier",
          instanceCount: 1,
          hiddenInputs: [],
        },
      ),
    /must target a visible input/,
  );

  assertSearchableSelectorLabelContract(
    '<label for="carrier-input">Carrier</label><input id="carrier-input" type="TEXT" /><input name="carrier" type="hIdDeN" value="acme" />',
    {
      label: "Carrier",
      instanceCount: 1,
      hiddenInputs: [{ name: "carrier", value: "acme" }],
    },
  );
});

test("matches hidden input names and values independently", () => {
  assert.throws(
    () =>
      assertSearchableSelectorLabelContract(
        '<label for="carrier-input">Carrier</label><input id="carrier-input" type="text" /><input name="carrier" type="hidden" value="acme=x" />',
        {
          label: "Carrier",
          instanceCount: 1,
          hiddenInputs: [{ name: "carrier=acme", value: "x" }],
        },
      ),
    /is missing/,
  );
});

test("decodes React's hexadecimal apostrophe entity in label and input attributes", () => {
  assertSearchableSelectorLabelContract(
    '<label for="driver&#x27;s-input">Driver&#x27;s Carrier</label><input id="driver&#x27;s-input" type="text" /><input name="driver&#x27;s-carrier" type="hidden" value="acme" />',
    {
      label: "Driver's Carrier",
      instanceCount: 1,
      hiddenInputs: [{ name: "driver's-carrier", value: "acme" }],
    },
  );
});

test("rejects a label target ID duplicated by a non-input element", () => {
  assert.throws(
    () =>
      assertSearchableSelectorLabelContract(
        '<label for="carrier-input">Carrier</label><div id="carrier-input"></div><input id="carrier-input" type="text" /><input name="carrier" type="hidden" value="acme" />',
        {
          label: "Carrier",
          instanceCount: 1,
          hiddenInputs: [{ name: "carrier", value: "acme" }],
        },
      ),
    /must target exactly one element/,
  );
});
