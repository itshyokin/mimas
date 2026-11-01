/** three.js ships the Meshopt decoder without types (Update 158). */
declare module 'three/examples/jsm/libs/meshopt_decoder.module.js' {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decodeGltfBuffer(target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter: string): void;
  };
}
