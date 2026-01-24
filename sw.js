// Service Worker for Ken's Knowledge Base
// 提供离线访问和缓存管理

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `blog-cache-${CACHE_VERSION}`;

// 需要缓存的核心资源
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/nav_data.json'
];

// 需要缓存的页面路由
const CACHED_PAGES = [];

// 不需要缓存的资源
const EXCLUDED_PATHS = [
    '/sw.js',
    '/manifest.json'
];

// ====== 安装事件 ======
self.addEventListener('install', (event) => {
    console.log('[SW] 开始安装 Service Worker');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 缓存核心资源');
                return cache.addAll(CORE_ASSETS);
            })
            .then(() => {
                console.log('[SW] Service Worker 安装完成');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] 安装失败:', error);
            })
    );
});

// ====== 激活事件 ======
self.addEventListener('activate', (event) => {
    console.log('[SW] 激活 Service Worker');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                // 删除旧版本的缓存
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] 删除旧缓存:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker 已激活');
                return self.clients.claim();
            })
    );
});

// ====== 请求拦截 ======
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // 只处理同源请求
    if (url.origin !== location.origin) {
        return;
    }
    
    // 排除特定路径
    if (EXCLUDED_PATHS.some(path => url.pathname.includes(path))) {
        return;
    }
    
    // 对于导航请求（页面访问），使用 Network First 策略
    if (request.mode === 'navigate') {
        event.respondWith(
            networkFirst(request)
        );
        return;
    }
    
    // 对于其他资源，使用 Cache First 策略
    event.respondWith(
        cacheFirst(request)
    );
});

// ====== 缓存策略 ======

/**
 * Cache First 策略
 * 优先从缓存读取，如果缓存中没有，则从网络获取并缓存
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log('[SW] 从缓存返回:', request.url);
        // 后台更新缓存
        updateCache(request);
        return cached;
    }
    
    try {
        const response = await fetch(request);
        
        // 只缓存成功的响应
        if (response && response.status === 200) {
            cache.put(request, response.clone());
            console.log('[SW] 已缓存:', request.url);
        }
        
        return response;
    } catch (error) {
        console.error('[SW] 网络请求失败:', request.url, error);
        
        // 如果是页面请求，返回离线页面
        if (request.destination === 'document') {
            return cache.match('/index.html');
        }
        
        throw error;
    }
}

/**
 * Network First 策略
 * 优先从网络获取，如果网络失败，则从缓存读取
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        const response = await fetch(request);
        
        // 缓存成功的响应
        if (response && response.status === 200) {
            cache.put(request, response.clone());
            console.log('[SW] 已更新缓存:', request.url);
        }
        
        return response;
    } catch (error) {
        console.log('[SW] 网络失败，使用缓存:', request.url);
        
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        
        // 返回离线页面
        return cache.match('/index.html');
    }
}

/**
 * 后台更新缓存
 */
async function updateCache(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await fetch(request);
        
        if (response && response.status === 200) {
            await cache.put(request, response.clone());
            console.log('[SW] 后台更新缓存:', request.url);
        }
    } catch (error) {
        // 忽略后台更新错误
        console.log('[SW] 后台更新失败:', request.url);
    }
}

// ====== 消息处理 ======
self.addEventListener('message', (event) => {
    const { type, payload } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME)
                .then(() => {
                    console.log('[SW] 缓存已清除');
                    event.ports[0].postMessage({ success: true });
                })
                .catch((error) => {
                    console.error('[SW] 清除缓存失败:', error);
                    event.ports[0].postMessage({ success: false, error: error.message });
                });
            break;
            
        case 'GET_CACHE_SIZE':
            getCacheSize()
                .then((size) => {
                    event.ports[0].postMessage({ size });
                });
            break;
            
        default:
            console.log('[SW] 未知消息类型:', type);
    }
});

/**
 * 获取缓存大小
 */
async function getCacheSize() {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    let totalSize = 0;
    
    for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
        }
    }
    
    return {
        count: keys.length,
        bytes: totalSize,
        megabytes: (totalSize / (1024 * 1024)).toFixed(2)
    };
}

// ====== 同步事件（后台同步） ======
self.addEventListener('sync', (event) => {
    console.log('[SW] 后台同步:', event.tag);
    
    if (event.tag === 'sync-data') {
        event.waitUntil(
            fetch('/nav_data.json')
                .then(response => response.json())
                .then(data => {
                    console.log('[SW] 数据同步完成');
                })
                .catch(error => {
                    console.error('[SW] 数据同步失败:', error);
                })
        );
    }
});

console.log('[SW] Service Worker 脚本已加载');
