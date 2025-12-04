import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const DB_NAME = '3DModelsCache';
const STORE_NAME = 'models';
const DB_VERSION = 1;

let db = null;
const memoryCache = new Map(); // In-memory cache for parsed models

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'url' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject('Error opening IndexedDB.');
        };
    });
}

async function getCachedModel(url) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.data : null);
        };

        request.onerror = (event) => {
            console.error('Error getting model from cache:', event.target.error);
            reject('Error getting model from cache.');
        };
    });
}

async function setCachedModel(url, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ url, data });

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error('Error setting model in cache:', event.target.error);
            reject('Error setting model in cache.');
        };
    });
}

export async function loadWithCache(url, loader) {
    // 1. Check Memory Cache first (Fastest)
    if (memoryCache.has(url)) {
        // Clone the model to ensure unique instances
        const cached = memoryCache.get(url);
        // Use SkeletonUtils.clone for skinned meshes (avatars), regular clone for others
        const clone = SkeletonUtils.clone(cached);

        // Clone animations if present
        if (cached.animations) {
            clone.animations = cached.animations; // Animations are read-only, reference is fine
        }
        return clone;
    }

    try {
        // 2. Check IndexedDB (Persistent Cache)
        const cachedData = await getCachedModel(url);
        let model;

        if (cachedData) {
            const objectURL = URL.createObjectURL(new Blob([cachedData]));
            model = await new Promise((resolve, reject) => {
                loader.load(objectURL, (m) => {
                    URL.revokeObjectURL(objectURL);
                    resolve(m);
                }, undefined, (error) => {
                    console.error(`Error loading cached model ${url}:`, error);
                    reject(error);
                });
            });
        } else {
            // 3. Network Load
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await setCachedModel(url, arrayBuffer.slice(0)); // Store in DB

            const objectURL = URL.createObjectURL(new Blob([arrayBuffer]));
            model = await new Promise((resolve, reject) => {
                loader.load(objectURL, (m) => {
                    URL.revokeObjectURL(objectURL);
                    resolve(m);
                }, undefined, (error) => {
                    console.error(`Error loading network model ${url}:`, error);
                    reject(error);
                });
            });
        }

        // Store in memory cache for future use
        memoryCache.set(url, model);

        // Return a clone for the first usage too, to keep the cached one pure
        const clone = SkeletonUtils.clone(model);
        if (model.animations) {
            clone.animations = model.animations;
        }
        return clone;

    } catch (error) {
        console.error(`Failed to load model ${url} with cache:`, error);
        // Fallback
        return new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
        });
    }
}
