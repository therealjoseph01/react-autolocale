import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getLanguage } from "./languages.js";

export interface Translator {
  translate(texts: string[], from: string, to: string): Promise<string[]>;
}

type Engine = typeof import("@huggingface/transformers");

const ENGINE_PACKAGE = "@huggingface/transformers@^4.3.1";
const ENGINE_DIR = path.join(os.homedir(), ".cache", "react-autolocale", "engine");

/**
 * Finds the translation engine. Uses the project's own copy if it has one; otherwise installs it once
 * into ~/.cache/react-autolocale/engine (shared by all projects, never touches the project's node_modules).
 */
async function loadEngine(log: (msg: string) => void): Promise<Engine> {
  try {
    return await import("@huggingface/transformers");
  } catch {
    /* not installed in the project, use the private copy */
  }
  const require = createRequire(path.join(ENGINE_DIR, "package.json"));
  const find = () => require.resolve("@huggingface/transformers");
  let entry: string;
  try {
    entry = find();
  } catch {
    log("[react-autolocale] Installing the translation engine (one time, about 440 MB)...");
    fs.mkdirSync(ENGINE_DIR, { recursive: true });
    const pkg = path.join(ENGINE_DIR, "package.json");
    if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: "react-autolocale-engine", private: true }));
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const res = spawnSync(npm, ["install", "--prefix", ENGINE_DIR, "--no-audit", "--no-fund", "--loglevel=error", ENGINE_PACKAGE], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    try {
      if (res.status !== 0) throw new Error("npm failed");
      entry = find();
    } catch {
      throw new Error(
        `Could not install the translation engine automatically. Install it yourself: npm install -D @huggingface/transformers`,
      );
    }
  }
  const mod = await import(pathToFileURL(entry).href);
  return (mod.pipeline ? mod : mod.default) as Engine;
}

type Pipe = (input: string[], options?: Record<string, unknown>) => Promise<{ translation_text: string }[]>;

const NLLB_MODEL = "Xenova/nllb-200-distilled-600M";
// One string per call: batched NLLB generation with padding produced runaway garbage after the real translation.
const BATCH = 1;

/**
 * Free, offline translation using Transformers.js (ONNX models run on the CPU).
 * Models are downloaded once from Hugging Face and cached in ~/.cache/react-autolocale.
 * English -> X uses small per-language OPUS-MT models where they exist; everything else uses NLLB-200.
 */
export function createLocalTranslator(log: (msg: string) => void = () => {}): Translator {
  const pipes = new Map<string, Promise<Pipe>>();
  let hf: Promise<Engine> | null = null;

  const getPipe = (model: string): Promise<Pipe> => {
    let p = pipes.get(model);
    if (!p) {
      hf ??= loadEngine(log).then((m) => {
        m.env.cacheDir = path.join(os.homedir(), ".cache", "react-autolocale", "models");
        return m;
      });
      log(`Loading model ${model} (first run downloads it)...`);
      let lastPct = -10;
      p = hf.then((m) =>
        m.pipeline("translation", model, {
          dtype: "q8",
          progress_callback: (e: any) => {
            if (e.status === "progress" && e.progress - lastPct >= 10) {
              lastPct = e.progress;
              log(`  downloading ${e.file}: ${Math.round(e.progress)}%`);
            }
          },
        } as any),
      ) as unknown as Promise<Pipe>;
      pipes.set(model, p);
    }
    return p;
  };

  const run = async (model: string, texts: string[], options: Record<string, unknown>): Promise<string[]> => {
    const pipe = await getPipe(model);
    const out: string[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const res = await pipe(texts.slice(i, i + BATCH), { max_new_tokens: 256, ...options });
      out.push(...res.map((r) => r.translation_text.trim()));
    }
    return out;
  };

  return {
    async translate(texts, from, to) {
      const src = getLanguage(from);
      const dst = getLanguage(to);
      if (!src || !dst) throw new Error(`Unsupported language: ${!src ? from : to}`);
      if (from === "en" && dst.opus) {
        try {
          return await run(`Xenova/opus-mt-en-${dst.opus}`, texts, {});
        } catch (err) {
          log(`  OPUS-MT model for "${to}" unavailable (${(err as Error).message}); falling back to NLLB.`);
        }
      }
      return run(NLLB_MODEL, texts, { src_lang: src.nllb, tgt_lang: dst.nllb });
    },
  };
}

const token = (i: number) => `X${i}X`;

/** Swaps excluded phrases for placeholders so the model leaves them alone. */
export function mask(text: string, exclude: string[]): { masked: string; phrases: string[] } {
  const phrases: string[] = [];
  let masked = text;
  for (const phrase of [...exclude].sort((a, b) => b.length - a.length)) {
    if (!phrase || !masked.includes(phrase)) continue;
    masked = masked.split(phrase).join(token(phrases.length));
    phrases.push(phrase);
  }
  return { masked, phrases };
}

/** Puts excluded phrases back. Returns null if the model dropped or mangled a placeholder. */
export function unmask(translated: string, phrases: string[]): string | null {
  let out = translated;
  for (let i = 0; i < phrases.length; i++) {
    if (!out.includes(token(i))) return null;
    out = out.split(token(i)).join(phrases[i]!);
  }
  return /X\d+X/.test(out) ? null : out;
}
