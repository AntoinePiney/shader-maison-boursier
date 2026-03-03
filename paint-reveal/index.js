

// Dynamic imports pour code splitting
import { defaultConfig } from './config.js';
import { vertexShaderSource, fragmentShaderSource } from './shaders.js';
import { createShader, createProgram } from './webgl-utils.js';

export default class PaintReveal {
    constructor(options = {}) {
        // Merge user config with defaults
        this.paintConfig = { ...defaultConfig, ...(options.config || {}) };

        // General configuration
        this.config = {
            sourceElement: options.sourceElement || null,
            container: options.container || document.body,
            duration: options.duration || 4000,
            scrollTrigger: options.scrollTrigger || null,
            autoStart: options.autoStart || false,
            onComplete: options.onComplete || null,
            onStart: options.onStart || null,
            onProgress: options.onProgress || null,
            onError: options.onError || null
        };

        // Animation state
        this.revealProgress = 0;
        this.isAnimating = false;
        this.isTriggered = false;
        this.animationFrame = null;
        this.renderFrame = null;
        this.isDestroyed = false;

        // WebGL objects
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.textureCanvas = null;
        this.uniformLocations = {};
        this.imageAspectRatio = 1;
        this.startTime = Date.now();

        // Scroll trigger
        this.scrollHandler = null;
        this.resizeHandler = null;

        // Performance optimization
        this.lastScrollTime = 0;
        this.scrollThrottle = 16; // ~60fps

        // Store shader sources (imported from shaders.js)
        this.vertexShaderSource = vertexShaderSource;
        this.fragmentShaderSource = fragmentShaderSource;

        // Initialize
        this.init();
    }

    // ===============================
    // INITIALIZATION
    // ===============================
    async init() {
        try {
            const container = typeof this.config.container === 'string'
                ? document.querySelector(this.config.container)
                : this.config.container;

            if (!container) {
                throw new Error('Container element not found');
            }

            // Create canvas
            this.canvas = document.createElement('canvas');
            container.appendChild(this.canvas);

            // Get WebGL context
            this.gl = this.canvas.getContext('webgl', { 
                alpha: true,
                premultipliedAlpha: false,
                antialias: false
            }) || this.canvas.getContext('experimental-webgl', {
                alpha: true,
                premultipliedAlpha: false,
                antialias: false
            });
            
            if (!this.gl) {
                throw new Error('WebGL not supported');
            }

            // Create shader program using imported utilities
            const vertexShader = createShader(this.gl, this.gl.VERTEX_SHADER, this.vertexShaderSource);
            const fragmentShader = createShader(this.gl, this.gl.FRAGMENT_SHADER, this.fragmentShaderSource);
            
            if (!vertexShader || !fragmentShader) {
                throw new Error('Shader compilation failed');
            }
            
            this.program = createProgram(this.gl, vertexShader, fragmentShader);
            
            if (!this.program) {
                throw new Error('Program linking failed');
            }

            // Convert source element to texture
            await this.createTexture();

            // Setup WebGL
            this.setupWebGL();

            // Setup resize listener
            this.setupResizeListener();

            // Setup scroll trigger if configured
            if (this.config.scrollTrigger !== null) {
                this.setupScrollTrigger();
            }

            // Start rendering loop
            this.startRenderLoop();

            // Auto-start if configured
            if (this.config.autoStart) {
                this.start();
            }

        } catch (error) {
            console.error('PaintReveal initialization error:', error);
            
            if (this.config.onError) {
                this.config.onError(error);
            }
            
            // Cleanup on error
            this.destroy();
        }
    }

    // ===============================
    // TEXTURE CREATION
    // ===============================
    async createTexture() {
        const sourceElement = typeof this.config.sourceElement === 'string'
            ? document.querySelector(this.config.sourceElement)
            : this.config.sourceElement;

        if (!sourceElement) {
            throw new Error('Source element not found');
        }

        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library is required');
        }

