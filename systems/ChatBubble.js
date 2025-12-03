import * as THREE from 'three';

/**
 * ChatBubble - Creates comic-style speech bubbles above avatars
 */
export class ChatBubble {
    constructor(scene, message, position, config = {}) {
        this.scene = scene;
        this.message = message;
        this.config = {
            duration: config.duration || 5000,
            heightOffset: config.heightOffset || 2.5,
            scale: config.scale || 1.0,
            maxWidth: config.maxWidth || 300,
            fontSize: config.fontSize || 24,
            padding: config.padding || 20,
            tailHeight: config.tailHeight || 20,
            visibilityRange: config.visibilityRange || 15 // Only visible within this range
        };

        this.sprite = null;
        this.isVisible = false;
        this.startTime = Date.now();
        this.animationProgress = 0;
        this.camera = null; // Will be set during update

        this.createBubble(position);
        this.show();
    }

    createBubble(position) {
        // Create canvas for text rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set font for measurement
        context.font = `bold ${this.config.fontSize}px Arial, sans-serif`;

        // Word wrap the message
        const words = this.message.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = context.measureText(testLine);

            if (metrics.width > this.config.maxWidth - this.config.padding * 2) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);

        // Calculate dimensions
        const lineHeight = this.config.fontSize * 1.4;
        const textHeight = lines.length * lineHeight;
        const bubbleWidth = Math.min(
            this.config.maxWidth,
            Math.max(...lines.map(line => context.measureText(line).width)) + this.config.padding * 2
        );
        const bubbleHeight = textHeight + this.config.padding * 2;

        // Set canvas size (power of 2 for better performance)
        canvas.width = Math.pow(2, Math.ceil(Math.log2(bubbleWidth)));
        canvas.height = Math.pow(2, Math.ceil(Math.log2(bubbleHeight + this.config.tailHeight)));

