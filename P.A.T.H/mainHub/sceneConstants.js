// Scene-wide numeric constants and coordinate conversion helpers.
// Keeping these in a dedicated module reduces cognitive load in scene.js.

export const WORLD_SIZE = 200000; // total world width/height (world-units)
export const WORLD_SCALE = 0.15; // scene-units per world-unit
export const CHUNK_SIZE = 4000; // spatial-partition chunk edge (world-units)
export const DRAG_SENSITIVITY = 0.55; // 0..1 lower = less sensitive drag
export const WORLD_HALF = WORLD_SIZE / 2; // convenience: max |world coord|

export const REMOTE_POS_LERP = 0.12; // remote player interpolation factor
export const REMOTE_STALE_REMOVE_MS = 12000; // remove unseen remote balloons

export const BALLOON_COLLISION_REPEL = 0.24;
export const BALLOON_COLLISION_DAMP = 0.84;
export const BALLOON_COLLISION_MAX_PUSH = 18;

export const AURA_COLORS = {
    none: null,
    sun: 0xffc44d,
    frost: 0x7fd9ff,
    forest: 0x67d57a,
    cosmic: 0x9e8dff,
    royal: 0xe08bff
};

export function worldToScene(value) {
    return -value * WORLD_SCALE;
}

export function sceneToWorld(value) {
    return -value / WORLD_SCALE;
}