        try {
            this.textureCanvas = await html2canvas(sourceElement, {
                backgroundColor: null,
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                logging: false,
                removeContainer: true
            });

            if (!this.textureCanvas || this.textureCanvas.width === 0 || this.textureCanvas.height === 0) {
                throw new Error('html2canvas returned invalid canvas');
            }

            this.imageAspectRatio = this.textureCanvas.width / this.textureCanvas.height;
            this.resizeCanvas();
            
        } catch (error) {
            console.error('html2canvas error:', error);
            throw new Error(`Failed to convert element to texture: ${error.message}`);
        }
    }

    resizeCanvas() {
        if (!this.canvas || !this.canvas.parentElement) return;

        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;

        let width, height;
        const aspectRatio = this.imageAspectRatio;

        if (maxWidth / aspectRatio <= maxHeight) {
            width = maxWidth;
            height = maxWidth / aspectRatio;
        } else {
            width = maxHeight * aspectRatio;
            height = maxHeight;
        }

        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        if (this.gl) {
            this.gl.viewport(0, 0, width, height);
            
            if (this.program && this.uniformLocations.resolution) {
                this.gl.useProgram(this.program);
                this.gl.uniform2f(
                    this.gl.getUniformLocation(this.program, 'u_resolution'), 
                    width, 
                    height
                );
                this.gl.uniform1f(
                    this.gl.getUniformLocation(this.program, 'u_aspectRatio'), 
                    this.imageAspectRatio
                );
            }
        }
    }

    setupResizeListener() {
        this.resizeHandler = () => {
            this.resizeCanvas();
        };
        
        window.addEventListener('resize', this.resizeHandler);
    }

    // ===============================
    // WEBGL SETUP
    // ===============================
    setupWebGL() {
        const gl = this.gl;

        // Setup geometry
        const vertices = new Float32Array([
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
            -1,  1, 0, 0,
             1, -1, 1, 1,
             1,  1, 1, 0
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Setup attributes
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');

        gl.enableVertexAttribArray(positionLocation);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

        // Create and bind texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textureCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Setup uniforms
        gl.useProgram(this.program);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_aspectRatio'), this.imageAspectRatio);

        // Store uniform locations
        this.uniformLocations = {
            time: gl.getUniformLocation(this.program, 'u_time'),
            progress: gl.getUniformLocation(this.program, 'u_progress'),
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            aspectRatio: gl.getUniformLocation(this.program, 'u_aspectRatio'),
            globalScale: gl.getUniformLocation(this.program, 'u_globalScale'),
            macroScale: gl.getUniformLocation(this.program, 'u_macroScale'),
            macroSpeed: gl.getUniformLocation(this.program, 'u_macroSpeed'),
            macroWeight: gl.getUniformLocation(this.program, 'u_macroWeight'),
            mediumScale: gl.getUniformLocation(this.program, 'u_mediumScale'),
            mediumSpeed: gl.getUniformLocation(this.program, 'u_mediumSpeed'),
            mediumWeight: gl.getUniformLocation(this.program, 'u_mediumWeight'),
            fineScale: gl.getUniformLocation(this.program, 'u_fineScale'),
            fineSpeed: gl.getUniformLocation(this.program, 'u_fineSpeed'),
            fineWeight: gl.getUniformLocation(this.program, 'u_fineWeight'),
            microScale: gl.getUniformLocation(this.program, 'u_microScale'),
            microSpeed: gl.getUniformLocation(this.program, 'u_microSpeed'),
            microWeight: gl.getUniformLocation(this.program, 'u_microWeight'),
            ultraScale: gl.getUniformLocation(this.program, 'u_ultraScale'),
            ultraSpeed: gl.getUniformLocation(this.program, 'u_ultraSpeed'),
            ultraWeight: gl.getUniformLocation(this.program, 'u_ultraWeight')
        };

        // Initialize uniforms
        this.updatePaintConfig();

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    // ===============================
    // CONFIG MANAGEMENT
    // ===============================
    updatePaintConfig() {
        if (!this.gl || !this.program) return;

        const gl = this.gl;
        gl.uniform1f(this.uniformLocations.globalScale, this.paintConfig.globalScale);
        gl.uniform1f(this.uniformLocations.macroScale, this.paintConfig.macroScale);
        gl.uniform1f(this.uniformLocations.macroSpeed, this.paintConfig.macroSpeed);
        gl.uniform1f(this.uniformLocations.macroWeight, this.paintConfig.macroWeight);
        gl.uniform1f(this.uniformLocations.mediumScale, this.paintConfig.mediumScale);
        gl.uniform1f(this.uniformLocations.mediumSpeed, this.paintConfig.mediumSpeed);
        gl.uniform1f(this.uniformLocations.mediumWeight, this.paintConfig.mediumWeight);
        gl.uniform1f(this.uniformLocations.fineScale, this.paintConfig.fineScale);
        gl.uniform1f(this.uniformLocations.fineSpeed, this.paintConfig.fineSpeed);
        gl.uniform1f(this.uniformLocations.fineWeight, this.paintConfig.fineWeight);
        gl.uniform1f(this.uniformLocations.microScale, this.paintConfig.microScale);
        gl.uniform1f(this.uniformLocations.microSpeed, this.paintConfig.microSpeed);
        gl.uniform1f(this.uniformLocations.microWeight, this.paintConfig.microWeight);
        gl.uniform1f(this.uniformLocations.ultraScale, this.paintConfig.ultraScale);
        gl.uniform1f(this.uniformLocations.ultraSpeed, this.paintConfig.ultraSpeed);
        gl.uniform1f(this.uniformLocations.ultraWeight, this.paintConfig.ultraWeight);
    }

    updateConfig(newConfig) {
        this.paintConfig = { ...this.paintConfig, ...newConfig };
        this.updatePaintConfig();
    }

    // ===============================
    // RENDERING
    // ===============================
    startRenderLoop() {
        const render = (time) => {
            if (this.isDestroyed) return;
            
            this.render(time);
            this.renderFrame = requestAnimationFrame(render);
        };
        render(0);
    }

    render(time) {
        if (!this.gl || !this.program || this.isDestroyed) return;

        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        const elapsedTime = (time - this.startTime) / 1000;
        this.gl.uniform1f(this.uniformLocations.time, elapsedTime);
        this.gl.uniform1f(this.uniformLocations.progress, this.revealProgress);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    // ===============================
    // ANIMATION CONTROL
    // ===============================
    start() {
        if (this.isAnimating || this.isTriggered) return;

        this.isTriggered = true;
        this.revealProgress = 0;

        if (this.config.onStart) {
            this.config.onStart();
        }

        // Delay de 200ms avant de commencer l'animation
        setTimeout(() => {
            if (this.isDestroyed) return;
            
            this.isAnimating = true;

            // Use imported animation utility
            const startTime = performance.now();
            const duration = this.config.duration;

            const animate = (currentTime) => {
                if (this.isDestroyed) return;
                
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Smooth easing (from animation.js)
                this.revealProgress = progress * progress * (3 - 2 * progress);

                if (this.config.onProgress) {
                    this.config.onProgress(this.revealProgress);
                }

                if (progress < 1) {
                    this.animationFrame = requestAnimationFrame(animate);
                } else {
                    this.isAnimating = false;
                    if (this.config.onComplete) {
                        this.config.onComplete();
                    }
                }
            };

            this.animationFrame = requestAnimationFrame(animate);
        }, 200);
    }

    setProgress(value) {
        this.revealProgress = Math.max(0, Math.min(1, value));
        if (this.config.onProgress) {
            this.config.onProgress(this.revealProgress);
        }
    }

    reset() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        this.isTriggered = false;
        this.isAnimating = false;
        this.revealProgress = 0;
    }

    // ===============================
    // SCROLL TRIGGER
    // ===============================
    setupScrollTrigger() {
        this.scrollHandler = () => {
            const now = Date.now();
            
            if (now - this.lastScrollTime < this.scrollThrottle) {
                return;
            }
            
            this.lastScrollTime = now;
            requestAnimationFrame(() => this.checkScrollTrigger());
        };

        window.addEventListener('scroll', this.scrollHandler, { passive: true });
    }

    checkScrollTrigger() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = Math.min(scrollTop / documentHeight, 1);

        if (scrollPercent <= 0.05 && (this.isTriggered || this.isAnimating)) {
            this.reset();
            return;
        }

        if (scrollPercent >= this.config.scrollTrigger && !this.isTriggered) {
            this.start();
        }
    }

    // ===============================
    // CLEANUP
    // ===============================
    destroy() {
        this.isDestroyed = true;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        if (this.renderFrame) {
            cancelAnimationFrame(this.renderFrame);
            this.renderFrame = null;
        }

        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }

        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        this.canvas = null;
        this.gl = null;
        this.textureCanvas = null;
        this.uniformLocations = {};
    }
}
