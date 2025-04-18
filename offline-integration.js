// Integración del sistema offline con la aplicación principal
// Este archivo se debe cargar después de offline-manager.js

// Referencias a los elementos del DOM para la UI offline
let offlinePanel;
let offlineTrigger;
let operationsCounter;
let photosCounter;
let pendingOperationsList;
let pendingPhotosList;
let syncAllBtn;
let syncStatus;
let tabButtons;
let tabPanes;

// Constantes
const API_URL_POST = "https://script.google.com/macros/s/AKfycbwgnkjVCMWlWuXnVaxSBD18CGN3rXGZtQZIvX9QlBXSgbQndWC4uqQ2sc00DuNH6yrb/exec";

// Inicializar la UI offline
function initOfflineUI() {
    // Agregamos el botón flotante para mostrar el panel
    if (!document.querySelector('.offline-trigger')) {
        const triggerButton = document.createElement('div');
        triggerButton.className = 'offline-trigger';
        triggerButton.innerHTML = '<i class="fas fa-sync-alt"></i><div class="offline-badge">0</div>';
        document.body.appendChild(triggerButton);
        offlineTrigger = triggerButton;
        
        // Evento al hacer clic en el botón
        offlineTrigger.addEventListener('click', () => {
            showOfflinePanel();
        });
    }
    
    // Obtenemos referencias a elementos si ya están en el DOM
    offlinePanel = document.getElementById('offlinePanel');
    operationsCounter = document.getElementById('operationsCounter');
    photosCounter = document.getElementById('photosCounter');
    pendingOperationsList = document.getElementById('pendingOperationsList');
    pendingPhotosList = document.getElementById('pendingPhotosList');
    syncAllBtn = document.getElementById('syncAllBtn');
    syncStatus = document.getElementById('syncStatus');
    tabButtons = document.querySelectorAll('.tab-btn');
    tabPanes = document.querySelectorAll('.tab-pane');
    
    // Configuramos los eventos de las pestañas
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Desactivamos todas las pestañas
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Activamos la pestaña seleccionada
            button.classList.add('active');
            document.getElementById(`${tabName}Tab`).classList.add('active');
        });
    });
    
    // Evento para cerrar el panel
    document.getElementById('closeOfflinePanel').addEventListener('click', () => {
        hideOfflinePanel();
    });
    
    // Evento para sincronizar todos los datos pendientes
    syncAllBtn.addEventListener('click', () => {
        syncAllPendingData();
    });
    
    // Configurar actualización de contadores cuando cambian los datos pendientes
    window.offlineManager.events.addEventListener('pendingOperationsChanged', updateCounters);
    window.offlineManager.events.addEventListener('pendingPhotosChanged', updateCounters);
    window.offlineManager.events.addEventListener('syncCompleted', updateCounters);
    
    // Actualizar contadores inmediatamente
    updateCounters();
    
    // Configurar recepción de mensajes del Service Worker
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'sync-status') {
            updateSyncStatus(event.data.status, event.data.message);
        } else if (event.data && event.data.type === 'start-sync') {
            if (event.data.syncType === 'operations') {
                handleOperationsSync(event.source);
            } else if (event.data.syncType === 'photos') {
                handlePhotosSync(event.source);
            }
        }
    });
}

// Mostrar el panel offline
function showOfflinePanel() {
    offlinePanel.classList.add('active');
    updateOfflineLists();
}

// Ocultar el panel offline
function hideOfflinePanel() {
    offlinePanel.classList.remove('active');
}

