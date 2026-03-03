/**
 
 * Code splitting optimisé:
 * - shaders.js: Shaders GLSL (chargés à la demande, mieux d'avoir un fichier unique pour les shaders)
 * - config.js: Configuration par défaut (input global)
 * - webgl-utils.js: Utilitaires WebGL -> crée et compile les shaders et le program
 * - animation.js: Logique d'animation
 * 
 */



export { default } from './paint-reveal/index.js';
