import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class ItemSystem {
    constructor(scene, avatar, shooterSystem) {
        this.scene = scene;
        this.avatar = avatar;
        this.shooterSystem = shooterSystem;
        this.items = [];
        this.pickupRadius = 1.5;
    }

    spawnLoot(position) {
        // 50% chance to drop nothing
        if (Math.random() > 0.5) return;

        // 50/50 chance for Health or Ammo
        const type = Math.random() > 0.5 ? 'health' : 'ammo';
        this.createItem(position, type);
    }

    createItem(position, type) {
        const group = new THREE.Group();
        group.position.copy(position);
        group.position.y += 1.0; // Float above ground

        // Visuals (Emoji on a plane/sprite)
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const emoji = type === 'health' ? '❤️' : '🔋';
        ctx.fillText(emoji, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.8, 0.8, 0.8);

        group.add(sprite);
        this.scene.add(group);

        this.items.push({
            mesh: group,
            type: type,
            creationTime: Date.now()
        });
    }

    update(delta) {
        const now = Date.now();
        const avatarPos = this.avatar.position;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];

            // Float animation
            item.mesh.position.y = 1.0 + Math.sin(now * 0.003) * 0.2;

            // Rotate (Sprites always face camera, but we can bobble)

            // Pickup Check
            const dist = item.mesh.position.distanceTo(avatarPos);
            if (dist < this.pickupRadius) {
                this.pickup(item, i);
            }

            // Despawn after 30 seconds
            if (now - item.creationTime > 30000) {
                this.removeItem(i);
            }
        }
    }

    pickup(item, index) {
        let pickedUp = false;

        if (item.type === 'health') {
            if (this.avatar.health < this.avatar.maxHealth) {
                this.avatar.heal(20);
                pickedUp = true;
                this.showFloatingText(item.mesh.position, "+20 HP", "green");
            }
        } else if (item.type === 'ammo') {
            // Assume shooter system always wants ammo if enabled
            // We can check if full but ammo is valuable.
            // Let's just always pick up unless completely full reserve?
            if (this.shooterSystem.reserveAmmo < 1000) { // arbitrary cap or just check logic
                this.shooterSystem.addAmmo(30);
                pickedUp = true;
                this.showFloatingText(item.mesh.position, "+30 AMMO", "yellow");
            }
        }

        if (pickedUp) {
            this.removeItem(index);
        }
    }

    removeItem(index) {
        const item = this.items[index];
        this.scene.remove(item.mesh);
        // Dispose textures/materials if needed?
        // item.mesh.children[0].material.map.dispose();
        // item.mesh.children[0].material.dispose();
        this.items.splice(index, 1);
    }

    showFloatingText(position, text, color) {
        const textGeo = document.createElement('div');
        textGeo.textContent = text;
        textGeo.style.position = 'absolute';
        textGeo.style.color = color;
        textGeo.style.fontWeight = 'bold';
        textGeo.style.fontSize = '20px';
        textGeo.style.textShadow = '1px 1px 0 #000';
        textGeo.style.pointerEvents = 'none';
        textGeo.style.userSelect = 'none';
        textGeo.style.zIndex = '2000';

        document.body.appendChild(textGeo);

        // Simple animation loop for this text would be needed or reuse existing system.
        // For simplicity, let's just use CSS animation or a simple timeout removal.
        // We'll calculate screen pos once.

        // Actually, we can hook into ShooterSystem's floating text if accessible or duplicate logic.
        // Let's duplicate simple logic for now or rely on CSS.

        // CSS Animation
        textGeo.style.transition = 'top 1s ease-out, opacity 1s ease-out';
        textGeo.style.opacity = '1';

        // Initial Pos
        const screenPos = position.clone().project(this.avatar.scene.camera || this.scene.camera); // Wait, where is camera? 
        // We passed scene, avatar, shooterSystem. We need camera for projection.
        // Let's grab camera from avatar.model or assume global or pass it in update.
        // Actually ShooterSystem has camera.

        const camera = this.shooterSystem.camera;
        const x = (screenPos.x * .5 + .5) * window.innerWidth;
        const y = (-(screenPos.y * .5) + .5) * window.innerHeight;

        textGeo.style.left = `${x}px`;
        textGeo.style.top = `${y}px`;

        // Animate
        setTimeout(() => {
            textGeo.style.top = `${y - 50}px`;
            textGeo.style.opacity = '0';
        }, 50);

        setTimeout(() => {
            textGeo.remove();
        }, 1050);
    }
}
