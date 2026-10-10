# Third-party notices

WildQuest AI is built on open-source software and an open-weight model. Please keep these notices when redistributing.

| Component | License | Notes |
|---|---|---|
| [CLIP](https://github.com/openai/CLIP) by OpenAI | MIT | Model architecture and original weights |
| [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) | follows the base model (MIT) | ONNX conversion of `openai/clip-vit-base-patch32`; downloaded by users from Hugging Face at runtime, not bundled |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | In-browser inference API |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT | WASM runtime, self-hosted from `public/ort` (copied from `node_modules` at install) |
| Next.js, React | MIT | |
| Tailwind CSS | MIT | |
| Dexie | Apache-2.0 | IndexedDB wrapper |
| lucide-react | ISC | Icons |
| Inter | SIL Open Font License 1.1 | Loaded with `next/font` |
| Vitest, Playwright, tsx, sharp, fake-indexeddb | MIT / Apache-2.0 | Dev and test tooling |

Evaluation photographs come from Wikimedia Commons and are used only to test the app. Each keeps its own license: see `eval/dev/CREDITS.md` and `eval/heldout/CREDITS.md`.

Verify current license texts in each package before redistribution.
