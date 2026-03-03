/**
 * Shaders pour PaintReveal
-> Shader de @Clement
 */

export const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

export const fragmentShaderSource = `
    precision mediump float;

    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_progress;
    uniform vec2 u_resolution;
    uniform float u_aspectRatio;

    // Global Scale
    uniform float u_globalScale;

    // Noise Layers
    uniform float u_macroScale;
    uniform float u_macroSpeed;
    uniform float u_macroWeight;
    uniform float u_mediumScale;
    uniform float u_mediumSpeed;
    uniform float u_mediumWeight;
    uniform float u_fineScale;
    uniform float u_fineSpeed;
    uniform float u_fineWeight;
    uniform float u_microScale;
    uniform float u_microSpeed;
    uniform float u_microWeight;
    uniform float u_ultraScale;
    uniform float u_ultraSpeed;
    uniform float u_ultraWeight;

    varying vec2 v_texCoord;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);

        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    // OPTIMIZED: Reduced from 8 to 5 octaves (30-40% faster)
    float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.2;

        for(int i = 0; i < 5; i++) {
            value += amplitude * noise(st * frequency);
            frequency *= 2.1;
            amplitude *= 0.45;
        }
        return value;
    }

    void main() {
        vec2 st = v_texCoord;

        // Calculate UV with object-fit: cover (ASPECT RATIO UNIFORMIZATION)
        vec2 textureUv = v_texCoord;
        float canvasAspect = u_resolution.x / u_resolution.y;
        float scale = 1.0;
        vec2 offset = vec2(0.0);

        if (u_aspectRatio > canvasAspect) {
            scale = canvasAspect / u_aspectRatio;
            offset.y = (1.0 - scale) * 0.5;
            textureUv.y = (textureUv.y - offset.y) / scale;
        } else {
            scale = u_aspectRatio / canvasAspect;
            offset.x = (1.0 - scale) * 0.5;
            textureUv.x = (textureUv.x - offset.x) / scale;
        }

        if (textureUv.x < 0.0 || textureUv.x > 1.0 || textureUv.y < 0.0 || textureUv.y > 1.0) {
            discard;
        }

        vec4 texColor = texture2D(u_texture, textureUv);

        if(texColor.a < 0.1) {
            discard;
        }

        // Fixed reveal points
        vec2 center1 = vec2(0.3, 0.4);
        vec2 center2 = vec2(0.7, 0.3);
        vec2 center3 = vec2(0.5, 0.7);
        vec2 center4 = vec2(0.2, 0.8);
        vec2 center5 = vec2(0.8, 0.6);

        float dist1 = length(st - center1);
        float dist2 = length(st - center2);
        float dist3 = length(st - center3);
        float dist4 = length(st - center4);
        float dist5 = length(st - center5);

        float minDist = min(min(min(min(dist1, dist2), dist3), dist4), dist5);

        // Apply Global Scale to all layers
        float globalScale = u_globalScale;

        // Noise layers with Global Scale applied
        float macro = fbm(st * (u_macroScale * globalScale) + u_time * u_macroSpeed);
        float medium = fbm(st * (u_mediumScale * globalScale) + u_time * u_mediumSpeed);
        float fine = fbm(st * (u_fineScale * globalScale) + u_time * u_fineSpeed);
        float micro = fbm(st * (u_microScale * globalScale) + u_time * u_microSpeed);
        float ultra = fbm(st * (u_ultraScale * globalScale) + u_time * u_ultraSpeed);

        // Combine layers with their weights
        float complexNoise = macro * u_macroWeight +
                           medium * u_mediumWeight +
                           fine * u_fineWeight +
                           micro * u_microWeight +
                           ultra * u_ultraWeight;

        // Brush effects
        float strokeX = sin(st.x * 60.0 * globalScale + complexNoise * 20.0);
        float strokeY = sin(st.y * 45.0 * globalScale + complexNoise * 15.0);
        float strokePattern = (strokeX + strokeY) * 0.08;

        float fiberNoise1 = sin(st.x * 100.0 * globalScale + st.y * 75.0 * globalScale) * 0.03;
        float fiberNoise2 = sin(st.x * 90.0 * globalScale - st.y * 110.0 * globalScale) * 0.02;

        // Reveal - La révélation doit être strictement progressive de 0% à 100%
        float boundary = minDist + complexNoise * 0.5 + strokePattern + fiberNoise1 + fiberNoise2;
        // revealRadius augmente de 0 à 1.5 selon le progress
        // On ajoute un offset minimum pour garantir qu'à 0%, rien n'est révélé
        float minRevealOffset = 0.05;
        float revealRadius = u_progress * 1.5;
        // La révélation commence strictement à 0 quand progress = 0
        // On utilise step pour une révélation nette, mais on s'assure que revealRadius > minRevealOffset pour révéler
        float reveal = u_progress > 0.01 ? (1.0 - step(revealRadius, boundary + minRevealOffset)) : 0.0;

        // Splatters - seulement visibles si progress est suffisant
        float splatterMacro = step(0.8, fbm(st * 7.5 * globalScale + u_time * 0.08));
        float splatterFine = step(0.9, fbm(st * 22.5 * globalScale - u_time * 0.04));
        float splatters = u_progress > 0.01 ? ((splatterMacro + splatterFine * 0.5) *
                         step(revealRadius - 0.1, boundary + minRevealOffset) *
                         step(boundary + minRevealOffset, revealRadius + 0.2)) : 0.0;

        // Brush pattern
        float bristleDir1 = abs(sin(st.x * 90.0 * globalScale + complexNoise * 25.0));
        float bristleDir2 = abs(sin(st.y * 70.0 * globalScale + complexNoise * 20.0));
        float bristlePattern = (bristleDir1 < 0.4 ? 0.7 : 1.0) *
                             (bristleDir2 < 0.5 ? 0.8 : 1.0);

        // Ink density
        float inkDensity = fbm(st * 17.5 * globalScale + u_time * 0.02);
        float densityPattern = step(0.3, inkDensity) * 0.9 + 0.1;

        // Final composition
        float finalReveal = clamp(reveal + splatters * 0.4, 0.0, 1.0);
        float cleanCore = step(0.8, finalReveal);
        float texturedEdges = finalReveal * bristlePattern * densityPattern * (1.0 - cleanCore);

        float result = cleanCore + texturedEdges;
        result = step(0.15, result) * result;

        float edgeDetail = (1.0 - cleanCore) * step(0.7, ultra) * 0.3;
        result += edgeDetail * finalReveal;
        
        // S'assurer que si progress est 0 ou très petit, result est strictement 0
        // Utiliser un seuil plus élevé pour garantir qu'à 0%, rien n'est visible
        result = u_progress > 0.01 ? result : 0.0;

        gl_FragColor = vec4(texColor.rgb, texColor.a * clamp(result, 0.0, 1.0));
    }
`;
