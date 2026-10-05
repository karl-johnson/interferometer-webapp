# Michelson interferometer web app

Interactive page showing the output pattern of a Michelson interferometer under
polychromatic illumination. Plain static HTML + JavaScript, no build step and no
dependencies.

- `index.html` - page layout
- `interferometer.js` - optics model, colorimetry, and drawing

## Run locally

Open `index.html` in a browser (double-click it). Nothing else is needed.

If you prefer serving it over HTTP, any static server works, e.g.

```
npx http-server .
```

## Deploy with GitHub Pages

1. Commit and push to GitHub:
   ```
   git add .
   git commit -m "Michelson interferometer page"
   git push origin main
   ```
2. On GitHub, open the repository's **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**, then click **Save**.
5. After a minute or so the page is live at
   `https://<your-username>.github.io/<repository-name>/`
   (the URL is also shown at the top of the Pages settings screen).

Every later push to `main` redeploys automatically. Note that Pages on a
private repository requires a paid GitHub plan; on a free plan the repository
must be public.

## Model summary

- Geometric only: each arm's optical path to the screen is computed for an
  ideal spherical (or plane) wave. No diffraction or extended-source effects.
- Input beam: collimated beam through a thin lens of power D (diopters) at the
  beamsplitter, i.e. a point source at distance 1/D. D = 0 is collimated.
- Mirror 2 tilts about its center by (thetaX, thetaY); the reflected beam
  deviates by twice the tilt.
- Spectral intensity at each pixel: `S(lambda) * (1 + cos(2*pi*OPD/lambda)) / 2`.
- RGB: the per-pixel spectrum is integrated against the CIE 1931 color matching
  functions (analytic fit from Wyman, Sloan & Shirley 2013), converted to sRGB,
  and scaled so that a fully bright fringe reaches full scale.
