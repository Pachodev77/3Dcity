const DB_NAME = '3DModelsCache';
const STORE_NAME = 'models';
const DB_VERSION = 1;

let db = null;

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

async function loadWithCache(url, loader) {
    try {
        const cachedData = await getCachedModel(url);

        if (cachedData) {
            const objectURL = URL.createObjectURL(new Blob([cachedData]));
            return new Promise((resolve, reject) => {
                loader.load(objectURL, (model) => {
                    URL.revokeObjectURL(objectURL);
                    resolve(model);
                }, undefined, (error) => {
                    console.error(`Error loading cached model ${url}:`, error);
                    reject(error);
                });
            });
        } else {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await setCachedModel(url, arrayBuffer.slice(0)); // Use slice(0) to clone the buffer

            const objectURL = URL.createObjectURL(new Blob([arrayBuffer]));
            return new Promise((resolve, reject) => {
                loader.load(objectURL, (model) => {
                    URL.revokeObjectURL(objectURL);
                    resolve(model);
                }, undefined, (error) => {
                    console.error(`Error loading network model ${url}:`, error);
                    reject(error);
                });
            });
        }
    } catch (error) {
        console.error(`Failed to load model ${url} with cache:`, error);
        // Fallback to simple network load on cache error
        return new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
        });
    }
}