        // Reset font after canvas resize
        context.font = `bold ${this.config.fontSize}px Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Draw comic-style bubble
        this.drawComicBubble(context, bubbleWidth, bubbleHeight, lines, lineHeight);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: false // Constant size regardless of distance
        });

        this.sprite = new THREE.Sprite(spriteMaterial);

        // Scale sprite to maintain aspect ratio
        // Smaller scale for constant size mode (sizeAttenuation: false)
        const aspectRatio = canvas.width / canvas.height;
        this.sprite.scale.set(
            aspectRatio * this.config.scale * 0.15,
            this.config.scale * 0.15,
            1
        );

        // Position above avatar
        this.sprite.position.copy(position);
        this.sprite.position.y += this.config.heightOffset;

        // Add to scene
        this.scene.add(this.sprite);
    }

    drawComicBubble(context, width, height, lines, lineHeight) {
        const canvas = context.canvas;
        const centerX = canvas.width / 2;
        const startY = 10;

        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Draw bubble background with rounded corners
        const radius = 15;
        const bubbleX = (canvas.width - width) / 2;
        const bubbleY = startY;

        // Shadow for depth
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 10;
        context.shadowOffsetX = 3;
        context.shadowOffsetY = 3;

        // White background
        context.fillStyle = '#FFFFFF';
        context.beginPath();
        context.moveTo(bubbleX + radius, bubbleY);
        context.lineTo(bubbleX + width - radius, bubbleY);
        context.quadraticCurveTo(bubbleX + width, bubbleY, bubbleX + width, bubbleY + radius);
        context.lineTo(bubbleX + width, bubbleY + height - radius);
        context.quadraticCurveTo(bubbleX + width, bubbleY + height, bubbleX + width - radius, bubbleY + height);
        context.lineTo(bubbleX + radius, bubbleY + height);
        context.quadraticCurveTo(bubbleX, bubbleY + height, bubbleX, bubbleY + height - radius);
        context.lineTo(bubbleX, bubbleY + radius);
        context.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
        context.closePath();
        context.fill();

        // Reset shadow for border
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;

        // Black border
        context.strokeStyle = '#000000';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(bubbleX + radius, bubbleY);
        context.lineTo(bubbleX + width - radius, bubbleY);
        context.quadraticCurveTo(bubbleX + width, bubbleY, bubbleX + width, bubbleY + radius);
        context.lineTo(bubbleX + width, bubbleY + height - radius);
        context.quadraticCurveTo(bubbleX + width, bubbleY + height, bubbleX + width - radius, bubbleY + height);
        context.lineTo(bubbleX + radius, bubbleY + height);
        context.quadraticCurveTo(bubbleX, bubbleY + height, bubbleX, bubbleY + height - radius);
        context.lineTo(bubbleX, bubbleY + radius);
        context.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
        context.closePath();
        context.stroke();

        // Draw tail (pointing down)
        const tailWidth = 30;
        const tailHeight = this.config.tailHeight;
        const tailX = centerX;
        const tailY = bubbleY + height;

        context.fillStyle = '#FFFFFF';
        context.beginPath();
        context.moveTo(tailX - tailWidth / 2, tailY);
        context.lineTo(tailX, tailY + tailHeight);
        context.lineTo(tailX + tailWidth / 2, tailY);
        context.closePath();
        context.fill();
        context.stroke();

        // Draw text
        context.fillStyle = '#000000';
        const textStartY = bubbleY + this.config.padding + lineHeight / 2;

        lines.forEach((line, index) => {
            context.fillText(
                line,
                centerX,
                textStartY + index * lineHeight
            );
        });
    }

    show() {
        this.isVisible = true;
        this.animationProgress = 0;
    }

    update(delta, avatarPosition, camera) {
        if (!this.sprite || !this.isVisible) return;

        const elapsed = Date.now() - this.startTime;

        // Update position to follow avatar
        if (avatarPosition) {
            this.sprite.position.x = avatarPosition.x;
            this.sprite.position.y = avatarPosition.y + this.config.heightOffset;
            this.sprite.position.z = avatarPosition.z;
        }

        // Check distance from camera for visibility
        let distanceOpacity = 1;
        if (camera && avatarPosition) {
            const distance = camera.position.distanceTo(avatarPosition);

            // Only visible within range
            if (distance > this.config.visibilityRange) {
                this.sprite.visible = false;
                return;
            } else {
                this.sprite.visible = true;

                // Fade in/out based on distance
                const fadeStart = this.config.visibilityRange * 0.7;
                if (distance > fadeStart) {
                    distanceOpacity = 1 - ((distance - fadeStart) / (this.config.visibilityRange - fadeStart));
                }
            }
        }

        // Entrance animation (scale up)
        if (this.animationProgress < 1) {
            this.animationProgress = Math.min(1, this.animationProgress + delta * 4);
            const scale = this.easeOutBack(this.animationProgress);
            this.sprite.material.opacity = this.animationProgress * distanceOpacity;
            this.sprite.scale.multiplyScalar(scale / (this.lastScale || 1));
            this.lastScale = scale;
        } else {
            // Apply distance-based opacity after entrance animation
            this.sprite.material.opacity = distanceOpacity;
        }

        // Auto-hide after duration
        if (elapsed > this.config.duration) {
            const fadeOutDuration = 500;
            const fadeProgress = Math.min(1, (elapsed - this.config.duration) / fadeOutDuration);
            this.sprite.material.opacity = (1 - fadeProgress) * distanceOpacity;

            if (fadeProgress >= 1) {
                this.dispose();
            }
        }
    }

    easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    dispose() {
        if (this.sprite) {
            if (this.sprite.material.map) {
                this.sprite.material.map.dispose();
            }
            this.sprite.material.dispose();
            this.scene.remove(this.sprite);
            this.sprite = null;
        }
        this.isVisible = false;
    }

    isExpired() {
        return !this.isVisible || !this.sprite;
    }
}
