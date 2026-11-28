// Places in the page that an optional layer can fill (today: the AI-powered edition's copilot and HLD drafts).
// Empty by default, so the classic page renders without loading any of that layer's code. No DOM here.
import type { Design } from "../../engine/src/index.ts";

export const slots = {
  /** Extra cards under the live summary. */
  summary: (): string => "",
  /** Extra cards on the Design output page, above the HLD preview. */
  output: (_d: Design): string => "",
  /** Called before and after each render (e.g. to keep focus in a text box the render replaces). */
  beforeRender: (): unknown => undefined,
  afterRender: (_state: unknown): void => {},
};
