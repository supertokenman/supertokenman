# Halftone of a real screenshot

Idea (seen on skill-issue.in): show the product as a dot field instead of a flat screenshot, so the hero
feels made rather than pasted, with the accent only on the part that matters. Ours must start from a
REAL screenshot (`site/assets/*.jpg` or `scripts/shots.mjs` output), never a generated picture.

## Component

`components/halftone.js` (about 2 KB gzip, no libraries):

```html
<figure class="halftone" data-halftone="assets/panels.jpg" data-cell="6"
        data-accent="0.57,0.8,0.22,0.1" role="img" aria-label="The app with panels side by side"></figure>
```

- Reads the image into a canvas of one pixel per dot, takes luminance, and treats the most common tone
  (the screenshot's own background) as empty. Dot radius grows with the distance from that tone, so dark
  and light app themes both work and the page's own background shows through.
- `data-accent`: boxes in image fractions (`x,y,w,h;x,y,w,h`) drawn in `--accent`; everything else in
  `--ink`. Pick the one thing the section talks about (the link line, the meter, an approval card).
- Grows in once when first seen; still with reduced motion. Redraws on resize and theme change.
- Image must be same-origin (it is, we host everything) or the canvas cannot read it.

## Making it read well

- Crop first. A whole window at 6px cells is texture; a cropped panel reads as the product.
- Cell 5-8px on desktop; on phones fewer columns, so crop tighter rather than shrinking cells below 4px.
- Prefer screenshots with clear shapes (cards, the meter, the panel borders). Fine text turns into noise.
- Keep one real, sharp screenshot nearby (or on click) so nobody has to guess what the product looks like.
- The dot field is decoration for a picture that exists elsewhere, or it is the picture: then it needs
  the `role="img"` label describing the real screen.

## Static alternative

For a social image or when JS is not wanted, make it once offline (Python Pillow: resize to the dot grid,
draw circles) and ship a PNG/WebP under the 150 KB budget, or an SVG of circles if it compresses smaller.
