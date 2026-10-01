export function PromoBanner() {
  return (
    <aside
      data-testid="promo-banner"
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--color-primary)',
        borderRadius: 'var(--radius-md)',
        color: '#ffffff',
      }}
    >
      Launch week: every plan is 20% off.
    </aside>
  );
}
