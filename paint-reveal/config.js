/**
 * Configuration par défaut pour PaintReveal
 * Code splitting: séparé pour faciliter la maintenance et le tree-shaking
 */

export const defaultConfig = {
    // GLOBAL SCALE - Contrôle la taille générale de l'effet
    globalScale: 3.0,

    // MACRO LAYER - Grandes formes générales
    macroScale: 0.5,
    macroSpeed: -0.1,
    macroWeight: 0,

    // MEDIUM LAYER - Détails moyens
    mediumScale: 2.0,
    mediumSpeed: -0.1,
    mediumWeight: 0,

    // FINE LAYER - Petits détails
    fineScale: 5.0,
    fineSpeed: -0.1,
    fineWeight: 0,

    // MICRO LAYER - Très fins détails
    microScale: 20,
    microSpeed: -0.04,
    microWeight: 0.99,

    // ULTRA LAYER - Texture granuleuse
    ultraScale: 50.0,
    ultraSpeed: 0.01,
    ultraWeight: 0.2
};
