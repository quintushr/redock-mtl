import type {
  Message,
  MessageTree,
  MessageValues,
  PluralCategory,
  PluralMessage,
} from "./types";

/**
 * Turning a message into a sentence.
 *
 * Pure, and the whole of what a wording file is allowed to do: substitute a
 * value, and vary by plural category. Everything else — rounding, deciding
 * which of several sentences applies, splitting a duration into hours and
 * minutes — belongs to the code that calls this, not to the words.
 *
 * No state, no storage, no DOM, no filesystem. Principle III, and it is what
 * lets every case below be tested without a browser.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

const PLURAL_CATEGORIES: ReadonlySet<string> = new Set([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);

/**
 * A plural message is an object whose keys are *all* plural categories.
 *
 * The weaker test — "has an `other` key" — misreads `placeKinds`, which carries
 * an `other` label for a place the geocoder could not classify and is a group
 * of nine, not a message with one plural form. Getting this wrong would hide
 * eight entries from every completeness check.
 */
export function isPluralMessage(value: unknown): value is PluralMessage {
  if (typeof value !== "object" || value === null) return false;

  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every((key) => PLURAL_CATEGORIES.has(key)) &&
    typeof (value as PluralMessage).other === "string"
  );
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Single-pass on purpose. `String.replace` with a callback never rescans what
 * it has just written, so a place name containing braces — and OpenStreetMap
 * has them — cannot smuggle in a placeholder of its own.
 *
 * An unknown placeholder is left exactly as written rather than replaced with
 * a blank. A visible `{plaec}` is a bug someone reports; a silent gap is a bug
 * nobody sees.
 */
export function fill(template: string, values?: MessageValues): string {
  if (values === undefined) return template;

  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * Picks the plural category `count` falls into for this language, and fills it.
 *
 * Through `Intl.PluralRules`, which is the platform's answer and cannot drift
 * from the language it describes. This matters between the two languages we
 * already ship, not merely in theory: CLDR puts zero in French's `one` category
 * and English's `other`, so "0 arrêt" and "0 stops" are both correct and a
 * hand-written comparison against 1 gets one of them wrong.
 *
 * Falls back to `other`, which every plural message has. The coverage checks
 * would already have failed on a language missing a category it uses, so this
 * is a floor rather than a strategy.
 *
 * `{count}` is available to the wording without being passed twice.
 */
export function plural(
  message: PluralMessage,
  count: number,
  formatting: string,
  values?: MessageValues,
): string {
  const category = new Intl.PluralRules(formatting).select(
    count,
  ) as PluralCategory;

  return fill(message[category] ?? message.other, { count, ...values });
}

/**
 * A message rendered, whichever kind it is.
 *
 * `count` selects a category when the message varies by one. Passing a count to
 * a plain string is harmless: it becomes an ordinary `{count}` substitution.
 */
export function resolve(
  message: Message,
  formatting: string,
  values?: MessageValues,
): string {
  if (isPluralMessage(message)) {
    const count = values?.count;
    return plural(
      message,
      typeof count === "number" ? count : 0,
      formatting,
      values,
    );
  }

  return fill(message, values);
}

/**
 * Every leaf in a tree, as a dotted path, sorted.
 *
 * The basis of every completeness check. Sorted so two runs, and two languages,
 * produce comparable lists.
 */
export function leafPaths(tree: MessageTree): readonly string[] {
  const paths: string[] = [];

  function walk(node: Message | MessageTree, path: string): void {
    if (typeof node === "string" || isPluralMessage(node)) {
      paths.push(path);
      return;
    }

    for (const key of Object.keys(node)) {
      walk((node as MessageTree)[key], path === "" ? key : `${path}.${key}`);
    }
  }

  walk(tree, "");

  return paths.sort();
}

/** Reads a leaf out of a tree by its dotted path, or undefined if absent. */
export function messageAt(
  tree: MessageTree,
  path: string,
): Message | undefined {
  let node: Message | MessageTree | undefined = tree;

  for (const key of path.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = (node as MessageTree)[key];
  }

  if (node === undefined) return undefined;
  if (typeof node === "string") return node;
  return isPluralMessage(node) ? node : undefined;
}

/**
 * The placeholder names a message uses, deduplicated.
 *
 * Across every category of a plural message, because a language may need a
 * value in one form and not another — "1 arrêt" carries no count, "{count}
 * arrêts" does — and dropping it from one form is not a mistake. Comparing the
 * union is what makes FR-214 checkable without false failures.
 */
export function placeholders(message: Message): ReadonlySet<string> {
  const names = new Set<string>();

  const texts = isPluralMessage(message)
    ? Object.values(message).filter(
        (value): value is string => typeof value === "string",
      )
    : [message];

  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      names.add(match[1]);
    }
  }

  return names;
}

/**
 * A language's wording laid over the reference, entry by entry.
 *
 * What FR-203 asks for: an entry a language has not translated renders the
 * reference wording, never a blank and never a dotted path. Per entry rather
 * than per language, so a translation that is 90% done is 90% useful instead of
 * all-or-nothing.
 *
 * Costs no request and cannot fail, because every language is already in the
 * first load (FR-225). Pure, and it does not mutate either argument.
 *
 * The checks read the raw trees, not this one. Overlaying before counting would
 * report every language as complete, which is the opposite of FR-211.
 */
export function overlay<T extends MessageTree>(reference: T, candidate: MessageTree): T {
  const merged: Record<string, Message | MessageTree> = {};

  for (const key of Object.keys(reference)) {
    const base = reference[key];
    const override = candidate?.[key];

    if (override === undefined) {
      merged[key] = base;
      continue;
    }

    const bothGroups =
      typeof base !== "string" &&
      !isPluralMessage(base) &&
      typeof override !== "string" &&
      !isPluralMessage(override);

    merged[key] = bothGroups
      ? overlay(base as MessageTree, override as MessageTree)
      : override;
  }

  return merged as T;
}
