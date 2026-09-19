# Cassiopeia Three renderer

WebGL stage, notes, ribbons, original effect reconstruction, HUD and sprite
atlases. Gameplay remains in the kernel; source-game metadata and frame policy
come from the Our Notes plugin.

Install `createThreeRendererPlugin()` in a `CassiopeiaRuntime` and obtain
`THREE_RENDERER`. Its `create(options)` factory returns `OurNotesRenderer`.
The caller supplies canvases/assets, feeds render frames, and calls `dispose`.
The factory does not choose asset paths, load a chart or run its own game clock.

`ParticleLayer` and `LiveUrpBloomPipeline` are also exported for offline effect
capture. Instanced batches and bounded emission history keep allocation bounded.
The original native simulation remains the behavioral reference.

```sh
pnpm --filter @haneoka/cassiopeia-renderer-three check
```

License: MPL-2.0; Three is a peer dependency. No Vue or Sonolus runtime is required.
