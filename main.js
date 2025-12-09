import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from './config.js';
import { Avatar } from './entities/Avatar.js';
import { Vehicle } from './entities/Vehicle.js';
import { Zombie } from './entities/Zombie.js';
import { CameraController } from './systems/CameraController.js';
import { InputManager } from './systems/InputManager.js';
import { NetworkManager } from './systems/NetworkManager.js';
import { BusinessSystem } from './systems/BusinessSystem.js';
import { InteriorManager } from './systems/InteriorManager.js';
import { ChatBubble } from './systems/ChatBubble.js';
import { ChatUI } from './systems/ChatUI.js';
import { MusicPlayer } from './systems/MusicPlayer.js';

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera Setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Audio Listener
const listener = new THREE.AudioListener();
camera.add(listener);

// Renderer Setup
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.PERFORMANCE.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = false;
scene.add(directionalLight);

// Collision Systems - Arrays vacíos ya que el suelo vendrá del mapa
const collidableObjects = [];
const groundCollidableObjects = [];

// Systems
const inputManager = new InputManager();
const cameraController = new CameraController(camera);
const networkManager = new NetworkManager(scene);

const musicPlayer = new MusicPlayer();

// ... (existing code) ...

// Entities
const avatar = new Avatar(scene);
const zombie = new Zombie(scene, collidableObjects, groundCollidableObjects);
avatar.setTargets([zombie]);

// Business System (Markers) - Initialize after avatar
const businessSystem = new BusinessSystem(scene, camera);
businessSystem.init();
businessSystem.setTarget(avatar);

// Interior Manager - Create independent interior spaces for each marker
const interiorManager = new InteriorManager(renderer, camera, avatar);
interiorManager.setMainScene(scene);

// Create 10 interior spaces (one for each business marker)
// Create 10 interior spaces (one for each business marker)
for (let i = 1; i <= 10; i++) {
    const options = {};
    if (i === 1) {
        options.modelPath = '/scenes/supermarket.glb';
        options.spawnPosition = new THREE.Vector3(0, 1.0, 0); // Spawn higher to avoid floor clipping
        options.modelScale = 1;
    } else if (i === 2) {
        options.modelPath = '/scenes/club.glb';
        options.modelScale = 1;
        // Default spawn is (0,0,5) in Interior.js unless overridden, 
        // we can set strict interior spawn if needed, e.g.
        // options.spawnPosition = new THREE.Vector3(0, 0, 0); 
    }
    interiorManager.createInterior(i, `Business ${i}`, options);
}

// Handle proximity interactions
businessSystem.setInteractionCallback((event, markerId) => {
    if (event === 'enter') {
        interiorManager.showPrompt(true);
    } else if (event === 'exit') {
        // Only hide button if not inside an interior
        if (!interiorManager.isInInterior) {
            interiorManager.showPrompt(false);
        }
    }
});

// Handle button clicks for entering/exiting interiors
window.addEventListener('interior-enter', () => {
    if (!interiorManager.isInInterior && businessSystem.nearestMarker) {
        interiorManager.enterInterior(businessSystem.nearestMarker.id);
    }
});

window.addEventListener('interior-exit', () => {
    if (interiorManager.isInInterior) {
        interiorManager.exitInterior();
    }
});

// Keep E key as alternative for desktop users
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e') {
        if (!interiorManager.isInInterior && businessSystem.nearestMarker) {
            interiorManager.enterInterior(businessSystem.nearestMarker.id);
        } else if (interiorManager.isInInterior) {
            interiorManager.exitInterior();
        }
    }
});

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
let currentMapName = 'burnin_rubber'; // Track current map name
let isInVehicle = false;
let currentVehicle = null; // Vehicle instance
let nearbyVehicle = null; // Vehicle instance

