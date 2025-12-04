import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { Avatar } from './entities/Avatar.js';
import { Vehicle } from './entities/Vehicle.js';
import { Zombie } from './entities/Zombie.js';
import { CameraController } from './systems/CameraController.js';
import { InputManager } from './systems/InputManager.js';
import { NetworkManager } from './systems/NetworkManager.js';
import { ChatBubble } from './systems/ChatBubble.js';
import { ChatUI } from './systems/ChatUI.js';
import { MusicPlayer } from './systems/MusicPlayer.js';

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera Setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Renderer Setup
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.PERFORMANCE.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(CONFIG.PERFORMANCE.SHADOW_MAP_SIZE, CONFIG.PERFORMANCE.SHADOW_MAP_SIZE);
scene.add(directionalLight);

// Ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Collision Systems
const collidableObjects = [ground];
const groundCollidableObjects = [ground];

// Systems
const inputManager = new InputManager();
const cameraController = new CameraController(camera);
const networkManager = new NetworkManager(scene);
const musicPlayer = new MusicPlayer();

// ... (existing code) ...

// Entities
const avatar = new Avatar(scene);
const zombie = new Zombie(scene, collidableObjects, groundCollidableObjects);
const vehicles = []; // Array of Vehicle instances



// Chat System
const chatUI = new ChatUI((message) => {
    // Send message to server
    networkManager.sendChatMessage(message);

    // Show local chat bubble
    const chatConfig = {
        duration: CONFIG.CHAT.BUBBLE_DURATION,
        heightOffset: CONFIG.CHAT.BUBBLE_HEIGHT_OFFSET,
        scale: CONFIG.CHAT.BUBBLE_SCALE,
        visibilityRange: CONFIG.CHAT.BUBBLE_VISIBILITY_RANGE
    };
    avatar.showChatBubble(message, ChatBubble, chatConfig);

    // Add to chat UI
    chatUI.addMessage('You', message, true);
});

// Handle incoming chat messages
window.addEventListener('chat-message-received', (e) => {
    const data = e.detail;
    console.log('Displaying chat message:', data);

    // Add to chat UI
    const playerName = data.playerName || `Player ${data.id?.substring(0, 6)}`;
    chatUI.addMessage(playerName, data.message, false);

    // Show bubble on remote avatar
    const remoteAvatar = networkManager.remotePlayers[data.id];
    if (remoteAvatar) {
        const chatConfig = {
            duration: CONFIG.CHAT.BUBBLE_DURATION,
            heightOffset: CONFIG.CHAT.BUBBLE_HEIGHT_OFFSET,
            scale: CONFIG.CHAT.BUBBLE_SCALE,
            visibilityRange: CONFIG.CHAT.BUBBLE_VISIBILITY_RANGE
        };
        remoteAvatar.showChatBubble(data.message, ChatBubble, chatConfig);
    }
});


// Game State
let currentMap = null;
let isInVehicle = false;
let currentVehicle = null; // Vehicle instance
let nearbyVehicle = null; // Vehicle instance

// Loading State
const loadingState = {
    totalAssets: 7, // 1 Map + 5 Vehicles + 1 Avatar
    loadedAssets: 0,
    progress: 0
};

function updateLoadingProgress() {
    loadingState.loadedAssets++;
    loadingState.progress = (loadingState.loadedAssets / loadingState.totalAssets) * 100;

    console.log(`Loading Progress: ${loadingState.loadedAssets}/${loadingState.totalAssets} (${Math.round(loadingState.progress)}%)`);

    const progressBar = document.getElementById('progress-bar');
    const loadingText = document.getElementById('loading-text');

    if (progressBar) progressBar.style.width = `${loadingState.progress}%`;
    if (loadingText) loadingText.innerText = `Loading Assets... ${Math.round(loadingState.progress)}%`;

    if (loadingState.loadedAssets >= loadingState.totalAssets) {
        // Auto-start game
        setTimeout(() => {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }
        }, 500); // Short delay to show 100%
    }
}



