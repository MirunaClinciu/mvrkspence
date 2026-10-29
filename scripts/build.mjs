import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (output !== resolve(root, 'dist') || !output.startsWith(`${root}${sep}`)) {
    throw new Error('The public output directory must remain inside this project.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const publicFiles = ['index.html', 'coming-soon.html', 'artwork.html', 'concept.html', 'contact.html', 'robots.txt', 'preview', 'admin', 'manage', 'stuff', 'content', 'uploads'];
for (const file of publicFiles) {
    const source = resolve(root, file);
    try { await stat(source); }
    catch (error) {
        if (file === 'uploads' && error.code === 'ENOENT') continue;
        throw error;
    }
    await cp(source, resolve(output, file), { recursive: true });
}
console.log('Built public website in dist; server code and dependencies are excluded.');
