/** Scheme styles, kept apart from the colour library so build-time code can list them. */
export const variants = {
  tonalSpot: { label: 'Tonal spot (Android default)' },
  neutral: { label: 'Neutral' },
  vibrant: { label: 'Vibrant' },
  expressive: { label: 'Expressive' },
  fidelity: { label: 'Fidelity (close to the seed)' },
  content: { label: 'Content' },
  monochrome: { label: 'Monochrome' },
  rainbow: { label: 'Rainbow' },
  fruitSalad: { label: 'Fruit salad' },
} as const;

export type Variant = keyof typeof variants;
