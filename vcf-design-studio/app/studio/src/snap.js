// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
/** A short, stable fingerprint of a value, to tell later whether a section was changed (the easy button's record). */
export const snapOf = (x         ) => { const s = JSON.stringify(x); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