// Map Loading
function loadMap(mapUrl) {
    if (currentMap) {
        // Cleanup
        currentMap.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });

        scene.remove(currentMap);
        const index = collidableObjects.indexOf(currentMap);
        if (index > -1) collidableObjects.splice(index, 1);
        const groundIndex = groundCollidableObjects.indexOf(currentMap);
        if (groundIndex > -1) groundCollidableObjects.splice(groundIndex, 1);
    }

    const gltfLoader = new GLTFLoader();
    loadWithCache(mapUrl, gltfLoader).then((gltf) => {
        currentMap = gltf.scene;

        if (mapUrl.includes('mansion')) {
            currentMap.scale.set(0.5, 0.5, 0.5);
        } else if (mapUrl.includes('burnin_rubber')) {
            currentMap.scale.set(25.0, 25.0, 25.0); // Aumentado a 2.5x el tamaño anterior (10.0 * 2.5)
            currentMap.position.set(-320, 0, 230); // Ajustado para centrar mejor en el eje X
        }

        gltf.scene.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Check for pre-placed vehicles in map if any (optional logic from original)
                // The original code checked for 'car', 'bus' etc in map children but added them as raw meshes
                // For now we keep the spawn logic separate
            }
        });
        scene.add(gltf.scene);
        collidableObjects.push(gltf.scene);
        groundCollidableObjects.push(gltf.scene);

        if (avatar.model) {
            avatar.model.position.set(0, 0, 5);
        }
        updateLoadingProgress(); // Map loaded
    }).catch(error => {
        console.error(`Error loading map ${mapUrl}:`, error);
        updateLoadingProgress(); // Count as loaded (failed) to avoid hanging
    });
}

// Vehicle Management
const VEHICLE_MODELS = [
    { path: '/1999_mazdaspeed_rx-7_fd3s_a-spec_gt-concept.glb', name: 'Mazda RX-7' },
    { path: '/2018_mazda_rx-7_fd3s_fatal_stinger.glb', name: 'Fatal Stinger' },
    { path: '/2002_mazda_rx-7_spirit_r_type_a_fd.glb', name: 'Spirit R Type A' },
    { path: '/2002_mazda_rx-7_spirit-r.glb', name: 'Spirit R' },
    { path: '/2002_mazda_re-amemiya_super_greddy_3.glb', name: 'Re Amemiya' }
];

let vehicleTemplates = [];

// Load all vehicle models
async function loadVehicleModels() {
    const loader = new GLTFLoader();

    for (const model of VEHICLE_MODELS) {
        try {
            const gltf = await loadWithCache(model.path, loader);
            const template = gltf.scene;

            // Set up the model template
            template.visible = false; // Hide the template
            template.scale.set(CONFIG.VEHICLE.SCALE, CONFIG.VEHICLE.SCALE, CONFIG.VEHICLE.SCALE); // Apply scale to template
            template.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Store the template with its metadata
            vehicleTemplates.push({
                template: template,
                name: model.name,
                path: model.path
            });

            scene.add(template);
            updateLoadingProgress(); // Vehicle loaded
        } catch (error) {
            console.error(`Error loading vehicle model ${model.path}:`, error);
            updateLoadingProgress(); // Count errors as loaded to avoid getting stuck
        }
    }
}

// Spawn a random vehicle near the player (Networked)
function spawnRandomVehicle() {
    if (vehicleTemplates.length === 0) {
        console.warn('No vehicle models loaded yet');
        return;
    }

    // Get a random vehicle template
    const randomIndex = Math.floor(Math.random() * vehicleTemplates.length);
    const vehicleData = vehicleTemplates[randomIndex];

    // Calculate spawn position
    const spawnDistance = 5;
    const spawnAngle = Math.random() * Math.PI * 2;

    const spawnX = avatar.position.x + Math.sin(spawnAngle) * spawnDistance;
    const spawnZ = avatar.position.z + Math.cos(spawnAngle) * spawnDistance;

    // Raycast to find ground level at spawn position
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(spawnX, avatar.position.y + 10, spawnZ);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, rayDirection);

    const intersections = raycaster.intersectObjects(groundCollidableObjects, true);
    let spawnY = avatar.position.y; // Default to avatar height if no ground found

    if (intersections.length > 0) {
        spawnY = intersections[0].point.y + CONFIG.VEHICLE.GROUND_OFFSET;
    }

    const spawnPosition = new THREE.Vector3(spawnX, spawnY, spawnZ);

    // Send spawn request to server
    networkManager.spawnVehicle(vehicleData.name, spawnPosition, spawnAngle + Math.PI);
}

// Handle remote vehicle spawning
let pendingVehicleSpawns = [];

window.addEventListener('spawn-remote-vehicle', (e) => {
    const data = e.detail;

    if (vehicleTemplates.length === 0) {
        console.log(`Queueing vehicle spawn for ${data.id} (models not loaded)`);
        pendingVehicleSpawns.push(data);
        return;
    }

    spawnRemoteVehicle(data);
});

