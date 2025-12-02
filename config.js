export const CONFIG = {
    AVATAR: {
        MOVE_SPEED: 3,
        COLLISION_THRESHOLD: 0.5,
        PROXIMITY_THRESHOLD: 3,
        DEFAULT_SCALE: 0.005,
        REMY_SCALE: 0.002,
        MIN_CAMERA_DISTANCE: 1,
        CAMERA_LERP: 0.25,
        REMY_Y_OFFSET: 0.3
    },
    VEHICLE: {
        MAX_SPEED: 10,
        MAX_REVERSE_SPEED_RATIO: 0.5,
        ACCELERATION: 2,
        FRICTION: 4,
        STEERING_SPEED: 1.5,
        SCALE: 0.5,
        MIN_CAMERA_DISTANCE: 3,
        COLLISION_DISTANCE: 1.5,
        GROUND_OFFSET: 0.2
    },
    ZOMBIE: {
        SPEED: 0.5,
        DETECTION_RADIUS: 10,
        ATTACK_RADIUS: 1,
        SCALE: 0.005
    },
    CAMERA: {
        MAX_DISTANCE: 5,
        ROTATION_SPEED: 2,
        MIN_ANGLE_V: 0.0,
        MAX_ANGLE_V: 0.3, // Antes era 0.9
        MIN_HEIGHT: 1.0,
        GROUND_OFFSET: 0.5 // Añadido en un paso anterior
    },
    PERFORMANCE: {
        CHECK_INTERVAL: 4,
        MAX_PIXEL_RATIO: 2,
        SHADOW_MAP_SIZE: 1024
    }
};
