// boot-consts — BUILD-TIME BAKED values for the boot banner.
// The ROM value is computed at BUILD TIME by scripts/measure-rom.mjs
// (iterate git-ls-files, sum bytes, exclude build/lock/cache artifacts)
// and written into boot-consts.json. The MEM value is a runtime
// (Chromium performance.memory) in the Svelte component.
//
// The displayed version is a SEMVER BAKED constant in the banner
// (v0.1.0). The JSON-epoch in _app/version.json stays for cache busting —
// the two are independent.
import raw from './boot-consts.json';

export const ROM_BYTES: number = raw.romBytes;
export const ROM_KIB: number = raw.romKiB;
export const SRC_FILES: number = raw.srcFiles;
export const XTERM_VERSION: string = raw.xtermVersion;

// Baked semantic version (displayed in the banner; the JSON epoch stays for
// cache busting — the two are independent).
export const DISPLAY_VERSION = 'v0.1.0';

// GATE: the client gate's own name (the host list appears in the GATE cell
// ONLY — never on the module rows).
export const GATE_DISPLAY = 'hermes,127.0.0.1';

// LINK: display-only mirror of llm.ts LLM_VLLM_BASE (the vLLM host:port; the
// banner's LINK cell). Do not change without also changing the server.
export const LINK_DISPLAY = '10.240.232.32:8000';
