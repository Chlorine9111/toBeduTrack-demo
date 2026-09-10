// sharp is an optional runtime dependency used only by image-processing scripts.
// Keep a narrow ambient declaration so regular typecheck/build does not fail when
// the package is not installed in local app environments.
declare module "sharp" {
  interface SharpInstance {
    extract(region: {
      left: number;
      top: number;
      width: number;
      height: number;
    }): SharpInstance;
    png(): SharpInstance;
    toBuffer(): Promise<Buffer>;
  }

  function sharp(input: Buffer | string): SharpInstance;

  export default sharp;
}
