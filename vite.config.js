/// <reference types="vitest" />

import { resolve, relative } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import dts from 'vite-plugin-dts';
import check from 'vite-plugin-checker';

import { dependencies, peerDependencies } from './package.json';

const deps = Object.keys({ ...peerDependencies, ...dependencies });
// matches all strings that are the name of dependency OR are its subpath (e.g. 'foo' or 'foo/index.js')
const externals = deps.length
    ? new RegExp(`${deps.map(name => `^${name}$|^${name}\/`).join('|')}`)
    : /^$/;

export default defineConfig(({ command, mode }) => {
    const isBuildMode = command === 'build';
    const isEsmBuild = isBuildMode && mode === 'esm';

    return {
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src'),
            },
        },
        plugins: [
            tsconfigPaths({ loose: true }),
            check({ typescript: true }),
            isEsmBuild && dts({ insertTypesEntry: true, outDir: 'dist/esm/src' }),
        ],
        test: {
            environment: 'node',
        },
        build: {
            target: 'esnext',
            sourcemap: true,
            minify: false,
            // https://vitejs.dev/guide/build.html#library-mode
            lib: {
                entry: resolve(__dirname, 'src/index.ts'),
                name: 'JsonStreamBuilder',
                fileName: 'json-stream-builder',
                formats: ['es'],
            },
            rollupOptions: {
                external: id => externals.test(id),
                output: {
                    dir: 'dist/esm',
                    preserveModules: true,
                    entryFileNames: entry => {
                        return relative(__dirname, entry.facadeModuleId || entry.name)
                            .replace(/(\?.*)?$/, '')
                            .replace(/(\.\w+)?$/, '.js')
                            .replace('\x00', '');
                    },
                },
            },
        },
    };
});
