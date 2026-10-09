#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { patchViteConfig } from "./viteConfig.js";

const HELP = `react-autolocale

Usage:
  react-autolocale init
      Adds the plugin to your vite.config for you.
  react-autolocale add switcher [--dir src/components]
      Copies an editable <LanguageSwitcher /> into your project.
  react-autolocale add banner [--dir src/components]
      Copies an editable <LanguageBanner /> (suggests the visitor's browser language) into your project.
`;

const TSX = `import { useLanguage } from "react-autolocale";

// This file is yours: change the markup, style it, or replace it entirely.
export function LanguageSwitcher() {
  const { language, languages, setLanguage } = useLanguage();
  return (
    <div role="group" aria-label="Language">
      {languages.map((l) => (
        <button
          key={l.code}
          lang={l.code}
          aria-pressed={l.code === language}
          onClick={() => setLanguage(l.code)}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}
`;

const JSX = TSX;

const BANNER_TSX = `import { useLanguageSuggestion } from "react-autolocale";

// This file is yours: change the markup, style it, or replace it entirely.
// It renders nothing unless the visitor's browser language differs from this page's language.
export function LanguageBanner() {
  const suggestion = useLanguageSuggestion();
  if (!suggestion) return null;
  return (
    <div role="region" aria-label={suggestion.native}>
      <span>{suggestion.text}</span>
      <button onClick={suggestion.accept}>{suggestion.switchLabel}</button>
      <button onClick={suggestion.dismiss}>{suggestion.dismissLabel}</button>
    </div>
  );
}
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

const NEXT_STEP = `
Next, wrap your app once (for example in main.tsx):

  import { AutoScale } from "react-autolocale";

  <AutoScale original="en" languages={["fr", "es"]}>
    <App />
  </AutoScale>

Then run your build.`;

function init(root: string): void {
  const file = VITE_CONFIGS.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error("No vite.config found. This package works with Vite projects.");
  const name = path.basename(file);
  const patched = patchViteConfig(fs.readFileSync(file, "utf8"));
  if (!patched) {
    throw new Error(
      `Could not edit ${name} automatically. Add this yourself:\n  import reactAutolocale from "react-autolocale/vite";\n  plugins: [reactAutolocale(), ...]`,
    );
  }
  if (patched.changed) fs.writeFileSync(file, patched.code);
  console.log(patched.changed ? `Added the react-autolocale plugin to ${name}.` : `${name} already uses react-autolocale.`);
  console.log(NEXT_STEP);
}

function addComponent(root: string, args: string[], name: "LanguageSwitcher" | "LanguageBanner"): void {
  const dir = path.resolve(root, flag(args, "--dir") ?? (fs.existsSync(path.join(root, "src")) ? "src/components" : "components"));
  const ts = fs.existsSync(path.join(root, "tsconfig.json"));
  const file = path.join(dir, ts ? `${name}.tsx` : `${name}.jsx`);
  if (fs.existsSync(file)) throw new Error(`${path.relative(root, file)} already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, name === "LanguageBanner" ? BANNER_TSX : ts ? TSX : JSX);
  console.log(`Created ${path.relative(root, file)}\nImport it anywhere: import { ${name} } from "./components/${name}";`);
}

try {
  const [cmd, what, ...rest] = process.argv.slice(2);
  if (cmd === "init") init(process.cwd());
  else if (cmd === "add" && what === "switcher") addComponent(process.cwd(), rest, "LanguageSwitcher");
  else if (cmd === "add" && what === "banner") addComponent(process.cwd(), rest, "LanguageBanner");
  else {
    console.log(HELP);
    if (cmd) process.exitCode = 1;
  }
} catch (err) {
  console.error(`react-autolocale: ${(err as Error).message}`);
  process.exit(1);
}
