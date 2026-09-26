export const resolve = (...args: string[]): string =>
  args.filter(Boolean).join("/");
export const isAbsolute = (): boolean => false;
export const dirname = (p: string): string =>
  p.split("/").slice(0, -1).join("/") || ".";
export const relative = (_from: string, to: string): string => to;
export const sep = "/";
export const join = (...args: string[]): string =>
  args.filter(Boolean).join("/");

export class SourceMapConsumer {
  public destroy(): void {
    // no-op stub for browser
  }
}

export class SourceMapGenerator {
  public toString(): string {
    return "";
  }
}

export const fileURLToPath = (u: string): string => u;
export const pathToFileURL = (p: string): URL => new URL(`file://${p}`);

export const existsSync = (): boolean => false;
export const readFileSync = (): string => "";
export const realpathSync = (p: string): string => p;

export default {
  resolve,
  isAbsolute,
  dirname,
  relative,
  sep,
  join,
  SourceMapConsumer,
  SourceMapGenerator,
  fileURLToPath,
  pathToFileURL,
  existsSync,
  readFileSync,
  realpathSync,
};
