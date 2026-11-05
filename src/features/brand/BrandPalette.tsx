import palette from '@/features/brand/palette.json';

/** Website identity swatches; these do not configure renderer materials or host UI themes. */
export function BrandPalette() {
  return <section className="brand-palette" aria-label="Example website color palette">
    {Object.entries(palette.families).map(([family, steps]) => <div className="brand-palette-family" key={family}>
      <h2>{family[0].toUpperCase() + family.slice(1)}</h2>
      <div className="brand-palette-steps">{Object.entries(steps).map(([step, hex]) => <div className="brand-palette-step" key={step}>
        <span className="brand-palette-chip" style={{ backgroundColor: hex }} aria-hidden="true" />
        <strong>{step}</strong><code>{hex}</code>
      </div>)}</div>
    </div>)}
  </section>;
}