function spawnRemoteVehicle(data) {
    const templateData = vehicleTemplates.find(t => t.name === data.type);

    if (templateData) {
        // Check if already exists to avoid duplicates
        if (vehicles.find(v => v.networkId === data.id)) return;

        const vehicleMesh = templateData.template.clone();
        vehicleMesh.visible = true;

        vehicleMesh.position.set(data.x, data.y, data.z);
        vehicleMesh.rotation.y = data.rotation;
        // Scale is already applied to template, no need to reapply

        scene.add(vehicleMesh);
        collidableObjects.push(vehicleMesh);

        const vehicle = new Vehicle(vehicleMesh);
        vehicle.networkId = data.id; // Assign network ID
        vehicles.push(vehicle);

        // Register with NetworkManager
        networkManager.registerVehicle(data.id, vehicle);

        console.log(`Spawned networked vehicle: ${data.type}`);
    } else {
        console.warn(`Vehicle template not found for type: ${data.type}. Available: ${vehicleTemplates.map(t => t.name).join(', ')}`);
    }
}

// UI & Interaction
const avatarSelector = document.getElementById('avatar-selector');
const enterExitButton = document.getElementById('enter-exit-button');
const cameraPositionButton = document.getElementById('camera-position-button');
const spawnVehicleButton = document.getElementById('spawn-vehicle-button');

// Setup spawn vehicle// Event Listeners
spawnVehicleButton.addEventListener('click', () => {
    spawnRandomVehicle();
    // Disable button briefly to prevent spam
    spawnVehicleButton.disabled = true;
    setTimeout(() => {
        spawnVehicleButton.disabled = false;
    }, 1000);
});

const avatarList = ['Ch02_nonPBR', 'Ch13_nonPBR@T-Pose', 'Remy@T-Pose'];
avatarList.forEach(avatarName => {
    const option = document.createElement('option');
    option.value = avatarName;
    option.innerText = avatarName;
    avatarSelector.appendChild(option);
});

avatarSelector.addEventListener('change', (e) => {
    // Reset loading for avatar switch if we wanted to show it, but for now just load
    avatar.load(e.target.value);
});

document.getElementById('home-button').addEventListener('click', () => loadMap('/maps/mansion_map_-_unlimited_gun_for_hire.glb'));
document.getElementById('city-button').addEventListener('click', () => loadMap('/maps/city 3/source/town4new.glb'));
document.getElementById('circuit-button').addEventListener('click', () => loadMap('/maps/burnin_rubber_crash_n_burn_city.glb'));

// Camera position states
const CAMERA_POSITIONS = [
    { distance: 2, label: '1' },  // Close
    { distance: 4, label: '2' },  // Medium
    { distance: 6, label: '3' }   // Far
];
let currentCameraPosition = 0;

function updateCameraPosition() {
    const position = CAMERA_POSITIONS[currentCameraPosition];
    cameraController.setDistance(position.distance);
    cameraPositionButton.textContent = position.label;
}

cameraPositionButton.addEventListener('click', () => {
    currentCameraPosition = (currentCameraPosition + 1) % CAMERA_POSITIONS.length;
    updateCameraPosition();
});

// Initialize camera position
updateCameraPosition();

function toggleVehicle() {
    if (isInVehicle) {
        // Exit
        isInVehicle = false;
        if (currentVehicle) {
            currentVehicle.isOccupied = false;
            avatar.setVisible(true);
            const exitOffset = new THREE.Vector3(2, 0, 0);
            exitOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), currentVehicle.rotation.y);
            avatar.model.position.copy(currentVehicle.position).add(exitOffset);
            currentVehicle = null;

            // Update UI
            cameraController.setDistance(CONFIG.AVATAR.MIN_CAMERA_DISTANCE);
            // Reset to first camera position when exiting vehicle
            currentCameraPosition = 0;
            updateCameraPosition();
        }
    } else if (nearbyVehicle) {
        // Enter
        isInVehicle = true;
        currentVehicle = nearbyVehicle;
        currentVehicle.isOccupied = true;
        avatar.setVisible(false);

        // Update UI and reset camera to behind vehicle
        cameraController.setDistance(CONFIG.VEHICLE.MIN_CAMERA_DISTANCE);
        cameraController.resetVehicleCamera(currentVehicle.mesh);
        // Reset to first camera position when entering vehicle
        currentCameraPosition = 0;
        updateCameraPosition();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e') toggleVehicle();
    if (e.key.toLowerCase() === 'p') {
        console.log('--- Scene Graph Debug ---');
        console.log('Total objects:', scene.children.length);
        scene.children.forEach(child => {
            console.log(child.type, child.name, child.visible, child.position);
        });
        console.log('Remote Players:', networkManager.remotePlayers);
        console.log('Remote Zombies:', networkManager.remoteZombies);
        console.log('Vehicles:', vehicles);
    }
});
enterExitButton.addEventListener('click', toggleVehicle);

