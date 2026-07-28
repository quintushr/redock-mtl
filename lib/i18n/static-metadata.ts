import { messages } from "./messages/fr";

/**
 * The page title and description, in the default language.
 *
 * The one place in this codebase that names a language and receives its
 * wording, and it is confined to `app/layout.tsx` by `eslint.config.mjs`.
 *
 * Why it has to exist: a static export ships one document, so that document's
 * metadata has one language. There is no server to negotiate with, and the
 * clarified scope of this feature keeps a single URL rather than one per
 * language. The interface switches language in the browser and moves the
 * document's `lang` as it goes; the metadata a crawler or a share card reads
 * stays French.
 *
 * Why nothing else may import it: everything a rider interacts with must follow
 * the language they chose. If you are reaching for this from a component, you
 * want `useStrings()` (FR-202, FR-202a).
 */
export const STATIC_METADATA = {
  title: messages.app.title,
  description: messages.app.description,
} as const;
