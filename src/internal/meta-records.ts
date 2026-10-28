/** @internal @packageDocumentation */

export const merge = (src: Record<string, any>, dst: Record<string, any>) => {
  for (const key in src) {
    if (!(key in dst)) {
      dst[key] = src[key];
    } else if (Array.isArray(dst[key])) {
      dst[key].push(...src[key]);
    }
  }
};
