/** Uncompressed IBFILES planes. Sizes are format contracts, not display settings. */
export const HUD_ASSETS = {
  boards: 61440,
  damslid: 576,
  'own-num1': 22528,
  'oth-num1': 12672,
  bignum6: 880,
  smalfo4a: 2304,
  sidebom1: 48,
  rasti1: 2048,
  goalnum2: 616,
  'dam-kup': 32256,
  'dam-pic': 32256,
  'dam-sed': 32256,
  'dam-cam': 32256,
  'dam-por': 32256,
  'dam-lot': 32256,
} as const;
export type HudAssetName = keyof typeof HUD_ASSETS;
export type HudAssets = ReadonlyMap<HudAssetName, Uint8Array>;
export const DAMAGE_SPRITES: Readonly<Record<string, HudAssetName>> = {
  kupla: 'dam-kup',
  pickup: 'dam-pic',
  sedan: 'dam-sed',
  camaro: 'dam-cam',
  porche: 'dam-por',
  lotus: 'dam-lot',
};