// Initial Setup - Load Burnin Rubber map by default
loadMap('/maps/burnin_rubber_crash_n_burn_city.glb');

// Load vehicle models and then load the avatar
loadVehicleModels().then(() => {
    console.log('All vehicle models loaded');
    spawnVehicleButton.disabled = false; // Enable the button once models are loaded

    // Process pending spawns
    if (pendingVehicleSpawns.length > 0) {
        console.log(`Processing ${pendingVehicleSpawns.length} pending vehicle spawns`);
        pendingVehicleSpawns.forEach(data => spawnRemoteVehicle(data));
        pendingVehicleSpawns = [];
    }
}).catch(error => {
    console.error('Error loading vehicle models:', error);
});

// Load the default avatar
avatar.load(avatarList[0]).then(() => {
    updateLoadingProgress(); // Avatar loaded
});

// Animation Loop
const clock = new THREE.Clock();
let frameCount = 0;

// FPS Counter
let lastTime = performance.now();
let frames = 0;
const fpsCounter = document.getElementById('fps-counter');

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    frameCount++;

    // Update FPS counter
    frames++;
    const currentTime = performance.now();
    if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastTime));
        if (fpsCounter) fpsCounter.textContent = `FPS: ${fps}`;
        frames = 0;
        lastTime = currentTime;
    }

    // Update Entities
    avatar.update(delta, camera);
    zombie.updateAnimation(delta);
    networkManager.update(delta, camera);

    // Network Update
    if (avatar.model) {
        networkManager.sendUpdate(
            avatar.model.position,
            avatar.model.rotation,
            avatar.currentAction,
            avatar.name
        );
    }

    // Zombie Network Update
    if (zombie.model) {
        networkManager.sendZombieUpdate(
            zombie.model.position,
            zombie.model.rotation.y,
            zombie.currentState
        );
    }

    // Vehicle Network Update
    if (isInVehicle && currentVehicle && currentVehicle.networkId) {
        networkManager.sendVehicleUpdate(
            currentVehicle.networkId,
            currentVehicle.mesh.position,
            currentVehicle.mesh.rotation.y
        );
    }

    // Throttled AI & Checks
    if (frameCount % CONFIG.PERFORMANCE.CHECK_INTERVAL === 0) {
        if (avatar.model) {
            zombie.updateAI(delta, avatar.position, avatar.model);
            avatar.checkGroundCollision(collidableObjects);
        }

        // Proximity Check
        if (!isInVehicle && avatar.model) {
            nearbyVehicle = null;
            const threshold = CONFIG.AVATAR.PROXIMITY_THRESHOLD;
            for (const vehicle of vehicles) {
                if (!vehicle.isOccupied) {
                    const dist = avatar.position.distanceTo(vehicle.position);
                    if (dist < threshold) {
                        nearbyVehicle = vehicle;
                        break;
                    }
                }
            }
        }
    }

    // Input & Movement
    const moveInput = inputManager.getMoveInput();
    const cameraInput = inputManager.getCameraInput();

    // Don't process movement if chat is focused
    const isChatFocused = window.chatInputFocused || false;

    if (isInVehicle && currentVehicle && !isChatFocused) {
        currentVehicle.update(delta, moveInput.vector, collidableObjects, groundCollidableObjects);
    } else if (avatar.model && !isChatFocused) {
        avatar.updateMovement(delta, moveInput, camera, collidableObjects);

        // Handle jump and attack when on foot
        if (inputManager.isJumpPressed()) {
            avatar.jump();
        }
        if (inputManager.isAttackPressed()) {
            avatar.attack();
        }
    }

    // Camera
    const target = isInVehicle ? currentVehicle : avatar;
    cameraController.update(delta, target, cameraInput, isInVehicle, collidableObjects, groundCollidableObjects, frameCount);

    // UI Updates
    if (isInVehicle) {
        enterExitButton.style.display = 'flex';
        enterExitButton.innerText = 'Exit';
    } else if (nearbyVehicle) {
        enterExitButton.style.display = 'flex';
        enterExitButton.innerText = 'Enter';
    } else {
        enterExitButton.style.display = 'none';
    }

    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Damage Effect
const damageOverlay = document.getElementById('damage-overlay');
window.addEventListener('player-hit', () => {
    damageOverlay.style.opacity = '0.5';
    setTimeout(() => {
        damageOverlay.style.opacity = '0';
    }, 500);
});

// Fullscreen Toggle
const fullscreenButton = document.getElementById('fullscreen-button');
fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});

animate();