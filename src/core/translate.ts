import os from "node:os";
import path from "node:path";
import { getLanguage } from "./languages.js";

export interface Translator {
  translate(texts: string[], from: string, to: string): Promise<string[]>;
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
  let hf: Promise<typeof import("@huggingface/transformers")> | null = null;

  const getPipe = (model: string): Promise<Pipe> => {
    let p = pipes.get(model);
    if (!p) {
      hf ??= import("@huggingface/transformers").then((m) => {
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
