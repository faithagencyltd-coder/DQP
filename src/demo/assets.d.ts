declare module 'virtual:planora-demo-assets' {
  /** Contenus compressés (gzip) encodés en base64 : moteur PGlite, extension pgcrypto, base de départ. */
  const assets: { wasm: string; data: string; pgcrypto: string; seed: string };
  export default assets;
}
