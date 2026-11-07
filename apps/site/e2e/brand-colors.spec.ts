import { expect, test } from './fixtures';

// Solid-color text in actual rendered website surfaces, including inherited backgrounds.
// Scene canvas pixels, palette swatches, gradients, and disabled controls are outside this check.
for (const width of [1440, 360]) {
  test(`Cornflower website colors and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/brand', '/docs/concepts', '/docs/objects', '/docs/zoom-control', '/examples']) {
      await page.goto(route);
      await expect(page.locator('.kit-site-brand')).toContainText('Opsorama');
      if (route === '/brand') {
        await expect(page.getByRole('heading', { name: 'Website brand & colors', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Object and scene colors', exact: true })).toBeVisible();
        await expect(page.getByText(/company brand colors/)).toBeVisible();
        await expect(page.locator('.brand-palette-chip')).toHaveCount(48);
        await expect(page.locator('.docs-sidebar')).toHaveCount(0);
      } else {
        await expect(page.locator('footer').getByRole('link', { name: 'Website colors', exact: true })).toHaveAttribute('href', '/brand');
      }
      if (route.startsWith('/docs/')) await expect(page.getByRole('navigation', { name: 'Documentation sections' }).locator('a[href*="brand"]')).toHaveCount(0);
      if (route === '/docs/objects') await expect(page.locator('.object-card').first()).toBeVisible();
      const result = await page.evaluate(() => {
        const rgb = (value: string) => value.match(/[\d.]+/g)?.map(Number) || [];
        const luminance = (channels: number[]) => channels.slice(0, 3).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
        const failures: string[] = [];
        let checked = 0;
        const elements = document.querySelectorAll('.kit-site-header a, .docs-lead, .docs-section p, .docs-section li, .docs-code-block pre, .docs-sidebar a, .docs-reference-table td, .docs-article-meta span, .object-card-info h3, .object-card-info p, .object-card-info span, .object-categories button, .examples-card p, .examples-card a, .examples-preview-note, .zoom-stage-note, .zoom-config-hint, .zoom-config-bar button, .zoom-config-form label, .website-brand-content p, .website-color-roles dd, .site-footer-links a');
        for (const element of elements) {
          if (!(element instanceof HTMLElement) || element.getBoundingClientRect().height === 0 || !element.textContent?.trim() || element.matches(':disabled')) continue;
          const style = getComputedStyle(element);
          if (style.opacity !== '1') continue;
          const foreground = rgb(style.color);
          if (foreground.length < 3 || (foreground.length === 4 && foreground[3] !== 1)) continue;
          let ancestor: Element | null = element;
          let background = [255, 255, 255];
          while (ancestor) {
            const candidate = rgb(getComputedStyle(ancestor).backgroundColor);
            if (candidate.length === 3 || (candidate.length === 4 && candidate[3] === 1)) { background = candidate; break; }
            ancestor = ancestor.parentElement;
          }
          const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          const ratio = (light + .05) / (dark + .05);
          checked++;
          if (ratio < 4.5) failures.push(`${element.className || element.tagName}: ${ratio.toFixed(2)}:1 — ${element.textContent.trim().slice(0, 65)}`);
        }
        return { checked, failures, width: document.documentElement.scrollWidth, viewport: innerWidth, primary: getComputedStyle(document.documentElement).getPropertyValue('--opsorama-primary').trim() };
      });
      expect(result.checked, route).toBeGreaterThan(5);
      expect(result.failures, route).toEqual([]);
      expect(result.width, route).toBeLessThanOrEqual(result.viewport);
      expect(result.primary.toLowerCase()).toBe('#4c70a6');
      if (route === '/brand' || route === '/docs/concepts') await page.screenshot({ path: `artifacts/brand/${route.split('/').pop()}-${width}.png`, fullPage: true });
    }
    await page.goto('/docs/brand');
    await expect(page).toHaveURL(/\/brand$/);
    expect(errors).toEqual([]);
  });
}
