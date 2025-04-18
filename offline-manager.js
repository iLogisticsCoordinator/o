// Gestor de operaciones offline para PandaDash
// Este archivo maneja el almacenamiento, conteo y sincronización de datos offline

// Constantes de la base de datos
const DB_NAME = 'pandadash-offline-db';
const DB_VERSION = 1;
const PENDING_STORE = 'pending-uploads';
const PENDING_PHOTOS_STORE = 'pending-photos';

// Interfaz de eventos para notificar cambios en los datos pendientes
const offlineEvents = new EventTarget();

// Inicializar la base de datos IndexedDB
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Error al abrir IndexedDB:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            console.log('IndexedDB inicializada correctamente');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Almacén para operaciones pendientes (entregas)
            if (!db.objectStoreNames.contains(PENDING_STORE)) {
                const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id', autoIncrement: true });
                pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
                pendingStore.createIndex('type', 'type', { unique: false });
                console.log('Almacén de operaciones pendientes creado');
            }
            
            // Almacén para fotos pendientes
            if (!db.objectStoreNames.contains(PENDING_PHOTOS_STORE)) {
                const photosStore = db.createObjectStore(PENDING_PHOTOS_STORE, { keyPath: 'id', autoIncrement: true });
                photosStore.createIndex('factura', 'factura', { unique: false });
                photosStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('Almacén de fotos pendientes creado');
            }
        };
    });
}

// Guardar una operación pendiente
async function savePendingOperation(type, data) {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_STORE], 'readwrite');
        const store = transaction.objectStore(PENDING_STORE);
        
        const operation = {
            type: type,
            data: data,
            timestamp: new Date().toISOString(),
            attempts: 0,
            status: 'pending'
        };
        
        const request = store.add(operation);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Operación ${type} guardada localmente`);
                // Emitir evento para actualizar contadores
                offlineEvents.dispatchEvent(new CustomEvent('pendingOperationsChanged'));
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error(`Error al guardar operación ${type}:`, event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en savePendingOperation:', error);
        throw error;
    }
}

// Guardar una foto pendiente
async function savePendingPhoto(factura, nombreArchivo, fotoThumb, fotoMetadata) {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_PHOTOS_STORE], 'readwrite');
        const store = transaction.objectStore(PENDING_PHOTOS_STORE);
        
        // Creamos solo una miniatura para la vista previa y guardamos los metadatos
        const photoData = {
            factura: factura,
            nombreArchivo: nombreArchivo,
            fotoThumb: fotoThumb, // Base64 pequeño de la imagen (thumbnail)
            metadata: fotoMetadata, // Información adicional como dimensiones, etc.
            timestamp: new Date().toISOString(),
            status: 'pending'
        };
        
        const request = store.add(photoData);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Foto pendiente guardada para factura ${factura}`);
                // Emitir evento para actualizar contadores
                offlineEvents.dispatchEvent(new CustomEvent('pendingPhotosChanged'));
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error(`Error al guardar foto pendiente:`, event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en savePendingPhoto:', error);
        throw error;
    }
}

// Obtener el conteo de operaciones pendientes
async function getPendingOperationsCount() {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_STORE], 'readonly');
        const store = transaction.objectStore(PENDING_STORE);
        
        return new Promise((resolve, reject) => {
            const countRequest = store.count();
            
            countRequest.onsuccess = () => {
                resolve(countRequest.result);
            };
            
            countRequest.onerror = (event) => {
                console.error('Error al contar operaciones pendientes:', event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en getPendingOperationsCount:', error);
        return 0;
    }
}

// Obtener el conteo de fotos pendientes
async function getPendingPhotosCount() {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_PHOTOS_STORE], 'readonly');
        const store = transaction.objectStore(PENDING_PHOTOS_STORE);
        
        return new Promise((resolve, reject) => {
            const countRequest = store.count();
            
            countRequest.onsuccess = () => {
                resolve(countRequest.result);
            };
            
            countRequest.onerror = (event) => {
                console.error('Error al contar fotos pendientes:', event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en getPendingPhotosCount:', error);
        return 0;
    }
}

// Obtener todas las operaciones pendientes
async function getAllPendingOperations() {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_STORE], 'readonly');
        const store = transaction.objectStore(PENDING_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Error al obtener operaciones pendientes:', event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en getAllPendingOperations:', error);
        return [];
    }
}

// Obtener todas las fotos pendientes
async function getAllPendingPhotos() {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_PHOTOS_STORE], 'readonly');
        const store = transaction.objectStore(PENDING_PHOTOS_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Error al obtener fotos pendientes:', event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en getAllPendingPhotos:', error);
        return [];
    }
}

// Eliminar una operación pendiente por ID
async function removePendingOperation(id) {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_STORE], 'readwrite');
        const store = transaction.objectStore(PENDING_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log(`Operación pendiente ${id} eliminada`);
                // Emitir evento para actualizar contadores
                offlineEvents.dispatchEvent(new CustomEvent('pendingOperationsChanged'));
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error(`Error al eliminar operación pendiente ${id}:`, event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en removePendingOperation:', error);
        throw error;
    }
}

