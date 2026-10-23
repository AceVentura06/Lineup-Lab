import tailwind from "@tailwindcss/postcss";
import prefixer from "postcss-prefix-selector";

// Everything Tailwind and Bklit emit is scoped under .ll-island, so none of it can
// touch the rest of the site (no preflight, and utility classes only match inside charts).
const SCOPE = ".ll-island";

export default {
  plugins: [
    tailwind(),
    prefixer({
      prefix: SCOPE,
      transform(prefix, selector, prefixed) {
        if (selector.startsWith(SCOPE)) return selector;
        if (selector === ":root" || selector === ":host") return SCOPE;
        if (selector === ".dark") return `:root[data-theme="dark"] ${SCOPE}`;
        return prefixed;
      },
    }),
  ],
};
