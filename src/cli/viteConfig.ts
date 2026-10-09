const IMPORT_LINE = `import reactAutolocale from "react-autolocale/vite";`;

/** Adds the react-autolocale plugin to a vite.config source string. Returns null if it can't be done safely. */
export function patchViteConfig(source: string): { code: string; changed: boolean } | null {
  if (source.includes("react-autolocale/vite")) return { code: source, changed: false };

  let code = source;
  if (/plugins\s*:\s*\[/.test(code)) {
    code = code.replace(/plugins\s*:\s*\[/, "plugins: [reactAutolocale(), ");
  } else if (/defineConfig\(\s*\{/.test(code)) {
    code = code.replace(/defineConfig\(\s*\{/, "defineConfig({\n  plugins: [reactAutolocale()],");
  } else if (/export\s+default\s*\{/.test(code)) {
    code = code.replace(/export\s+default\s*\{/, "export default {\n  plugins: [reactAutolocale()],");
  } else {
    return null;
  }

  const imports = [...code.matchAll(/^import[^\n]*$/gm)];
  const last = imports[imports.length - 1];
  if (last) {
    const at = last.index! + last[0].length;
    code = code.slice(0, at) + "\n" + IMPORT_LINE + code.slice(at);
  } else {
    code = IMPORT_LINE + "\n" + code;
  }
  return { code, changed: true };
}