// Eliminar una foto pendiente por ID
async function removePendingPhoto(id) {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_PHOTOS_STORE], 'readwrite');
        const store = transaction.objectStore(PENDING_PHOTOS_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log(`Foto pendiente ${id} eliminada`);
                // Emitir evento para actualizar contadores
                offlineEvents.dispatchEvent(new CustomEvent('pendingPhotosChanged'));
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error(`Error al eliminar foto pendiente ${id}:`, event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en removePendingPhoto:', error);
        throw error;
    }
}

// Actualizar el estado de una operación pendiente
async function updatePendingOperationStatus(id, status, errorMessage = null) {
    try {
        const db = await initDatabase();
        const transaction = db.transaction([PENDING_STORE], 'readwrite');
        const store = transaction.objectStore(PENDING_STORE);
        
        return new Promise((resolve, reject) => {
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const operation = getRequest.result;
                if (!operation) {
                    reject(new Error(`Operación ${id} no encontrada`));
                    return;
                }
                
                operation.status = status;
                operation.lastUpdated = new Date().toISOString();
                
                if (status === 'error' && errorMessage) {
                    operation.errorMessage = errorMessage;
                }
                
                if (status === 'retrying') {
                    operation.attempts = (operation.attempts || 0) + 1;
                }
                
                const updateRequest = store.put(operation);
                
                updateRequest.onsuccess = () => {
                    console.log(`Estado de operación ${id} actualizado a ${status}`);
                    resolve(true);
                };
                
                updateRequest.onerror = (event) => {
                    console.error(`Error al actualizar estado de operación ${id}:`, event.target.error);
                    reject(event.target.error);
                };
            };
            
            getRequest.onerror = (event) => {
                console.error(`Error al obtener operación ${id}:`, event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        console.error('Error en updatePendingOperationStatus:', error);
        throw error;
    }
}

// Intentar sincronizar todas las operaciones pendientes
async function syncPendingOperations(apiUrl) {
    if (!navigator.onLine) {
        console.log('Sin conexión a Internet. La sincronización se intentará más tarde.');
        return {
            success: false,
            error: 'Sin conexión a Internet',
            pendingCount: await getPendingOperationsCount()
        };
    }
    
    try {
        const operations = await getAllPendingOperations();
        let successCount = 0;
        let errorCount = 0;
        
        for (const operation of operations) {
            try {
                // Actualizar estado a sincronizando
                await updatePendingOperationStatus(operation.id, 'syncing');
                
                // Preparar los datos para el envío
                const formData = new FormData();
                for (const key in operation.data) {
                    formData.append(key, operation.data[key]);
                }
                
                // Realizar solicitud al servidor
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    // Eliminar operación sincronizada correctamente
                    await removePendingOperation(operation.id);
                    successCount++;
                } else {
                    // Marcar como error con el mensaje del servidor
                    await updatePendingOperationStatus(
                        operation.id, 
                        'error', 
                        result.message || 'Error desconocido del servidor'
                    );
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error al sincronizar operación ${operation.id}:`, error);
                await updatePendingOperationStatus(
                    operation.id, 
                    'error', 
                    error.message || 'Error en la sincronización'
                );
                errorCount++;
            }
        }
        
        // Emitir evento para actualizar contadores
        offlineEvents.dispatchEvent(new CustomEvent('syncCompleted', { 
            detail: { success: successCount, error: errorCount } 
        }));
        
        return {
            success: true,
            synced: successCount,
            failed: errorCount,
            pendingCount: await getPendingOperationsCount()
        };
    } catch (error) {
        console.error('Error durante la sincronización:', error);
        return {
            success: false,
            error: error.message || 'Error durante la sincronización',
            pendingCount: await getPendingOperationsCount()
        };
    }
}

// Generar miniatura para mostrar en la vista de pendientes
function generateThumbnail(base64Data, maxWidth = 100, maxHeight = 100) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            
            // Calcular nuevas dimensiones manteniendo la proporción
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Calidad menor para reducir tamaño
            const thumbBase64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            resolve(thumbBase64);
        };
        
        img.onerror = function() {
            reject(new Error('Error al cargar la imagen para generar miniatura'));
        };
        
        img.src = 'data:image/jpeg;base64,' + base64Data;
    });
}

// Exportar todas las funciones necesarias
window.offlineManager = {
    initDatabase,
    savePendingOperation,
    savePendingPhoto,
    getPendingOperationsCount,
    getPendingPhotosCount,
    getAllPendingOperations,
    getAllPendingPhotos,
    removePendingOperation,
    removePendingPhoto,
    updatePendingOperationStatus,
    syncPendingOperations,
    generateThumbnail,
    events: offlineEvents
};