// Actualizar los contadores y el botón flotante
async function updateCounters() {
    try {
        const operationsCount = await window.offlineManager.getPendingOperationsCount();
        const photosCount = await window.offlineManager.getPendingPhotosCount();
        const totalCount = operationsCount + photosCount;
        
        // Actualizar los contadores en el panel
        if (operationsCounter) {
            operationsCounter.querySelector('.stat-value').textContent = operationsCount;
        }
        
        if (photosCounter) {
            photosCounter.querySelector('.stat-value').textContent = photosCount;
        }
        
        // Actualizar el botón flotante
        if (offlineTrigger) {
            const badge = offlineTrigger.querySelector('.offline-badge');
            if (badge) {
                badge.textContent = totalCount;
                badge.style.display = totalCount > 0 ? 'flex' : 'none';
            }
            
            // Ocultar el botón si no hay elementos pendientes
            offlineTrigger.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        // Actualizar las listas si el panel está visible
        if (offlinePanel && offlinePanel.classList.contains('active')) {
            updateOfflineLists();
        }
        
    } catch (error) {
        console.error('Error al actualizar contadores:', error);
    }
}

// Actualizar las listas de operaciones y fotos pendientes
async function updateOfflineLists() {
    try {
        // Actualizar lista de operaciones pendientes
        const operations = await window.offlineManager.getAllPendingOperations();
        
        if (pendingOperationsList) {
            if (operations.length === 0) {
                pendingOperationsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <p>No hay operaciones pendientes</p>
                    </div>
                `;
            } else {
                pendingOperationsList.innerHTML = '';
                
                operations.forEach(operation => {
                    const operationEl = document.createElement('div');
                    operationEl.className = 'pending-item';
                    
                    // Si tiene estado de error, agregar clase
                    if (operation.status === 'error') {
                        operationEl.classList.add('error');
                    }
                    
                    // Formatear la fecha
                    const date = new Date(operation.timestamp);
                    const formattedDate = date.toLocaleString();
                    
                    // Determinar ícono según el tipo de operación
                    let icon = 'fa-clipboard-list';
                    if (operation.type === 'entrega') {
                        icon = 'fa-truck';
                    } else if (operation.type === 'photo') {
                        icon = 'fa-camera';
                    }
                    
                    // Armar el contenido HTML
                    let html = `
                        <div class="item-header">
                            <div class="item-title"><i class="fas ${icon}"></i> ${capitalizeFirst(operation.type)}</div>
                            <div class="item-timestamp">${formattedDate}</div>
                        </div>
                        <div class="item-details">
                    `;
                    
                    // Agregar las propiedades más importantes
                    const keysToShow = ['factura', 'documento', 'lote', 'referencia', 'cantidad', 'nit'];
                    
                    keysToShow.forEach(key => {
                        if (operation.data && operation.data[key]) {
                            html += `
                                <div class="item-property">
                                    <div class="property-name">${capitalizeFirst(key)}:</div>
                                    <div class="property-value">${operation.data[key]}</div>
                                </div>
                            `;
                        }
                    });
                    
                    // Si tiene error, mostrar el mensaje
                    if (operation.status === 'error' && operation.errorMessage) {
                        html += `
                            <div class="item-property error-message">
                                <div class="property-name">Error:</div>
                                <div class="property-value">${operation.errorMessage}</div>
                            </div>
                        `;
                    }
                    
                    html += `</div>`; // Cerrar item-details
                    
                    // Agregar acciones
                    html += `
                        <div class="item-actions">
                            ${operation.status === 'error' ? 
                                `<button class="btn btn-sm btn-primary retry-btn" data-id="${operation.id}">
                                    <i class="fas fa-redo"></i> Reintentar
                                </button>` : ''
                            }
                            <button class="btn btn-sm btn-danger delete-btn" data-id="${operation.id}">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </div>
                    `;
                    
                    operationEl.innerHTML = html;
                    pendingOperationsList.appendChild(operationEl);
                    
                    // Agregar eventos a los botones
                    const retryBtn = operationEl.querySelector('.retry-btn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => {
                            retryOperation(operation.id);
                        });
                    }
                    
                    const deleteBtn = operationEl.querySelector('.delete-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', () => {
                            deleteOperation(operation.id);
                        });
                    }
                });
            }
        }
        
        // Actualizar lista de fotos pendientes
        const photos = await window.offlineManager.getAllPendingPhotos();
        
        if (pendingPhotosList) {
            if (photos.length === 0) {
                pendingPhotosList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <p>No hay fotos pendientes</p>
                    </div>
                `;
            } else {
                pendingPhotosList.innerHTML = '';
                
                photos.forEach(photo => {
                    const photoEl = document.createElement('div');
                    photoEl.className = 'photo-item';
                    
                    // Formatear la fecha
                    const date = new Date(photo.timestamp);
                    const formattedDate = date.toLocaleString();
                    
                    // Armar el contenido HTML
                    let html = `
                        <div class="photo-preview">
                            ${photo.fotoThumb ? 
                                `<img src="data:image/jpeg;base64,${photo.fotoThumb}" alt="Foto pendiente">` : 
                                `<i class="fas fa-image"></i>`
                            }
                        </div>
                        <div class="photo-info">
                            <div class="photo-title">Factura: ${photo.factura}</div>
                            <div class="photo-meta">${formattedDate}</div>
                            <div class="photo-actions">
                                <button class="btn btn-sm btn-danger delete-photo-btn" data-id="${photo.id}">
                                    <i class="fas fa-trash"></i> Eliminar
                                </button>
                            </div>
                        </div>
                    `;
                    
                    photoEl.innerHTML = html;
                    pendingPhotosList.appendChild(photoEl);
                    
                    // Agregar evento al botón de eliminar
                    const deleteBtn = photoEl.querySelector('.delete-photo-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', () => {
                            deletePhoto(photo.id);
                        });
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('Error al actualizar listas offline:', error);
    }
}

// Reintentar una operación pendiente
async function retryOperation(id) {
    try {
        await window.offlineManager.updatePendingOperationStatus(id, 'retrying');
        syncPendingOperations();
    } catch (error) {
        console.error('Error al reintentar operación:', error);
        showToast('Error al reintentar operación', 'error');
    }
}

// Eliminar una operación pendiente
async function deleteOperation(id) {
    if (confirm('¿Estás seguro de eliminar esta operación pendiente? Esta acción no se puede deshacer.')) {
        try {
            await window.offlineManager.removePendingOperation(id);
            showToast('Operación eliminada correctamente', 'success');
            updateCounters();
        } catch (error) {
            console.error('Error al eliminar operación:', error);
            showToast('Error al eliminar operación', 'error');
        }
    }
}

// Eliminar una foto pendiente
async function deletePhoto(id) {
    if (confirm('¿Estás seguro de eliminar esta foto pendiente? Esta acción no se puede deshacer.')) {
        try {
            await window.offlineManager.removePendingPhoto(id);
            showToast('Foto eliminada correctamente', 'success');
            updateCounters();
        } catch (error) {
            console.error('Error al eliminar foto:', error);
            showToast('Error al eliminar foto', 'error');
        }
    }
}

// Sincronizar todas las operaciones pendientes
async function syncPendingOperations() {
    updateSyncStatus('syncing', 'Sincronizando operaciones pendientes...');
    syncAllBtn.disabled = true;
    
    try {
        const result = await window.offlineManager.syncPendingOperations(API_URL_POST);
        
        if (result.success) {
            updateSyncStatus('success', `Sincronización completada. ${result.synced} operaciones sincronizadas.`);
        } else {
            updateSyncStatus('error', `Error al sincronizar: ${result.error}`);
        }
    } catch (error) {
        console.error('Error al sincronizar operaciones:', error);
        updateSyncStatus('error', `Error al sincronizar: ${error.message || 'Error desconocido'}`);
    } finally {
        syncAllBtn.disabled = false;
        updateCounters();
    }
}

// Método para syncronizar todos los datos pendientes
async function syncAllPendingData() {
    updateSyncStatus('syncing', 'Sincronizando todos los datos pendientes...');
    syncAllBtn.disabled = true;
    
    try {
        // Intentar registrar una tarea de sincronización con el Service Worker
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-all');
            
            updateSyncStatus('syncing', 'Sincronización programada. Se ejecutará cuando haya conexión.');
        } else {
            // Sin soporte para Background Sync, hacemos la sincronización ahora
            await syncPendingOperations();
        }
    } catch (error) {
        console.error('Error al programar sincronización:', error);
        updateSyncStatus('error', `Error al iniciar sincronización: ${error.message || 'Error desconocido'}`);
        syncAllBtn.disabled = false;
    }
}

// Manejar solicitudes de sincronización desde el Service Worker
async function handleOperationsSync(serviceWorker) {
    try {
        const result = await window.offlineManager.syncPendingOperations(API_URL_POST);
        
        // Enviar respuesta al Service Worker
        serviceWorker.postMessage({
            type: 'sync-operations-result',
            success: result.success,
            message: result.success 
                ? `${result.synced} operaciones sincronizadas` 
                : `Error: ${result.error}`,
            details: result
        });
        
        // Actualizar UI
        updateCounters();
    } catch (error) {
        console.error('Error en handleOperationsSync:', error);
        serviceWorker.postMessage({
            type: 'sync-operations-result',
            success: false,
            message: `Error: ${error.message || 'Error desconocido'}`,
            details: { error: error.message }
        });
    }
}

// Manejar solicitudes de sincronización de fotos desde el Service Worker
async function handlePhotosSync(serviceWorker) {
    try {
        // Implementar la sincronización de fotos
        const result = { success: true, synced: 0, failed: 0 }; // Placeholder
        
        // Aquí debería ir la implementación real de la sincronización de fotos
        
        // Enviar respuesta al Service Worker
        serviceWorker.postMessage({
            type: 'sync-photos-result',
            success: result.success,
            message: result.success 
                ? `${result.synced} fotos sincronizadas` 
                : `Error: ${result.error}`,
            details: result
        });
        
        // Actualizar UI
        updateCounters();
    } catch (error) {
        console.error('Error en handlePhotosSync:', error);
        serviceWorker.postMessage({
            type: 'sync-photos-result',
            success: false,
            message: `Error: ${error.message || 'Error desconocido'}`,
            details: { error: error.message }
        });
    }
}

// Actualizar el estado de sincronización en la UI
function updateSyncStatus(status, message) {
    if (syncStatus) {
        // Eliminar todas las clases de estado
        syncStatus.classList.remove('success', 'error', 'syncing');
        
        // Agregar la clase correspondiente al estado actual
        syncStatus.classList.add(status);
        
        // Establecer el contenido del mensaje
        let icon = '';
        switch (status) {
            case 'success':
                icon = '<i class="fas fa-check-circle"></i> ';
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-circle"></i> ';
                break;
            case 'syncing':
                icon = '<i class="fas fa-sync fa-spin"></i> ';
                break;
        }
        
        syncStatus.innerHTML = icon + message;
    }
}

// Mostrar un mensaje toast
function showToast(message, type = 'info') {
    // Verificar si ya existe un contenedor de toasts
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
        
        // Estilos para el contenedor de toasts
        toastContainer.style.position = 'fixed';
        toastContainer.style.bottom = '20px';
        toastContainer.style.left = '50%';
        toastContainer.style.transform = 'translateX(-50%)';
        toastContainer.style.zIndex = '9999';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
    }
    
    // Crear el elemento toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Estilos para el toast
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.marginBottom = '8px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.minWidth = '250px';
    toast.style.maxWidth = '320px';
    toast.style.animation = 'fadeIn 0.3s, fadeOut 0.3s 2.7s';
    
    // Estilos según el tipo
    switch (type) {
        case 'success':
            toast.style.backgroundColor = '#4CC9F0';
            toast.style.color = '#FFFFFF';
            toast.innerHTML = '<i class="fas fa-check-circle"></i>';
            break;
        case 'error':
            toast.style.backgroundColor = '#F72585';
            toast.style.color = '#FFFFFF';
            toast.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
            break;
        case 'warning':
            toast.style.backgroundColor = '#F8961E';
            toast.style.color = '#FFFFFF';
            toast.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            break;
        default:
            toast.style.backgroundColor = '#4361EE';
            toast.style.color = '#FFFFFF';
            toast.innerHTML = '<i class="fas fa-info-circle"></i>';
    }
    
    // Agregar mensaje
    toast.innerHTML += ` ${message}`;
    
    // Agregar al contenedor
    toastContainer.appendChild(toast);
    
    // Eliminar después de 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toastContainer.removeChild(toast);
            
            // Si no quedan toasts, eliminar el contenedor
            if (toastContainer.children.length === 0) {
                document.body.removeChild(toastContainer);
            }
        }, 300);
    }, 3000);
}

