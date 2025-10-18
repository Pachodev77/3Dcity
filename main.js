import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Collidable objects
const collidableObjects = [ground];

// City Model
const gltfLoader = new GLTFLoader();
gltfLoader.load('maps/city 3/source/town4new.glb', (gltf) => {
    gltf.scene.traverse(function (child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    scene.add(gltf.scene);
    collidableObjects.push(gltf.scene);
});

// Avatar variables
let currentAvatar = null;
let animationMixer = null;
const animationClips = {};
let currentAction = 'idle';
const avatarList = ['Ch02_nonPBR', 'Ch08_nonPBR', 'Ch15_nonPBR'];

// UI
const avatarSelector = document.getElementById('avatar-selector');
avatarList.forEach(avatarName => {
    const option = document.createElement('option');
    option.value = avatarName;
    option.innerText = avatarName;
    avatarSelector.appendChild(option);
});

avatarSelector.addEventListener('change', (e) => {
    loadAvatar(e.target.value);
});

// Load initial avatar
loadAvatar(avatarList[0]);


// Avatar Loading
function loadAvatar(avatarName) {
    if (currentAvatar) {
        scene.remove(currentAvatar);
    }

    const fbxLoader = new FBXLoader();
    fbxLoader.load(`avatars/${avatarName}.fbx`, (fbx) => {
        currentAvatar = fbx;
        currentAvatar.scale.set(0.005, 0.005, 0.005);
        currentAvatar.position.set(0, 0, 5);
        currentAvatar.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(currentAvatar);

        // Animations
        animationMixer = new THREE.AnimationMixer(currentAvatar);
        const animLoader = new FBXLoader();
        const animationsToLoad = {
            'idle': 'avatars/animations/Idle.fbx',
            'walking': 'avatars/animations/Walking.fbx',
            'running': 'avatars/animations/Running.fbx'
        };
        
        let animationsLoaded = 0;
        const totalAnimations = Object.keys(animationsToLoad).length;

        for (const animName in animationsToLoad) {
            animLoader.load(animationsToLoad[animName], (anim) => {
                animationClips[animName] = anim.animations[0];
                animationsLoaded++;
                if (animationsLoaded === totalAnimations) {
                    playAnimation('idle');
                }
            });
        }
    });
}

function playAnimation(name) {
    if (currentAction === name) return;
    if (animationClips[name]) {
        const action = animationMixer.clipAction(animationClips[name]);
        if (animationClips[currentAction]){
            const previousAction = animationMixer.clipAction(animationClips[currentAction]);
            if (previousAction) {
                previousAction.fadeOut(0.5);
            }
        }
        action.reset().fadeIn(0.5).play();
        currentAction = name;
    }
}

// Joysticks
const moveJoystick = nipplejs.create({
    zone: document.getElementById('joystick-container-move'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'blue'
});

const cameraJoystick = nipplejs.create({
    zone: document.getElementById('joystick-container-camera'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'red'
});

let moveData = { vector: { x: 0, y: 0 }, distance: 0 };
let cameraData = { x: 0, y: 0 };

moveJoystick.on('move', (evt, data) => {
    moveData = data;
});
moveJoystick.on('end', () => {
    moveData = { vector: { x: 0, y: 0 }, distance: 0 };
});

cameraJoystick.on('move', (evt, data) => {
    cameraData = data.vector;
});
cameraJoystick.on('end', () => {
    cameraData = { x: 0, y: 0 };
});

// Camera zoom variables
let cameraDistance = 8;
const minCameraDistance = 3;
const maxCameraDistance = 15;

// Mouse wheel zoom
window.addEventListener('wheel', (event) => {
    cameraDistance += event.deltaY * 0.01;
    cameraDistance = Math.max(minCameraDistance, Math.min(maxCameraDistance, cameraDistance));
});

// Pinch zoom
let initialPinchDistance = 0;
let initialCameraDistance = 0;

window.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
        initialPinchDistance = getPinchDistance(event);
        initialCameraDistance = cameraDistance;
    }
});

window.addEventListener('touchmove', (event) => {
    if (event.touches.length === 2) {
        const currentPinchDistance = getPinchDistance(event);
        const pinchDelta = currentPinchDistance - initialPinchDistance;
        cameraDistance = initialCameraDistance - pinchDelta * 0.05;
        cameraDistance = Math.max(minCameraDistance, Math.min(maxCameraDistance, cameraDistance));
    }
});

function getPinchDistance(event) {
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Raycaster for camera collision
const raycaster = new THREE.Raycaster();

// Animation loop
const clock = new THREE.Clock();
let cameraAngleH = 0;
let cameraAngleVOffset = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (animationMixer) {
        animationMixer.update(delta);
    }

    if (currentAvatar) {
        const moveSpeed = 3;

        // Get camera direction for movement
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        viewDirection.y = 0;
        viewDirection.normalize();

        const right = new THREE.Vector3().crossVectors(camera.up, viewDirection).normalize();

        const moveDirection = right.multiplyScalar(-moveData.vector.x).add(viewDirection.multiplyScalar(moveData.vector.y)).normalize();

        if (moveData.distance > 0) {
            // Move avatar
            const speed = moveData.distance / 50 * moveSpeed;
            currentAvatar.position.add(moveDirection.clone().multiplyScalar(speed * delta));

            // Rotate avatar to face movement direction
            currentAvatar.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);

            // Animation
            playAnimation('running');
        } else {
            playAnimation('idle');
        }
        
        // Camera Rotation
        const cameraRotationSpeed = 2;
        cameraAngleH -= cameraData.x * cameraRotationSpeed * delta;
        cameraAngleVOffset -= cameraData.y * cameraRotationSpeed * delta;
        cameraAngleVOffset = Math.max(-0.4, Math.min(0.4, cameraAngleVOffset));

        // Calculate base vertical angle from zoom
        const minAngleV = 0.3;
        const maxAngleV = Math.PI / 2 - 0.5;
        const t = (cameraDistance - minCameraDistance) / (maxCameraDistance - minCameraDistance);
        const baseAngleV = minAngleV + t * (maxAngleV - minAngleV);

        const cameraAngleV = baseAngleV + cameraAngleVOffset;
        
        // Camera follow with collision
        const avatarPosition = currentAvatar.position.clone().add(new THREE.Vector3(0, 1, 0));

        const cameraOffset = new THREE.Vector3(0, 0, cameraDistance);
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleV);
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleH);

        const desiredCameraPosition = avatarPosition.clone().add(cameraOffset);

        const direction = desiredCameraPosition.clone().sub(avatarPosition).normalize();
        raycaster.set(avatarPosition, direction);
        const intersections = raycaster.intersectObjects(collidableObjects, true);

        let finalCameraPosition = desiredCameraPosition;
        if (intersections.length > 0) {
            if (intersections[0].distance < cameraDistance) {
                finalCameraPosition = avatarPosition.clone().add(direction.multiplyScalar(intersections[0].distance - 0.2));
            }
        }

        if (finalCameraPosition.y < 0.5) {
            finalCameraPosition.y = 0.5;
        }

        camera.position.lerp(finalCameraPosition, 0.2);
        camera.lookAt(avatarPosition);
    }

    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});