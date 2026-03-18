# UI hygiene baseline (universal)

This is the “always remember” baseline for coherent, modern UI. It is intentionally short and applies unless the project context overrides it.

## Consistency

- Use a single design system per product by default (tokens + component patterns).
- Avoid one-off styling unless it’s a deliberate exception (record rationale).

## Clarity

- Every screen has one clear primary action.
- Labels and copy are specific; avoid generic “Submit”.
- Error/empty/loading states exist and are readable.

## Layout

- Use a spacing rhythm (e.g., 4/8 grid) and consistent max widths.
- Avoid dense walls of UI; prioritize whitespace and hierarchy.

## Typography

- Use a small type scale (3–6 sizes) with consistent weights.
- Avoid mixing many fonts/weights/sizes without purpose.

## Interaction quality

- Forms validate inline where helpful; don’t surprise users at submit time.
- Focus states and keyboard behavior aren’t broken (accessibility is secondary, but basic usability matters).