// Función auxiliar para capitalizar la primera letra
function capitalizeFirst(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Guardar una operación de entrega pendiente
async function saveOfflineDelivery(documentoData, lote, referencia, cantidad, factura, nit) {
    try {
        // Guardar la operación en IndexedDB
        const id = await window.offlineManager.savePendingOperation('entrega', {
            documento: documentoData,
            lote: lote || '',
            referencia: referencia || '',
            cantidad: parseFloat(cantidad) || 0,
            factura: factura,
            nit: nit || ''
        });
        
        showToast('Entrega guardada en modo offline', 'success');
        return id;
    } catch (error) {
        console.error('Error al guardar entrega offline:', error);
        showToast('Error al guardar entrega', 'error');
        throw error;
    }
}

// Guardar una foto pendiente
async function saveOfflinePhoto(blob, factura, metadata) {
    try {
        // Convertir blob a base64 para almacenamiento
        const base64Data = await blobToBase64(blob);
        // Generar miniatura para la vista previa
        const thumbBase64 = await window.offlineManager.generateThumbnail(base64Data);
        
        // Nombre de archivo para la foto
        const nombreArchivo = `${factura.replace(/[^a-zA-Z0-9\-]/g, '')}_${Date.now()}.jpg`;
        
        // Guardar en IndexedDB
        const id = await window.offlineManager.savePendingPhoto(
            factura,
            nombreArchivo,
            thumbBase64,
            metadata
        );
        
        // También guardamos los datos completos de la imagen en localStorage
        // Nota: esto tiene limitaciones de tamaño, pero es más accesible para el Service Worker
        try {
            localStorage.setItem(`photo_${id}`, base64Data);
        } catch (e) {
            console.warn('No se pudo guardar imagen completa en localStorage, solo se guardó miniatura');
        }
        
        showToast('Foto guardada en modo offline', 'success');
        return id;
    } catch (error) {
        console.error('Error al guardar foto offline:', error);
        showToast('Error al guardar foto', 'error');
        throw error;
    }
}

// Convertir un Blob a base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Extraer solo la parte base64 (sin el data:image/jpeg;base64,)
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Función para verificar el estado de la conexión
function isOnline() {
    return navigator.onLine;
}

// Modificación de la función original de procesarEntrega para usar el sistema offline
function procesarEntregaOffline(documento, lote, referencia, cantidad, factura, nit, btnElement) {
    // Crear objeto con los datos completos
    const datos = {
        documento: documento,
        lote: lote || '',
        referencia: referencia || '',
        cantidad: parseFloat(cantidad) || 0,
        factura: factura,
        nit: nit || ''
    };
    
    // Si estamos online, procedemos normalmente
    if (isOnline()) {
        // Luego abrimos la cámara automáticamente como en el código original
        setTimeout(() => {
            abrirCamara(factura);
        }, 500);
    } else {
        // Si estamos offline, guardamos los datos localmente
        saveOfflineDelivery(documento, lote, referencia, cantidad, factura, nit)
            .then(() => {
                // Actualizar el botón para mostrar que se guardó offline
                if (btnElement) {
                    btnElement.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Guardado offline';
                    btnElement.style.backgroundColor = '#F8961E'; // Color warning
                }
                
                // Actualizar contadores
                updateCounters();
            })
            .catch(error => {
                console.error('Error al guardar entrega offline:', error);
            });
    }
}

// Inicializar cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar la base de datos IndexedDB
    window.offlineManager.initDatabase()
        .then(() => {
            console.log('Base de datos offline inicializada correctamente');
            
            // Inicializar la UI del panel offline
            initOfflineUI();
            
            // Actualizar contadores
            updateCounters();
        })
        .catch(error => {
            console.error('Error al inicializar la base de datos offline:', error);
        });
    
    // Escuchar cambios en la conexión
    window.addEventListener('online', function() {
        showToast('Conexión restablecida', 'success');
        
        // Intentar sincronizar automáticamente si hay datos pendientes
        setTimeout(() => {
            syncAllPendingData();
        }, 2000);
    });
    
    window.addEventListener('offline', function() {
        showToast('Sin conexión - Modo offline', 'warning');
    });
});

// Exportar funciones para uso desde el código principal
window.offlineIntegration = {
    saveOfflineDelivery,
    saveOfflinePhoto,
    procesarEntregaOffline,
    showToast,
    syncAllPendingData,
    isOnline
};