// Loading State
const loadingState = {
    totalAssets: 13, // 1 Map + 5 Vehicles + 3 Avatars + 4 Animations
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
    // Extract map name from URL
    let mapName = 'unknown';
    if (mapUrl.includes('mansion')) mapName = 'mansion';
    else if (mapUrl.includes('burnin_rubber')) mapName = 'burnin_rubber';
    else if (mapUrl.includes('town4new')) mapName = 'city';

    currentMapName = mapName;
    console.log('Loading map:', mapName);

    // Notify server of map change
    networkManager.changeMap(mapName);

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

// Avatar Management - Preloading
const AVATAR_MODELS = [
    'Ch02_nonPBR',
    'Ch13_nonPBR@T-Pose',
    'Remy@T-Pose'
];

const ANIMATION_MODELS = [
    '/avatars/animations/Idle.fbx',
    '/avatars/animations/Walking.fbx',
    '/avatars/animations/Running.fbx',
    '/avatars/animations/Punching.fbx'
];

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

// Preload all avatar models and animations
async function preloadAvatarModels() {
    const loader = new FBXLoader();

    console.log('Preloading avatar models...');

    // Preload all avatar models
    for (const avatarName of AVATAR_MODELS) {
        try {
            await loadWithCache(`/avatars/${avatarName}.fbx`, loader);
            console.log(`Preloaded avatar: ${avatarName}`);
            updateLoadingProgress();
        } catch (error) {
            console.error(`Error preloading avatar ${avatarName}:`, error);
            updateLoadingProgress(); // Count as loaded to avoid hanging
        }
    }

    // Preload all animations
    for (const animPath of ANIMATION_MODELS) {
        try {
            await loadWithCache(animPath, loader);
            console.log(`Preloaded animation: ${animPath}`);
            updateLoadingProgress();
        } catch (error) {
            console.error(`Error preloading animation ${animPath}:`, error);
            updateLoadingProgress(); // Count as loaded to avoid hanging
        }
    }

    console.log('All avatars and animations preloaded!');
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
        vehicle.setAudioListener(listener); // Pass the audio listener
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

// Avatar Selection Panel System
const avatarList = ['Ch02_nonPBR', 'Ch13_nonPBR@T-Pose', 'Remy@T-Pose'];
let currentPreviewIndex = 0;
let previewAvatar = null;
let previewAnimationId = null;
let previewMixer = null; // Animation mixer for preview

// Preview Scene Setup
const previewCanvas = document.getElementById('avatar-preview-canvas');
const previewScene = new THREE.Scene();
previewScene.background = new THREE.Color(0x1a1a2e);

const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
previewCamera.position.set(0, 1.5, 3);
previewCamera.lookAt(0, 1, 0);
let previewRenderer = null; // Will be initialized when panel opens

// Preview Lighting
const previewAmbient = new THREE.AmbientLight(0xffffff, 0.6);
previewScene.add(previewAmbient);

const previewDirectional = new THREE.DirectionalLight(0xffffff, 0.8);
previewDirectional.position.set(2, 3, 2);
previewScene.add(previewDirectional);

const previewBackLight = new THREE.DirectionalLight(0x6699ff, 0.3);
previewBackLight.position.set(-2, 2, -2);
previewScene.add(previewBackLight);

// Load avatar into preview
async function loadPreviewAvatar(avatarName) {
    // Store current rotation if exists
    const currentRotation = previewAvatar ? previewAvatar.rotation.y : 0;

    // Remove existing preview avatar (but don't dispose - it's from cache)
    if (previewAvatar) {
        previewScene.remove(previewAvatar);
        previewAvatar = null;
    }

    // Stop previous mixer
    if (previewMixer) {
        previewMixer.stopAllAction();
        previewMixer = null;
    }

    // Load new avatar using FBXLoader (from cache - should be instant)
    const loader = new FBXLoader();
    try {
        const fbx = await loadWithCache(`/avatars/${avatarName}.fbx`, loader);
        previewAvatar = fbx;

        // Apply scaling - 2x larger than game for better preview
        const previewScaleMultiplier = 2;
        if (avatarName === 'Remy@T-Pose') {
            previewAvatar.scale.set(
                CONFIG.AVATAR.REMY_SCALE * previewScaleMultiplier,
                CONFIG.AVATAR.REMY_SCALE * previewScaleMultiplier,
                CONFIG.AVATAR.REMY_SCALE * previewScaleMultiplier
            );
        } else {
            previewAvatar.scale.set(
                CONFIG.AVATAR.DEFAULT_SCALE * previewScaleMultiplier,
                CONFIG.AVATAR.DEFAULT_SCALE * previewScaleMultiplier,
                CONFIG.AVATAR.DEFAULT_SCALE * previewScaleMultiplier
            );
        }

        // Calculate bounding box to center the avatar properly
        const box = new THREE.Box3().setFromObject(previewAvatar);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Position avatar so it's centered and standing on the ground
        // Move to origin, then offset by negative center to truly center it
        previewAvatar.position.set(-center.x, -box.min.y, -center.z);

        // Restore rotation to maintain continuity
        previewAvatar.rotation.y = currentRotation;

        // Hide initially to prevent T-pose visibility
        previewAvatar.visible = false;
        previewScene.add(previewAvatar);

        // Load and play idle animation
        previewMixer = new THREE.AnimationMixer(previewAvatar);
        try {
            const idleAnim = await loadWithCache('/avatars/animations/Idle.fbx', loader);
            if (idleAnim.animations && idleAnim.animations.length > 0) {
                const action = previewMixer.clipAction(idleAnim.animations[0]);
                action.play();

                // Show avatar only after animation is ready
                previewAvatar.visible = true;
            }
        } catch (error) {
            console.warn('Could not load idle animation for preview:', error);
            // Show avatar anyway if animation fails to load
            previewAvatar.visible = true;
        }

        // Update name display
        document.getElementById('avatar-name-display').textContent = avatarName;
    } catch (error) {
        console.error(`Error loading preview avatar ${avatarName}:`, error);
    }
}

// Preview animation loop
const previewClock = new THREE.Clock();
function animatePreview() {
    previewAnimationId = requestAnimationFrame(animatePreview);

    const delta = previewClock.getDelta();

    // Update animation mixer
    if (previewMixer) {
        previewMixer.update(delta);
    }

    // Rotate preview avatar
    if (previewAvatar) {
        previewAvatar.rotation.y += delta * 0.5;
    }

    previewRenderer.render(previewScene, previewCamera);
}

// Panel controls
const avatarButton = document.getElementById('avatar-button');
const avatarPanelOverlay = document.getElementById('avatar-panel-overlay');
const avatarPrevBtn = document.getElementById('avatar-prev');
const avatarNextBtn = document.getElementById('avatar-next');
const avatarAcceptBtn = document.getElementById('avatar-accept-btn');
const avatarCancelBtn = document.getElementById('avatar-cancel-btn');

function openAvatarPanel() {
    // Initialize preview renderer if not already created (lazy initialization)
    if (!previewRenderer) {
        const previewCanvas = document.getElementById('avatar-preview-canvas');
        previewRenderer = new THREE.WebGLRenderer({
            canvas: previewCanvas,
            alpha: false,
            antialias: true
        });
        console.log('Preview renderer initialized');
    }

    // Set current avatar as preview
    currentPreviewIndex = avatarList.indexOf(avatar.name) || 0;

    avatarPanelOverlay.classList.add('active');

    // Resize preview canvas
    const container = document.getElementById('avatar-preview-container');
    previewRenderer.setSize(container.clientWidth, container.clientHeight);
    previewCamera.aspect = container.clientWidth / container.clientHeight;
    previewCamera.updateProjectionMatrix();

    // Load avatar after renderer is ready
    loadPreviewAvatar(avatarList[currentPreviewIndex]);

    // Start animation
    previewClock.start();
    animatePreview();
}

function closeAvatarPanel() {
    avatarPanelOverlay.classList.remove('active');

    // Stop animation
    if (previewAnimationId) {
        cancelAnimationFrame(previewAnimationId);
        previewAnimationId = null;
    }

    // Remove preview avatar from scene (but don't dispose - it's from cache)
    if (previewAvatar) {
        previewScene.remove(previewAvatar);
        previewAvatar = null;
    }
}

// Map Selector Panel
const mapSelectorButton = document.getElementById('map-selector-button');
const mapPanelOverlay = document.getElementById('map-panel-overlay');
const mapPanelClose = document.getElementById('map-panel-close');
const mapCards = document.querySelectorAll('.map-card');

// Open map panel
mapSelectorButton.addEventListener('click', () => {
    mapPanelOverlay.classList.add('active');
    updateMapPlayerCounts();
    updateCurrentMapIndicator();
});

// Close map panel
mapPanelClose.addEventListener('click', () => {
    mapPanelOverlay.classList.remove('active');
});

// Close on overlay click
mapPanelOverlay.addEventListener('click', (e) => {
    if (e.target === mapPanelOverlay) {
        mapPanelOverlay.classList.remove('active');
    }
});

// Map card click handlers
mapCards.forEach(card => {
    card.addEventListener('click', () => {
        const mapName = card.dataset.map;
        let mapUrl = '';

        if (mapName === 'mansion') {
            mapUrl = '/maps/mansion_map_-_unlimited_gun_for_hire.glb';
        } else if (mapName === 'city') {
            mapUrl = '/maps/city 3/source/town4new.glb';
        } else if (mapName === 'burnin_rubber') {
            mapUrl = '/maps/burnin_rubber_crash_n_burn_city.glb';
        }

        if (mapUrl) {
            loadMap(mapUrl);
            mapPanelOverlay.classList.remove('active');
        }
    });
});

// Update player counts on map cards
function updateMapPlayerCounts() {
    const playerCounts = networkManager.getPlayerCountsByMap();

    mapCards.forEach(card => {
        const mapName = card.dataset.map;
        const count = playerCounts[mapName] || 0;
        const badge = card.querySelector('.map-player-count');
        badge.textContent = `${count} player${count !== 1 ? 's' : ''}`;
    });
}

// Update current map indicator
function updateCurrentMapIndicator() {
    mapCards.forEach(card => {
        if (card.dataset.map === currentMapName) {
            card.classList.add('current-map');
        } else {
            card.classList.remove('current-map');
        }
    });
}

function navigateAvatar(direction) {
    currentPreviewIndex = (currentPreviewIndex + direction + avatarList.length) % avatarList.length;
    loadPreviewAvatar(avatarList[currentPreviewIndex]);
}

// Event listeners
avatarButton.addEventListener('click', openAvatarPanel);

avatarPrevBtn.addEventListener('click', () => navigateAvatar(-1));
avatarNextBtn.addEventListener('click', () => navigateAvatar(1));

avatarAcceptBtn.addEventListener('click', () => {
    avatar.load(avatarList[currentPreviewIndex]);
    closeAvatarPanel();
});

avatarCancelBtn.addEventListener('click', closeAvatarPanel);

// Close on overlay click
avatarPanelOverlay.addEventListener('click', (e) => {
    if (e.target === avatarPanelOverlay) {
        closeAvatarPanel();
    }
});



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
            if (currentVehicle.stopEngine) currentVehicle.stopEngine(); // Stop engine sound
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
        if (currentVehicle.startEngine) currentVehicle.startEngine(); // Start engine sound
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

// Make networkManager global for PvP access
window.networkManager = networkManager;

window.addEventListener('player-hit', (e) => {
    if (avatar) {
        const damage = e.detail && e.detail.amount ? e.detail.amount : 10;
        avatar.takeDamage(damage);
        console.log('Player took damage! Health:', avatar.health);
    }
});

// Initial Setup - Load Burnin Rubber map by default
loadMap('/maps/burnin_rubber_crash_n_burn_city.glb');

// Preload all assets (vehicles and avatars) in parallel
Promise.all([
    loadVehicleModels(),
    preloadAvatarModels()
]).then(() => {
    console.log('All vehicle and avatar models preloaded');
    spawnVehicleButton.disabled = false; // Enable the button once models are loaded

    // Process pending vehicle spawns
    if (pendingVehicleSpawns.length > 0) {
        console.log(`Processing ${pendingVehicleSpawns.length} pending vehicle spawns`);
        pendingVehicleSpawns.forEach(data => spawnRemoteVehicle(data));
        pendingVehicleSpawns = [];
    }

    // Load the default avatar (now instant from cache)
    return avatar.load(avatarList[0]);
}).catch(error => {
    console.error('Error loading models:', error);
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
    businessSystem.update(delta);

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
            zombie.updateAI(delta, avatar.position, avatar.model, camera);
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

    // Avatar Physics (Run every frame)
    if (avatar.model) {
        avatar.checkGroundCollision(collidableObjects);
    }

    // Input & Movement
    const moveInput = inputManager.getMoveInput(isInVehicle);
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
    // Render the active scene (main world or interior)
    const activeScene = interiorManager.getCurrentScene();
    renderer.render(activeScene, camera);
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