/**
 * Gestion de l'animation pour PaintReveal
 * Code splitting: séparé pour optimiser le bundle
 */

/**
 * Easing function pour animation fluide
 */
export function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Crée une fonction d'animation avec easing
 * Retourne l'ID de l'animation frame pour pouvoir l'annuler
 */
export function createAnimation(duration, onProgress, onComplete) {
    const startTime = performance.now();
    let animationId = null;
    
    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = smoothstep(progress);
        
        onProgress(easedProgress);
        
        if (progress < 1) {
            animationId = requestAnimationFrame(animate);
        } else {
            if (onComplete) onComplete();
            animationId = null;
        }
    };
    
    animationId = requestAnimationFrame(animate);
    return animationId;
}
