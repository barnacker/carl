// faculties/dash/rom.ts — dist footprint (KiB) + live RSS (MiB) for the tree.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** total size of the compiled server bundle (dist) in whole KiB. */
export async function carlRomKib() {
    const dir = path.resolve(__dirname, '..', '..', 'dist');
    let bytes = 0;
    const walk = async (d) => {
        let ents;
        try {
            ents = await readdir(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                await walk(p);
            else {
                try {
                    bytes += (await stat(p)).size;
                }
                catch { /* skip */ }
            }
        }
    };
    await walk(dir);
    return Math.max(1, Math.ceil(bytes / 1024));
}
/** current process RSS in MiB (one decimal). */
export function carlProcessMemMib() {
    return process.memoryUsage().rss / (1024 * 1024);
}
