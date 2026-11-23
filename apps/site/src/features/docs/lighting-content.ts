import type { DocArticle } from './content';

/** Lighting presets, sky, fog and quality profiles: scene settings that change light and resolution, never the models. */
export const lightingArticle: DocArticle = {
  slug: 'lighting', title: 'Lighting and quality', category: 'FOUNDATIONS',
  description: 'Light a scene with a preset, draw a sky gradient, fade distant parts into fog and lower the rendering cost for large scenes: four scene settings that change lights, background and resolution without rebuilding a model.',
  sections: [
    { id: 'settings', title: 'Four settings', paragraphs: [
      'lighting chooses a preset, sky and fog add a backdrop and depth, and quality sets the rendering cost. They are ordinary scene settings: pass them to createSceneStore or store.configure, in every adapter. The defaults (studio, no sky, no fog, high) are the look scenes had before these settings existed.',
    ], code: `const store = createSceneStore(definition, { lighting: 'daylight', sky: true });
store.configure({ lighting: 'dusk', fog: true, quality: 'balanced' });`, language: 'typescript' },
    { id: 'presets', title: 'Lighting presets', headers: ['Preset', 'Look'], rows: [
      ['studio', 'The default: even, bright light from a high sun; the background follows the theme.'],
      ['daylight', 'A high, warm sun with crisp shadows and a blue sky.'],
      ['overcast', 'Soft light from everywhere and faint shadows, for dense scenes where shadows distract.'],
      ['dusk', 'A low orange sun with long shadows and a warm horizon.'],
      ['night', 'Dim blue light and a dark sky.'],
    ], paragraphs: [
      'Each preset sets the ambient and sun light, the tone mapping exposure, the background, and the sky and fog colors, with a light and a midnight variant, so the theme still decides whether the canvas is light or dark. Models keep their materials and palette roles: a preset changes how they are lit, not their colors, and no model is rebuilt.',
    ] },
    { id: 'sky-fog', title: 'Sky and fog', paragraphs: [
      'sky draws a vertical gradient from the preset behind the scene instead of the flat background color. It suits a perspective camera that shows the horizon; under the orthographic overview it is a soft backdrop.',
      'fog fades distant parts into the horizon color with a sky, or into the background color without one. The renderer keeps the area around the camera target clear and sets the fog range from the camera distance every frame, so zooming and orbiting keep the same depth cue. HTML labels and markers are not fogged.',
    ] },
    { id: 'quality', title: 'Quality profiles', headers: ['Quality', 'Highest pixel ratio', 'Shadow map'], rows: [
      ['high', '2', '2048 px, soft edges'],
      ['balanced', '1.5', '1024 px, soft edges'],
      ['low', '1', '512 px, hard edges'],
    ], paragraphs: [
      'quality lowers the cost of drawing for large scenes, high-resolution screens and weak devices: the canvas draws at most at the profile\'s pixel ratio (the display ratio when it is lower), and the sun\'s shadow map is smaller. It never changes what the scene shows; shadows stay on unless shadows is false. Switch to balanced or low when getDiagnostics() or useRendererFps reports a low frame rate.',
    ] },
    { id: 'preview', title: 'Node previews', paragraphs: [
      'createNodePreview and NodePreview light the copy with the same preset and theme as the scene and follow its quality\'s pixel ratio. Their canvas stays transparent: no sky or fog.',
    ] },
    { id: 'command-line', title: 'From the command line', paragraphs: [
      'opsorama render takes the settings from a JSON file, so a scene can be checked in each preset: opsorama render scene.json --settings dusk.json with { "lighting": "dusk", "sky": true, "fog": true, "camera": { "projection": "perspective" } }.',
    ] },
  ],
};
