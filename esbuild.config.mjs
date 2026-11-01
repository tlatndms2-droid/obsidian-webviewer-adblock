import {build} from 'esbuild';
await build({entryPoints:['src/main.ts'],outfile:'main.js',bundle:true,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron','@electron/remote'],sourcemap:false,banner:{js:'/* Webviewer Adblock — GPL-3.0-or-later. Ghostery engine: MPL-2.0; see THIRD_PARTY_NOTICES.md. */'}});
