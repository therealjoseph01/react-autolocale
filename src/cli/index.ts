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

function addSwitcher(root: string, args: string[]): void {
  const dir = path.resolve(root, flag(args, "--dir") ?? (fs.existsSync(path.join(root, "src")) ? "src/components" : "components"));
  const ts = fs.existsSync(path.join(root, "tsconfig.json"));
  const file = path.join(dir, ts ? "LanguageSwitcher.tsx" : "LanguageSwitcher.jsx");
  if (fs.existsSync(file)) throw new Error(`${path.relative(root, file)} already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, ts ? TSX : JSX);
  console.log(`Created ${path.relative(root, file)}\nImport it anywhere: import { LanguageSwitcher } from "./components/LanguageSwitcher";`);
}

try {
  const [cmd, what, ...rest] = process.argv.slice(2);
  if (cmd === "init") init(process.cwd());
  else if (cmd === "add" && what === "switcher") addSwitcher(process.cwd(), rest);
  else {
    console.log(HELP);
    if (cmd) process.exitCode = 1;
  }
} catch (err) {
  console.error(`react-autolocale: ${(err as Error).message}`);
  process.exit(1);
}
