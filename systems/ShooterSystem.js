import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class ShooterSystem {
    constructor(scene, camera, avatar) {
        this.scene = scene;
        this.camera = camera;
        this.avatar = avatar;

        this.isEnabled = false;
        this.weapon = null;
        this.raycaster = new THREE.Raycaster();
        this.center = new THREE.Vector2(0, 0); // Center of screen

        // Firing Mechanics
        this.fireRate = 200; // ms between shots
        this.lastFireTime = 0;
        this.damage = 10;
        this.range = 50;

        // Ammo
        this.maxAmmo = 30;
        this.currentAmmo = 30;
        this.isReloading = false;
        this.reloadTime = 2000;
        this.ammoCounterUI = document.getElementById('ammo-counter');

        // Visuals
        this.muzzleFlash = null;
        this.floatingTexts = [];

        this.init();
    }

    init() {
        this.createWeapon();
        this.createMuzzleFlash();
    }

    createWeapon() {
        const weaponGroup = new THREE.Group();

        // Main Body (Gun)
        const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.6);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0.2, -0.2, -0.3); // Relative to camera

        // Barrel
        const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
        const barrelMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.2, -0.15, -0.7);

        // Grip
        const gripGeo = new THREE.BoxGeometry(0.08, 0.2, 0.1);
        const gripMat = new THREE.MeshBasicMaterial({ color: 0x5d4037 });
        const grip = new THREE.Mesh(gripGeo, gripMat);
        grip.rotation.x = Math.PI / 6;
        grip.position.set(0.2, -0.3, -0.2);

        weaponGroup.add(body);
        weaponGroup.add(barrel);
        weaponGroup.add(grip);

        this.weapon = weaponGroup;
        this.weapon.visible = false;
        this.camera.add(this.weapon); // Attach to camera so it stays locked
    }

    createMuzzleFlash() {
        const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide
        });
        this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
        this.muzzleFlash.position.set(0, 0, -0.5); // Tip of barrel relative
        // We will position this dynamically or attach to weapon but rotation needs care
        // Actually attaching to weapon barrel tip is easier
        if (this.weapon) {
            this.muzzleFlash.position.set(0.2, -0.15, -0.95);
            this.camera.add(this.muzzleFlash);
        }
    }

    toggleMode() {
        this.isEnabled = !this.isEnabled;
        if (this.weapon) {
            this.weapon.visible = this.isEnabled;
        }

        // Show/Hide Crosshair
        // Show/Hide Crosshair & Ammo
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = this.isEnabled ? 'block' : 'none';

        if (this.ammoCounterUI) {
            this.ammoCounterUI.style.display = this.isEnabled ? 'block' : 'none';
            if (this.isEnabled) this.updateAmmoUI();
        }

        return this.isEnabled;
    }

    update(delta, remotePlayers, zombies) {
        if (!this.isEnabled) return;

        // Update floating texts
        this.updateFloatingTexts(delta);

        // Raycasting for Auto-fire
        this.raycaster.setFromCamera(this.center, this.camera);

        const targets = [];
        // Add Zombies (Remote)
        if (zombies && typeof zombies === 'object') { // Handle both array and map
            Object.values(zombies).forEach(z => {
                if (z.model && z.model.visible && !z.isDead) targets.push(z.model);
            });
        }

        // Add Local Zombies (Array)
        const localZombies = arguments[3];
        if (Array.isArray(localZombies)) {
            localZombies.forEach(z => {
                if (z && z.model && z.model.visible && !z.isDead) {
                    targets.push(z.model);
                }
            });
        } else if (localZombies && localZombies.model) {
            // Fallback for single instance if passed
            if (localZombies.model.visible && !localZombies.isDead) targets.push(localZombies.model);
        }
        // Add Remote Players
        if (remotePlayers && typeof remotePlayers === 'object') {
            Object.values(remotePlayers).forEach(p => {
                if (p.model && p.model.visible) targets.push(p.model);
            });
        }

        const intersects = this.raycaster.intersectObjects(targets, true);

        if (intersects.length > 0) {
            // Check distance
            if (intersects[0].distance < this.range) {
                // Determine what we hit
                this.handleHit(intersects[0]);
            }
        }
    }

    handleHit(intersection) {
        const now = Date.now();
        if (now - this.lastFireTime < this.fireRate) return;

        // Ammo & Reload Check
        if (this.isReloading) return;
        if (this.currentAmmo <= 0) {
            this.reload();
            return;
        }

        // Find the root entity
        let entity = intersection.object;
        let targetId = null;
        let isZombie = false;

        // Traverse up to find the entity root
        while (entity) {
            if (entity.userData.isEntityRoot) {
                if (entity.userData.remotePlayerId) {
                    targetId = entity.userData.remotePlayerId;
                } else if (entity.userData.zombieId) {
                    targetId = entity.userData.zombieId;
                    isZombie = true;
                }
                break;
            }
            // Fallback for zombies or players without isEntityRoot set yet (e.g. legacy)
            if (entity.userData.zombieId) {
                targetId = entity.userData.zombieId;
                isZombie = true;
                break;
            }
            if (entity.parent === this.scene) break; // Stop at scene root
            entity = entity.parent;
        }

        // If we found a target, fire!
        if (targetId) {
            // Decrement Ammo
            this.currentAmmo--;
            this.updateAmmoUI();
            if (this.currentAmmo <= 0) this.reload();

            this.fire(targetId, isZombie, intersection.point);
            this.lastFireTime = now;
        }
    }

    fire(targetId, isZombie, hitPoint) {
        // Visual
        this.triggerMuzzleFlash();

        if (window.networkManager) {
            if (isZombie) {
                const zombieInstance = window.networkManager.remoteZombies[targetId];
                if (zombieInstance && zombieInstance.takeDamage) {
                    zombieInstance.takeDamage(this.damage);
                } else {
                    // Check local zombies array
                    if (window.localZombies) {
                        const localZ = window.localZombies.find(z => z.id === targetId || (z.model && z.model.userData.zombieId === targetId));
                        if (localZ) {
                            localZ.takeDamage(this.damage);
                        }
                    } else if (window.zombie && window.zombie.model && window.zombie.model.userData.zombieId === targetId) {
                        // Fallback for single local zombie
                        window.zombie.takeDamage(this.damage);
                    }
                }
            } else {
                // It is a remote player
                const playerInstance = window.networkManager.remotePlayers[targetId];

                // Visual feedback
                if (playerInstance && playerInstance.onHit) {
                    playerInstance.onHit();
                }

                // EXPLICIT TUNNELING (PvP Workaround)
                // Use the exact same mechanism as the melee PvP
                if (window.networkManager.socket) {
                    console.log(`[ShooterSystem] Emitting Tunneled Damage to Player ${targetId}`);
                    window.networkManager.socket.emit('zombieUpdate', {
                        isPvP: true,
                        attackerId: window.networkManager.socket.id,
                        targetId: targetId,
                        damage: this.damage,
                        x: 0, y: 0, z: 0, rotation: 0, state: 'idle'
                    });
                }
            }

            // Show Damage Number (Local visual only)
            this.showFloatingText(hitPoint, this.damage);
        }
    }

    triggerMuzzleFlash() {
        if (this.muzzleFlash) {
            this.muzzleFlash.material.opacity = 1;
            this.muzzleFlash.rotation.z = Math.random() * Math.PI;

            // Recoil
            if (this.weapon) {
                this.weapon.position.z += 0.05;
                setTimeout(() => {
                    if (this.weapon) this.weapon.position.z -= 0.05;
                }, 50);
            }

            // Restore flash
            setTimeout(() => {
                if (this.muzzleFlash) this.muzzleFlash.material.opacity = 0;
            }, 50);
        }
    }

    reload() {
        if (this.isReloading) return;
        this.isReloading = true;

        if (this.ammoCounterUI) {
            this.ammoCounterUI.innerText = "RELOADING...";
            this.ammoCounterUI.style.color = "red";
        }

        setTimeout(() => {
            this.currentAmmo = this.maxAmmo;
            this.isReloading = false;
            this.updateAmmoUI();
        }, this.reloadTime);
    }

    updateAmmoUI() {
        if (this.ammoCounterUI) {
            this.ammoCounterUI.innerText = `${this.currentAmmo} / ${this.maxAmmo}`;
            this.ammoCounterUI.style.color = this.currentAmmo <= 5 ? "red" : "yellow";
        }
    }


    showFloatingText(position, amount) {
        const textGeo = document.createElement('div');
        textGeo.textContent = `-${amount}`;
        textGeo.style.position = 'absolute';
        textGeo.style.color = '#ff0000';
        textGeo.style.fontWeight = 'bold';
        textGeo.style.fontSize = '20px';
        textGeo.style.textShadow = '1px 1px 0 #000';
        textGeo.style.pointerEvents = 'none';
        textGeo.style.userSelect = 'none';

        document.body.appendChild(textGeo);

        const textObj = {
            element: textGeo,
            worldPos: position.clone(),
            life: 1.0, // seconds
            velocity: new THREE.Vector3(0, 1, 0)
        };

        this.floatingTexts.push(textObj);
    }

    updateFloatingTexts(delta) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const item = this.floatingTexts[i];
            item.life -= delta;

            if (item.life <= 0) {
                item.element.remove();
                this.floatingTexts.splice(i, 1);
                continue;
            }

            // Move up
            item.worldPos.add(item.velocity.clone().multiplyScalar(delta * 2)); // Speed up

            // Project to screen
            const screenPos = item.worldPos.clone().project(this.camera);

            // Check if behind camera
            if (screenPos.z > 1) {
                item.element.style.display = 'none';
                continue;
            } else {
                item.element.style.display = 'block';
            }

            const x = (screenPos.x * .5 + .5) * window.innerWidth;
            const y = (-(screenPos.y * .5) + .5) * window.innerHeight;

            item.element.style.left = `${x}px`;
            item.element.style.top = `${y}px`;
            item.element.style.opacity = item.life;
        }
    }
}
