# F1 Circuit Gen

A browser-based 3D arcade F1 racing game built with [Three.js](https://threejs.org/) and [cannon-es](https://github.com/pmndrs/cannon-es). Pure static HTML/CSS/JS — no build step or bundler; Three.js and cannon-es load at runtime from a CDN via the import map in `index.html`.

## Running it

Serve the directory over HTTP and open it in a browser — ES module imports and the CDN import map require `http(s)://`, not `file://`:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/index.html`.

## Features

- Procedurally generated tracks (seeded, so a given seed always reproduces the same layout) plus a set of hand-authored real-world circuit layouts
- Single race and season modes with an AI grid, qualifying, and points standings
- Tyre compounds (Soft/Medium/Hard/Rally) with grip and wear tuned per compound, plus pit stops
- Rally mode with weather/surface effects (snow, mud) alongside the standard tarmac tracks
- Slipstream drafting, dynamic AI overtaking, and a minimap
