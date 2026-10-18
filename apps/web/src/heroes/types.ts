import type { StageLayout } from '../motion/useInView';

/** What every hero scene receives on each frame. */
export interface SceneProps {
  /** Loop progress in [0, 1). */
  readonly t: number;
  /** Completed loops (used to vary details between loops). */
  readonly cycle: number;
  /** "wide" (16:9) or "tall" (portrait) composition. */
  readonly layout: StageLayout;
  /** Small home-page preview: drop secondary labels. */
  readonly mini?: boolean;
  /** Real values when a scene is the live status of a job (otherwise the demo story's own values). */
  readonly live?: SceneLive;
}

export interface SceneLive {
  /** Recipient as shown to the user, e.g. "@juno". */
  readonly name?: string;
  /** Amount with its asset, e.g. "120 USDT". */
  readonly amount?: string;
  /** Deposits in the pool right now. */
  readonly poolCount?: number;
  /** Sealed bids in the sale right now. */
  readonly bids?: number;
  /** Sale jobs: 0 bidding, 1 opening, 2 waiting for the result, 3 settled. */
  readonly saleStage?: number;
}

export const VIEW = {
  wide: { w: 640, h: 360 },
  tall: { w: 360, h: 480 },
} as const;

export const viewBox = (layout: StageLayout): string => `0 0 ${VIEW[layout].w} ${VIEW[layout].h}`;
