# Fixed circuit source and includes

The three Privacy Pools circuit templates and original build inputs are retained under `privacy-pools-core/packages/circuits`, from upstream version v1.3.0 / commit `c312dcd58f6ad085204be61923c49f8065e4e9ae`, under their original Apache-2.0 license. Their transitive circomlib includes are separately retained under `circomlib/2.0.5`, with the original GPL declaration, original headers/README and an explicitly labeled full GPL text supplement. Do not label circomlib Apache.

The circomlib archive matches the original Privacy Pools yarn lock SHA-512; its source provenance records the complete eight-file include closure. For an independent circuit build, materialize the supplied circomlib directory into the generated build location `privacy-pools-core/node_modules/circomlib` so the unchanged `../../../node_modules/circomlib/circuits/...` includes resolve. This is a targeted copy of the enumerated source package, not a copy of any local node_modules tree. The archive need not contain that generated directory.

The original `src/index.ts` is the build driver for `Withdraw(32)`, including its public signals. `circuits.json` alone does not describe that withdrawal build. Circuit pragmas and the public artifact manifest require Circom 2.2.0, while an upstream circomkit config field says 2.1.2; preserve and resolve this toolchain discrepancy when independently rebuilding rather than silently changing circuit source.

The client consumes six existing public proof artifacts identified in `proof-artifacts/MANIFEST.json`. Source inclusion and checksum correspondence do not mean the trusted setup ceremony has been reproduced.
