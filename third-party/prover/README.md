# Fixed prover corresponding source

The `packages/` directory preserves nine exact upstream GPL package/version source and build-input snapshots. Each `SOURCE-PROVENANCE.json` identifies its immutable commit, original notices, lockfile inputs and per-file hashes. Sources are unchanged. Third-party GPL version grants remain as written in their original headers; HushCross does not replace them.

`snarkjs` 0.7.5 is pinned to upstream commit `0e0126f427f5c2c8ec753bc0d60dfacc6afece16`. Its released browser runtime is SHA-256 `3bf5b5123047ed9187baa7d4c11285019f09fbed88a28693984ed9dd0508466a`. The client build uses these fixed released bytes.

To rebuild the upstream browser targets separately, review the preserved source/build inputs, restore the source package's original dependency lock with `npm ci --ignore-scripts`, then run the original `buildiife` and `buildiifemin` scripts in `packages/snarkjs-0.7.5`. These are upstream build definitions, not a guarantee of byte-identical output on every toolchain. The package's unrelated legacy `buildesm` command omits the `.js` extension in its config argument; the supplied config itself is preserved.

`runtime-restore/` records the installed prover wrapper graph, which is not identical to the historical source package build lock. `RUNTIME-DEPENDENCIES.json` and `licenses/runtime/` preserve its original declarations. Additional original Apache license files for filelist and jake are supplied in the sibling npm-licenses directory. GPL text supplements for packages whose exact upstream release omits standalone COPYING are identified explicitly, without replacing source headers.

Public proving parameters are not a new trusted setup. Keep the public artifact manifest and fixed keys; do not substitute new ceremony output for the existing deployment.
