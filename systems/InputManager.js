export class InputManager {
    constructor() {
        this.moveData = { vector: { x: 0, y: 0 }, distance: 0 };
        this.cameraData = { x: 0, y: 0 };
        this.keys = {};

        this.setupJoysticks();
        this.setupKeyboard();
    }

    setupJoysticks() {
        // Move Joystick
        const moveZone = document.getElementById('joystick-container-move');
        if (moveZone) {
            const moveJoystick = nipplejs.create({
                zone: moveZone,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'orange',
                restOpacity: 1
            });

            moveJoystick.on('move', (evt, data) => {
                this.moveData = data;
            });
            moveJoystick.on('end', () => {
                this.moveData = { vector: { x: 0, y: 0 }, distance: 0 };
            });
        }

        // Camera Joystick
        const cameraZone = document.getElementById('joystick-container-camera');
        if (cameraZone) {
            const cameraJoystick = nipplejs.create({
                zone: cameraZone,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'orange',
                restOpacity: 1
            });

            cameraJoystick.on('move', (evt, data) => {
                this.cameraData = data.vector;
            });
            cameraJoystick.on('end', () => {
                this.cameraData = { x: 0, y: 0 };
            });
        }
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    getMoveInput() {
        return this.moveData;
    }

    getCameraInput() {
        return this.cameraData;
    }

    isKeyPressed(key) {
        return !!this.keys[key.toLowerCase()];
    }
}
