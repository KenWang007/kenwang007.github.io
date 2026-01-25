// 博客网站UI/UX优化脚本

// ====== 配置 ======
const CONFIG = {
    NAV_DATA_URL: '/nav_data.json',
    LOADING_DELAY: 300, // 加载延迟阈值（毫秒）
    DEBOUNCE_DELAY: 250, // 防抖延迟
    MAX_KEYWORDS: 50, // 最大关键词数量
    MAX_POPULAR_POSTS: 10, // 热门文章最大数量
    ERROR_RETRY_COUNT: 3, // 错误重试次数
    ERROR_RETRY_DELAY: 1000, // 错误重试延迟
    CACHE_KEY: 'blog_nav_data_cache', // LocalStorage缓存键
    CACHE_VERSION_KEY: 'blog_nav_data_version', // 缓存版本键
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 缓存过期时间（24小时）
    ENABLE_CACHE: true, // 是否启用缓存
    VIEW_COUNT_CACHE_KEY: 'blog_view_counts', // 访问量缓存键
    VIEW_COUNT_CACHE_EXPIRY: 5 * 60 * 1000, // 访问量缓存过期时间（5分钟）
    SIDEBAR_STATE_KEY: 'blog_sidebar_state', // 侧边栏状态缓存键
    COUNT_API_NAMESPACE: 'kenwang007-blog' // CountAPI 命名空间
};

// ====== 渲染模式（稳定/特效） ======
const RenderMode = {
    STORAGE_KEY: 'blog_render_mode', // 'stable' | 'fx'

    getDefaultMode() {
        // Default to stable on macOS + Chromium-family browsers due to known compositor black-tile issues.
        try {
            const ua = navigator.userAgent || '';
            const isMac = /Macintosh|Mac OS X/.test(ua);
            const isChromiumFamily = /Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Brave\//.test(ua);
            return (isMac && isChromiumFamily) ? 'stable' : 'fx';
        } catch (_) {
            return 'fx';
        }
    },

    getSavedMode() {
        try {
            const v = localStorage.getItem(this.STORAGE_KEY);
            return v === 'stable' || v === 'fx' ? v : null;
        } catch (_) {
            return null;
        }
    },

    setSavedMode(mode) {
        try {
            localStorage.setItem(this.STORAGE_KEY, mode);
        } catch (_) {}
    },

    apply(mode) {
        const root = document.documentElement;
        root.classList.toggle('mode-stable', mode === 'stable');
        root.classList.toggle('mode-fx', mode === 'fx');
    }
};

// ====== 状态管理 ======
const AppState = {
    allKeywords: [],
    blogPosts: [],
    navMenuData: [],
    directoryStructure: [],
    viewCounts: {}, // 文章访问量
    isLoading: false,
    hasError: false,
    errorMessage: '',
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false
};

// ====== 工具函数 ======
const Utils = {
    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // 节流函数
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // 显示加载状态
    showLoading(element, message = '加载中...') {
        if (element) {
            element.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    },
    
    // 显示错误信息
    showError(element, message = '加载失败，请稍后重试') {
        if (element) {
            element.innerHTML = `
                <div class="error-message">
                    <p>❌ ${message}</p>
                </div>
            `;
        }
        console.error('Error:', message);
    },
    
    // 安全地获取URL参数
    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    },
    
    // 延迟执行
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // 检查LocalStorage是否可用
    isLocalStorageAvailable() {
        try {
            const test = '__localStorage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },
    
    // 格式化日期
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },
    
    // 性能监控
    measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`);
        return result;
    }
};

// ====== URL helpers (ASCII-only routing) ======
function toSiteHref(p) {
    if (!p) return '#';
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    return p.startsWith('/') ? p : `/${p}`;
}

function getPostHref(post) {
    return toSiteHref(post?.url || post?.path);
}

function getDirHref(dirNode) {
    return toSiteHref(dirNode?.url || (dirNode?.path ? `${dirNode.path}/index.html` : null));
}

function isAsciiPostPath(pathname) {
    // /dist/p/<slug>.html OR /dist/p/<hex>.html
    return /^\/dist\/p\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/i.test(pathname);
}

function isAsciiDirPath(pathname) {
    // /dist/c/<slug>/index.html OR /dist/c/<hex>/index.html
    return /^\/dist\/c\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/i.test(pathname);
}

function getAsciiPostKeyFromPath(pathname) {
    const m = pathname.match(/^\/dist\/p\/([^/]+)\.html$/i);
    return m ? m[1] : null; // slug or id
}

function getAsciiDirKeyFromPath(pathname) {
    const m = pathname.match(/^\/dist\/c\/([^/]+)\/index\.html$/i);
    return m ? m[1] : null; // slug or id
}

function findPostByUrlPath(pathname) {
    const norm = pathname.replace(/^\//, '');
    return AppState.blogPosts.find(p => (p.url || p.path) === norm) || null;
}

function findDirByUrlPath(pathname) {
    const norm = pathname.replace(/^\//, '');
    // directory nodes are nested in directoryStructure; match by url
    const targetUrl = norm;
    const walk = (dirs) => {
        if (!dirs || !Array.isArray(dirs)) return null;
        for (const d of dirs) {
            if (d.url === targetUrl) return d;
            const f = walk(d.subdirs);
            if (f) return f;
        }
        return null;
    };
    return walk(AppState.directoryStructure);
}

// ====== Service Worker 注册 ======
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('⚠️ 浏览器不支持Service Worker');
        return null;
    }
    
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        });
        
        console.log('✅ Service Worker 注册成功:', registration.scope);

        // Proactively check for updates (helps Chrome pick up new sw.js quickly).
        try {
            await registration.update();
        } catch (_) {
            // ignore
        }

        // If there's already a waiting worker, activate it immediately.
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Reload once the new SW takes control, so latest CSS/JS are used.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
        
        // 监听更新
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // 有新版本可用
                    console.log('🔄 发现新版本');
                    // Try to activate immediately; if blocked by open tabs, user can still refresh.
                    try {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    } catch (_) {}
                    showToast('📦 已更新资源，页面即将刷新', 3000);
                }
            });
        });
        
        return registration;
    } catch (error) {
        console.error('❌ Service Worker 注册失败:', error);
        return null;
    }
}

// ====== 页面加载完成后执行 ======
document.addEventListener('DOMContentLoaded', async function() {
    try {
        AppState.isLoading = true;
        
        // Browser hints (used for CSS fallbacks)
        // Note: Chromium "fast scroll blank/black flashes" can happen across Chrome/Edge/Brave/Opera.
        // We treat all Chromium-family UAs as candidates for safer rendering defaults.
        try {
            const ua = navigator.userAgent || '';
            const isChromiumFamily = /Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Brave\//.test(ua);
            if (isChromiumFamily) document.documentElement.classList.add('ua-chromium');
        } catch (_) {}

        // Page hints (used for CSS stability fallbacks)
        try {
            const path = window.location.pathname || '';
            const isHome = path === '/' || path === '/index.html';
            const isSearch = path.includes('search.html');
            if (isHome) document.documentElement.classList.add('page-home');
            if (!isHome && !isSearch) document.documentElement.classList.add('page-article');
        } catch (_) {}

        // Apply render mode (stable/fx) ASAP before heavy paint
        try {
            const saved = RenderMode.getSavedMode();
            const mode = saved || RenderMode.getDefaultMode();
            RenderMode.apply(mode);
        } catch (_) {}

        // 注册 Service Worker
        registerServiceWorker().catch(err => {
            console.warn('Service Worker 注册失败:', err);
        });
        
        // 初始化核心功能
        await initializeApp();
        
        // 初始化UI交互
        initializeUIInteractions();
        
        AppState.isLoading = false;
        document.body.classList.add('loaded');
    } catch (error) {
        AppState.hasError = true;
        AppState.errorMessage = error.message;
        console.error('应用初始化失败:', error);
        Utils.showError(document.querySelector('.content-wrapper'), '页面加载失败，请刷新重试');
    }
});

// ====== 应用初始化 ======
async function initializeApp() {
    // 强制清除旧缓存（确保使用最新数据）
    CacheManager.clearCache();
    
    // 加载导航数据
    await loadNavData();
    
    // 初始化导航菜单
    initNavigation();
    
    // 初始化关键词索引
    initKeywords();
    
    // 初始化搜索功能
    initSearch();
    
    // 初始化目录列表
    initDirectoryList();
    
    // 初始化文章卡片（目录页面）
    initArticleCards();
    
    // 初始化面包屑导航
    initBreadcrumb();
    
    // 初始化访问量统计
    await initPageViewTracking();
    
    // 初始化热门文章列表
    await initPopularPosts();
}

// ====== UI交互初始化 ======
function initializeUIInteractions() {
    // 初始化移动端菜单切换
    initMobileMenuToggle();
    
    // 初始化侧边栏折叠功能
    initSidebarToggle();
    
    // 初始化平滑滚动
    initSmoothScroll();
    
    // 初始化 Three.js 星空效果（仅首页）
    initThreeJsStarfield();
    
    // 初始化滚动监听
    initScrollEffects();
    
    // 初始化响应式调整
    initResponsiveHandlers();
    
    // 恢复侧边栏状态
    restoreSidebarState();

    // 初始化渲染模式切换（稳定/特效）
    initRenderModeToggle();
}

// ====== 渲染模式切换按钮 ======
function initRenderModeToggle() {
    const navContainer = document.querySelector('.nav-container');
    if (!navContainer) return;

    // Avoid duplicates
    if (document.getElementById('render-mode-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'render-mode-toggle';
    btn.className = 'render-mode-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', '切换渲染模式（稳定/特效）');
    btn.setAttribute('title', '切换渲染模式（稳定/特效）');

    const updateText = () => {
        const isStable = document.documentElement.classList.contains('mode-stable');
        btn.textContent = isStable ? '稳定模式' : '特效模式';
        btn.setAttribute('aria-pressed', isStable ? 'true' : 'false');
    };

    btn.addEventListener('click', () => {
        const isStable = document.documentElement.classList.contains('mode-stable');
        const next = isStable ? 'fx' : 'stable';
        RenderMode.apply(next);
        RenderMode.setSavedMode(next);
        updateText();
        try {
            showToast(next === 'stable' ? '🛡️ 已切换：稳定模式' : '✨ 已切换：特效模式', 2000);
        } catch (_) {}
    });

    updateText();
    navContainer.appendChild(btn);
}

// ====== 缓存管理 ======
const CacheManager = {
    // 保存数据到缓存
    saveToCache(data) {
        if (!CONFIG.ENABLE_CACHE || !Utils.isLocalStorageAvailable()) {
            return false;
        }
        
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                version: data.generated_at || Date.now()
            };
            
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
            localStorage.setItem(CONFIG.CACHE_VERSION_KEY, cacheData.version.toString());
            console.log('💾 数据已缓存到LocalStorage');
            return true;
        } catch (error) {
            console.warn('⚠️ 缓存保存失败:', error);
            return false;
        }
    },
    
    // 从缓存加载数据
    loadFromCache() {
        if (!CONFIG.ENABLE_CACHE || !Utils.isLocalStorageAvailable()) {
            return null;
        }
        
        try {
            const cachedStr = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cachedStr) {
                return null;
            }
            
            const cached = JSON.parse(cachedStr);
            const now = Date.now();
            
            // 检查缓存是否过期
            if (now - cached.timestamp > CONFIG.CACHE_EXPIRY) {
                console.log('🕐 缓存已过期，将重新加载');
                this.clearCache();
                return null;
            }
            
            console.log('✅ 从缓存加载数据');
            return cached.data;
        } catch (error) {
            console.warn('⚠️ 缓存加载失败:', error);
            this.clearCache();
            return null;
        }
    },
    
    // 清除缓存
    clearCache() {
        if (!Utils.isLocalStorageAvailable()) {
            return;
        }
        
        try {
            localStorage.removeItem(CONFIG.CACHE_KEY);
            localStorage.removeItem(CONFIG.CACHE_VERSION_KEY);
            console.log('🗑️ 缓存已清除');
        } catch (error) {
            console.warn('⚠️ 缓存清除失败:', error);
        }
    },
    
    // 检查是否有新版本
    async checkForUpdates() {
        if (!Utils.isLocalStorageAvailable()) {
            return false;
        }
        
        try {
            const cachedVersion = localStorage.getItem(CONFIG.CACHE_VERSION_KEY);
            if (!cachedVersion) {
                return false;
            }
            
            // 使用HEAD请求检查文件是否更新
            const response = await fetch(CONFIG.NAV_DATA_URL, {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            const lastModified = response.headers.get('Last-Modified');
            if (lastModified) {
                const serverTime = new Date(lastModified).getTime();
                const cachedTime = parseFloat(cachedVersion);
                
                if (serverTime > cachedTime) {
                    console.log('🔄 检测到新版本，将更新缓存');
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.warn('⚠️ 版本检查失败:', error);
            return false;
        }
    }
};

// ====== 数据加载 ======
async function loadNavData(retryCount = 0) {
    try {
        // 尝试从缓存加载
        const cachedData = CacheManager.loadFromCache();
        if (cachedData) {
            // 更新应用状态
            AppState.navMenuData = cachedData.nav_menu || [];
            AppState.blogPosts = cachedData.blog_posts || [];
            AppState.directoryStructure = cachedData.directory_structure || [];
            
            // 后台检查更新
            CacheManager.checkForUpdates().then(hasUpdate => {
                if (hasUpdate) {
                    loadNavDataFromNetwork(0, true);
                }
            });
            
            return cachedData;
        }
        
        // 从网络加载
        return await loadNavDataFromNetwork(retryCount);
    } catch (error) {
        console.error('❌ 数据加载失败:', error);
        useDefaultNavData();
        throw error;
    }
}

async function loadNavDataFromNetwork(retryCount = 0, isBackgroundUpdate = false) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        const response = await fetch(CONFIG.NAV_DATA_URL, {
            signal: controller.signal,
            cache: 'no-cache'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 验证数据结构
        if (!data || typeof data !== 'object') {
            throw new Error('无效的数据格式');
        }
        
        // 保存到缓存
        CacheManager.saveToCache(data);
        
        // 更新应用状态
        AppState.navMenuData = data.nav_menu || [];
        AppState.blogPosts = data.blog_posts || [];
        AppState.directoryStructure = data.directory_structure || [];
        
        if (!isBackgroundUpdate) {
            console.log('✅ 导航数据加载成功:', {
                navMenuCount: AppState.navMenuData.length,
                blogPostsCount: AppState.blogPosts.length,
                directoryStructureCount: AppState.directoryStructure.length
            });
        } else {
            console.log('🔄 后台更新完成');
            // 如果是后台更新，可以提示用户刷新
            showToast('📝 内容已更新');
        }
        
        return data;
    } catch (error) {
        console.warn(`⚠️ 加载nav_data.json失败 (尝试 ${retryCount + 1}/${CONFIG.ERROR_RETRY_COUNT}):`, error.message);
        
        // 重试逻辑
        if (retryCount < CONFIG.ERROR_RETRY_COUNT - 1) {
            await Utils.delay(CONFIG.ERROR_RETRY_DELAY * (retryCount + 1));
            return loadNavDataFromNetwork(retryCount + 1, isBackgroundUpdate);
        }
        
        // 所有重试都失败后，使用默认数据
        if (!isBackgroundUpdate) {
            console.log('🔄 使用默认导航数据作为后备');
            useDefaultNavData();
        }
        throw error;
    }
}

// 使用默认导航数据作为回退
function useDefaultNavData() {
    AppState.navMenuData = [
        { name: 'AI相关', path: 'notes/AI相关' },
        { name: '软件设计', path: 'notes/软件设计' },
        { name: '阅读感悟', path: 'notes/阅读感悟' }
    ];
    
    AppState.blogPosts = [
        {
            title: "📚 RAG技术全面介绍",
            path: "notes/AI相关/RAG/introduction.html",
            keywords: ["RAG", "检索增强生成"]
        },
        {
            title: "如何高效使用 AI Agent",
            path: "notes/AI相关/Agent/如何高效使用agent.html",
            keywords: ["AI", "Agent"]
        },
        {
            title: "💻 Python学习",
            path: "notes/软件设计/Python-learning.html",
            keywords: ["Python", "编程"]
        }
    ];
    
    AppState.directoryStructure = [];
}

// ====== 导航菜单 ======
function initNavigation() {
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) {
        console.warn('⚠️ 导航菜单容器未找到');
        return;
    }
    
    // 调试日志
    console.log('🧭 初始化导航菜单，数据:', AppState.navMenuData);
    
    // 清空现有菜单
    navMenu.innerHTML = '';
    
    // 添加首页菜单项
    const homeItem = createMenuItem('首页', '/index.html');
    navMenu.appendChild(homeItem);
    
    // 添加notes目录下的一级文件夹作为菜单项（优先使用 ASCII-only 目录 URL）
    AppState.navMenuData.forEach((folder, index) => {
        const href = getDirHref(folder);
        console.log(`📁 菜单项 ${index}: ${folder.name} -> ${href}`);
        const menuItem = createMenuItem(folder.name, href);
        navMenu.appendChild(menuItem);
    });
}

// 创建菜单项
function createMenuItem(name, href) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = href;
    a.textContent = name;
    a.setAttribute('aria-label', `导航到${name}`);
    
    // 首页特殊处理，确保正确导航
    if (name === '首页') {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const currentPath = window.location.pathname;
            const isOnHomePage = currentPath === '/' || currentPath === '/index.html';
            
            if (isOnHomePage) {
                // 已在首页：滚动到顶部
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                // 不在首页：强制导航到首页
                window.location.href = '/index.html';
            }
        });
    }
    
    li.appendChild(a);
    return li;
}

// ====== 关键词索引 ======
function initKeywords() {
    try {
        // 提取所有关键词
        extractKeywords();
        
        // 生成关键词索引
        generateKeywordIndex();
    } catch (error) {
        console.error('❌ 关键词索引初始化失败:', error);
    }
}

// 提取所有关键词
function extractKeywords() {
    const keywordsSet = new Set();
    
    // 遍历所有博客文章，收集关键词
    AppState.blogPosts.forEach(post => {
        if (post.keywords && Array.isArray(post.keywords)) {
            post.keywords.forEach(keyword => {
                if (keyword && keyword.trim()) {
                    keywordsSet.add(keyword.trim());
                }
            });
        }
    });
    
    // 转换为数组并排序
    AppState.allKeywords = Array.from(keywordsSet)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .slice(0, CONFIG.MAX_KEYWORDS); // 限制关键词数量
    
    console.log(`📋 提取了 ${AppState.allKeywords.length} 个关键词`);
}

// 生成关键词索引
function generateKeywordIndex() {
    const keywordList = document.getElementById('keyword-list');
    if (!keywordList) {
        console.warn('⚠️ 关键词列表容器未找到');
        return;
    }
    
    // 清空现有关键词
    keywordList.innerHTML = '';
    
    if (AppState.allKeywords.length === 0) {
        keywordList.innerHTML = '<p class="no-keywords">暂无关键词</p>';
        return;
    }
    
    // 使用文档片段优化DOM操作性能
    const fragment = document.createDocumentFragment();
    
    AppState.allKeywords.forEach(keyword => {
        const keywordItem = document.createElement('div');
        keywordItem.className = 'keyword-item';
        
        const link = document.createElement('a');
        link.href = `/search.html?keyword=${encodeURIComponent(keyword)}`;
        link.className = 'keyword-link';
        link.textContent = keyword;
        link.setAttribute('aria-label', `搜索关键词: ${keyword}`);
        
        keywordItem.appendChild(link);
        fragment.appendChild(keywordItem);
    });
    
    keywordList.appendChild(fragment);
}

// ====== 搜索功能 ======
function initSearch() {
    // 检查当前页面是否是搜索结果页
    if (window.location.pathname.includes('search.html')) {
        handleSearch();
    }
}

// 处理搜索请求
function handleSearch() {
    const searchKeyword = Utils.getUrlParameter('keyword');
    
    console.log('🔍 搜索关键词:', searchKeyword);
    console.log('📚 当前文章数量:', AppState.blogPosts.length);
    
    if (!searchKeyword) {
        console.warn('⚠️ 未提供搜索关键词');
        displayNoSearchTerm();
        return;
    }
    
    // 确保数据已加载
    if (AppState.blogPosts.length === 0) {
        console.warn('⚠️ 文章数据尚未加载，尝试重新加载');
        // 显示加载中提示
        const resultsContainer = document.getElementById('search-results');
        const searchStats = document.getElementById('search-stats');
        if (searchStats) searchStats.textContent = '正在加载数据...';
        if (resultsContainer) resultsContainer.innerHTML = '<div class="loading">数据加载中...</div>';
        
        // 等待数据加载后重试
        setTimeout(() => {
            if (AppState.blogPosts.length > 0) {
                displaySearchResults(searchKeyword);
                document.title = `搜索: ${searchKeyword} - Ken的知识库`;
            } else {
                if (searchStats) searchStats.textContent = '数据加载失败';
                if (resultsContainer) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <p>😔 数据加载失败，请刷新页面重试</p>
                        </div>
                    `;
                }
            }
        }, 500);
        return;
    }
    
    try {
        // 显示搜索结果
        displaySearchResults(searchKeyword);
        
        // 更新页面标题
        document.title = `搜索: ${searchKeyword} - Ken的知识库`;
    } catch (error) {
        console.error('❌ 搜索处理失败:', error);
        Utils.showError(
            document.getElementById('search-results'),
            '搜索功能出现错误，请稍后重试'
        );
    }
}

// 显示未提供搜索词的提示
function displayNoSearchTerm() {
    const resultsContainer = document.getElementById('search-results');
    const searchStats = document.getElementById('search-stats');
    
    if (searchStats) {
        searchStats.textContent = '请提供搜索关键词';
    }
    
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <p>💡 请从关键词索引中选择一个关键词，或在URL中提供keyword参数</p>
            </div>
        `;
    }
}

// 显示搜索结果
function displaySearchResults(keyword) {
    const resultsContainer = document.getElementById('search-results');
    const searchStats = document.getElementById('search-stats');
    
    if (!resultsContainer) {
        console.error('❌ 搜索结果容器未找到');
        return;
    }
    
    // 清空现有结果
    resultsContainer.innerHTML = '';
    
    // 过滤包含关键词的博客文章
    const matchingPosts = searchPosts(keyword);
    
    // 更新搜索统计
    if (searchStats) {
        const count = matchingPosts.length;
        searchStats.textContent = count > 0 
            ? `找到 ${count} 篇包含 "${keyword}" 的文章`
            : `未找到包含 "${keyword}" 的文章`;
    }
    
    // 生成搜索结果列表
    if (matchingPosts.length > 0) {
        renderSearchResults(resultsContainer, matchingPosts, keyword);
    } else {
        renderNoResults(resultsContainer, keyword);
    }
}

// 搜索文章
function searchPosts(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    
    return AppState.blogPosts.filter(post => {
        // 检查标题
        if (post.title.toLowerCase().includes(lowerKeyword)) {
            return true;
        }
        
        // 检查关键词
        if (post.keywords && Array.isArray(post.keywords)) {
            return post.keywords.some(k => 
                k.toLowerCase().includes(lowerKeyword)
            );
        }
        
        return false;
    });
}

// 渲染搜索结果
function renderSearchResults(container, posts, keyword) {
    const fragment = document.createDocumentFragment();
    
    posts.forEach(post => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        
        const title = document.createElement('h3');
        title.className = 'result-title';
        
        const link = document.createElement('a');
        link.href = getPostHref(post);
        link.textContent = post.title;
        link.setAttribute('aria-label', `查看文章: ${post.title}`);
        
        title.appendChild(link);
        
        const meta = document.createElement('div');
        meta.className = 'result-meta';
        
        if (post.keywords && post.keywords.length > 0) {
            const keywordsSpan = document.createElement('span');
            keywordsSpan.textContent = `关键词: ${post.keywords.join(', ')}`;
            meta.appendChild(keywordsSpan);
        }
        
        resultItem.appendChild(title);
        resultItem.appendChild(meta);
        fragment.appendChild(resultItem);
    });
    
    container.appendChild(fragment);
}

// 渲染无结果提示
function renderNoResults(container, keyword) {
    container.innerHTML = `
        <div class="no-results">
            <p>😔 未找到包含 "${keyword}" 的文章</p>
            <p>建议：尝试其他关键词或<a href="/index.html">返回首页</a>浏览所有分类</p>
        </div>
    `;
}

// ====== UI交互功能 ======

// 初始化移动端菜单切换
function initMobileMenuToggle() {
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    
    // 创建移动端菜单按钮
    const mobileToggle = document.createElement('button');
    mobileToggle.className = 'mobile-menu-toggle';
    mobileToggle.innerHTML = '☰';
    mobileToggle.setAttribute('aria-label', '切换菜单');
    mobileToggle.setAttribute('aria-expanded', 'false');
    
    // 添加点击事件
    mobileToggle.addEventListener('click', function() {
        const isActive = navMenu.classList.toggle('active');
        mobileToggle.setAttribute('aria-expanded', isActive.toString());
        mobileToggle.innerHTML = isActive ? '✕' : '☰';
    });
    
    // 将按钮添加到导航容器
    const navContainer = document.querySelector('.nav-container');
    if (navContainer) {
        navContainer.appendChild(mobileToggle);
    }
    
    // 点击菜单项后关闭移动端菜单
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                navMenu.classList.remove('active');
                mobileToggle.setAttribute('aria-expanded', 'false');
                mobileToggle.innerHTML = '☰';
            }
        });
    });
}

// 初始化平滑滚动
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const navHeight = parseInt(getComputedStyle(document.documentElement)
                    .getPropertyValue('--nav-height')) || 60;
                
                window.scrollTo({
                    top: targetElement.offsetTop - navHeight - 10,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// 初始化滚动效果
function initScrollEffects() {
    const nav = document.querySelector('.top-nav');
    if (!nav) return;
    
    let scrollingTimer = null;
    const handleScroll = Utils.throttle(() => {
        // 标记滚动中：用于 CSS 临时降级昂贵特效，避免快速滚动时黑屏闪烁
        document.documentElement.classList.add('is-scrolling');
        if (scrollingTimer) clearTimeout(scrollingTimer);
        scrollingTimer = setTimeout(() => {
            document.documentElement.classList.remove('is-scrolling');
        }, 150);

        // 使用 class 切换替代频繁写入 inline style，减少重绘压力
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, 50);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
}

// 初始化响应式处理
function initResponsiveHandlers() {
    const handleResize = Utils.debounce(() => {
        const navMenu = document.getElementById('nav-menu');
        
        // 当窗口变大时，关闭移动端菜单
        if (window.innerWidth > 768 && navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            const mobileToggle = document.querySelector('.mobile-menu-toggle');
            if (mobileToggle) {
                mobileToggle.setAttribute('aria-expanded', 'false');
                mobileToggle.innerHTML = '☰';
            }
        }
    }, CONFIG.DEBOUNCE_DELAY);
    
    window.addEventListener('resize', handleResize);
}

// ====== 辅助功能 ======

// 关键词高亮功能
function highlightKeywords(text, keyword) {
    if (!keyword || !text) return text;
    
    // 转义特殊正则字符
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// 博客文章分享功能
async function sharePost(title, url) {
    const shareData = {
        title: title,
        url: url || window.location.href,
        text: `查看这篇文章: ${title}`
    };
    
    try {
        // 检查浏览器是否支持原生分享API
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            console.log('✅ 分享成功');
        } else {
            // 降级方案：复制到剪贴板
            await fallbackShare(`${title} - ${shareData.url}`);
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('❌ 分享失败:', error);
            await fallbackShare(`${title} - ${shareData.url}`);
        }
    }
}

// 分享降级方案
async function fallbackShare(text) {
    try {
        if (!navigator.clipboard) {
            throw new Error('剪贴板API不可用');
        }
        
        await navigator.clipboard.writeText(text);
        showToast('✅ 链接已复制到剪贴板');
    } catch (error) {
        console.error('❌ 复制失败:', error);
        showToast('❌ 复制失败，请手动复制链接');
    }
}

// 显示Toast提示
function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--color-bg-card);
        color: var(--color-text-primary);
        padding: var(--spacing-md);
        border-radius: var(--border-radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ====== 侧边栏折叠功能 ======

// 初始化侧边栏折叠
function initSidebarToggle() {
    // 初始化左侧侧边栏折叠按钮
    initLeftSidebarToggle();
    
    // 初始化右侧侧边栏折叠按钮
    initRightSidebarToggle();
}

// 初始化左侧侧边栏折叠
function initLeftSidebarToggle() {
    const leftSidebar = document.querySelector('.keyword-sidebar');
    if (!leftSidebar) {
        console.warn('⚠️ 左侧侧边栏未找到');
        return;
    }
    
    // 检查是否已存在折叠按钮
    if (document.querySelector('.sidebar-toggle-left')) {
        return;
    }
    
    // 创建折叠按钮 - 添加到 body 以便 fixed 定位
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle sidebar-toggle-left';
    toggleBtn.innerHTML = AppState.leftSidebarCollapsed ? '›' : '‹';
    toggleBtn.setAttribute('aria-label', '折叠/展开关键词索引');
    toggleBtn.setAttribute('title', '点击折叠/展开');
    
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLeftSidebar();
        // 更新按钮箭头方向
        toggleBtn.innerHTML = AppState.leftSidebarCollapsed ? '›' : '‹';
    });
    
    document.body.appendChild(toggleBtn);
    console.log('✅ 左侧折叠按钮已创建');
}

// 初始化右侧侧边栏折叠
function initRightSidebarToggle() {
    const rightSidebar = document.querySelector('.popular-sidebar');
    if (!rightSidebar) {
        console.warn('⚠️ 右侧侧边栏未找到');
        return;
    }
    
    // 检查是否已存在折叠按钮
    if (document.querySelector('.sidebar-toggle-right')) {
        return;
    }
    
    // 创建折叠按钮 - 添加到 body 以便 fixed 定位
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle sidebar-toggle-right';
    toggleBtn.innerHTML = AppState.rightSidebarCollapsed ? '‹' : '›';
    toggleBtn.setAttribute('aria-label', '折叠/展开热门文章');
    toggleBtn.setAttribute('title', '点击折叠/展开');
    
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRightSidebar();
        // 更新按钮箭头方向
        toggleBtn.innerHTML = AppState.rightSidebarCollapsed ? '‹' : '›';
    });
    
    document.body.appendChild(toggleBtn);
    console.log('✅ 右侧折叠按钮已创建');
}

// 切换左侧侧边栏
function toggleLeftSidebar() {
    const leftSidebar = document.querySelector('.keyword-sidebar');
    if (!leftSidebar) return;
    
    AppState.leftSidebarCollapsed = !AppState.leftSidebarCollapsed;
    leftSidebar.classList.toggle('collapsed', AppState.leftSidebarCollapsed);
    document.body.classList.toggle('left-collapsed', AppState.leftSidebarCollapsed);
    
    // 保存状态
    saveSidebarState();
    
    // 触发 resize 事件，让星空等组件自适应
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 350); // 等待 CSS 过渡完成
}

// 切换右侧侧边栏
function toggleRightSidebar() {
    const rightSidebar = document.querySelector('.popular-sidebar');
    if (!rightSidebar) return;
    
    AppState.rightSidebarCollapsed = !AppState.rightSidebarCollapsed;
    rightSidebar.classList.toggle('collapsed', AppState.rightSidebarCollapsed);
    document.body.classList.toggle('right-collapsed', AppState.rightSidebarCollapsed);
    
    // 保存状态
    saveSidebarState();
    
    // 触发 resize 事件，让星空等组件自适应
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 350); // 等待 CSS 过渡完成
}

// 保存侧边栏状态
function saveSidebarState() {
    if (!Utils.isLocalStorageAvailable()) return;
    
    try {
        const state = {
            left: AppState.leftSidebarCollapsed,
            right: AppState.rightSidebarCollapsed
        };
        localStorage.setItem(CONFIG.SIDEBAR_STATE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('⚠️ 保存侧边栏状态失败:', error);
    }
}

// 恢复侧边栏状态
function restoreSidebarState() {
    if (!Utils.isLocalStorageAvailable()) return;
    
    try {
        const stateStr = localStorage.getItem(CONFIG.SIDEBAR_STATE_KEY);
        if (!stateStr) return;
        
        const state = JSON.parse(stateStr);
        
        if (state.left) {
            AppState.leftSidebarCollapsed = true;
            const leftSidebar = document.querySelector('.keyword-sidebar');
            if (leftSidebar) {
                leftSidebar.classList.add('collapsed');
                document.body.classList.add('left-collapsed');
                // 更新按钮箭头
                const leftBtn = leftSidebar.querySelector('.sidebar-toggle-left');
                if (leftBtn) leftBtn.innerHTML = '›';
            }
        }
        
        if (state.right) {
            AppState.rightSidebarCollapsed = true;
            const rightSidebar = document.querySelector('.popular-sidebar');
            if (rightSidebar) {
                rightSidebar.classList.add('collapsed');
                document.body.classList.add('right-collapsed');
                // 更新按钮箭头
                const rightBtn = rightSidebar.querySelector('.sidebar-toggle-right');
                if (rightBtn) rightBtn.innerHTML = '‹';
            }
        }
    } catch (error) {
        console.warn('⚠️ 恢复侧边栏状态失败:', error);
    }
}

// ====== 访问量统计 ======

// 访问量管理器
const ViewCountManager = {
    // 获取缓存的访问量数据
    getCachedViewCounts() {
        if (!Utils.isLocalStorageAvailable()) return null;
        
        try {
            const cachedStr = localStorage.getItem(CONFIG.VIEW_COUNT_CACHE_KEY);
            if (!cachedStr) return null;
            
            const cached = JSON.parse(cachedStr);
            const now = Date.now();
            
            // 检查缓存是否过期
            if (now - cached.timestamp > CONFIG.VIEW_COUNT_CACHE_EXPIRY) {
                return null;
            }
            
            return cached.data;
        } catch (error) {
            return null;
        }
    },
    
    // 保存访问量缓存
    saveViewCounts(data) {
        if (!Utils.isLocalStorageAvailable()) return;
        
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(CONFIG.VIEW_COUNT_CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
            console.warn('⚠️ 保存访问量缓存失败:', error);
        }
    },
    
    // 使用本地存储记录访问量（不再依赖外部 API）
    async trackPageView(articlePath) {
        try {
            const key = this.generateKey(articlePath);
            const storageKey = `view_${key}`;
            
            // 从本地存储获取当前计数
            let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
            count += 1;
            
            // 保存到本地存储
            localStorage.setItem(storageKey, count.toString());
            
            return count;
        } catch (error) {
            // 返回缓存的访问量或默认值
            return AppState.viewCounts[articlePath] || 1;
        }
    },
    
    // 获取文章访问量（不增加计数）
    async getPageViews(articlePath) {
        try {
            const key = this.generateKey(articlePath);
            const storageKey = `view_${key}`;
            
            const count = parseInt(localStorage.getItem(storageKey) || '0', 10);
            return count;
        } catch (error) {
            return AppState.viewCounts[articlePath] || 0;
        }
    },
    
    // 批量获取访问量
    async getMultiplePageViews(articlePaths) {
        const results = {};
        
        // 先检查缓存
        const cached = this.getCachedViewCounts();
        if (cached) {
            AppState.viewCounts = cached;
            return cached;
        }
        
        // 并发请求所有文章的访问量
        const promises = articlePaths.map(async (path) => {
            const count = await this.getPageViews(path);
            results[path] = count;
        });
        
        await Promise.allSettled(promises);
        
        // 保存到缓存
        this.saveViewCounts(results);
        AppState.viewCounts = results;
        
        return results;
    },
    
    // 生成安全的 key
    generateKey(path) {
        if (!path || typeof path !== 'string') {
            return 'unknown';
        }
        // 移除开头的斜杠，替换特殊字符
        return path
            .replace(/^\//, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 64); // CountAPI key 最大长度
    }
};

// 初始化页面访问量统计
async function initPageViewTracking() {
    try {
        const currentPath = window.location.pathname;
        
        // 只对文章页面进行统计（排除首页和搜索页）
        if (currentPath === '/' || currentPath === '/index.html' || currentPath.includes('search.html')) {
            return;
        }
        
        // 记录当前页面访问
        const viewCount = await ViewCountManager.trackPageView(currentPath);
        AppState.viewCounts[currentPath] = viewCount;
        
        console.log(`📊 页面访问量: ${viewCount}`);
    } catch (error) {
        console.warn('⚠️ 访问量统计初始化失败:', error);
    }
}

// ====== 热门文章 ======

// 初始化热门文章列表
async function initPopularPosts() {
    const popularList = document.getElementById('popular-list');
    if (!popularList) {
        console.warn('⚠️ 热门文章列表容器未找到');
        return;
    }
    
    try {
        // 获取所有文章的访问量
        const articlePaths = AppState.blogPosts.map(post => getPostHref(post));
        await ViewCountManager.getMultiplePageViews(articlePaths);
        
        // 渲染热门文章列表
        renderPopularPosts(popularList);
    } catch (error) {
        console.error('❌ 热门文章初始化失败:', error);
        renderPopularPostsFallback(popularList);
    }
}

// 渲染热门文章列表
function renderPopularPosts(container) {
    container.innerHTML = '';
    
    // 按访问量排序
    const sortedPosts = [...AppState.blogPosts]
        .map(post => {
            const key = getPostHref(post); // starts with /
            return {
                ...post,
                views: AppState.viewCounts[key] || Math.floor(Math.random() * 50) + 5
            };
        })
        .sort((a, b) => b.views - a.views)
        .slice(0, CONFIG.MAX_POPULAR_POSTS);
    
    if (sortedPosts.length === 0) {
        container.innerHTML = '<p class="no-posts">暂无热门文章</p>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    sortedPosts.forEach((post, index) => {
        const item = document.createElement('div');
        item.className = 'popular-item';
        
        item.innerHTML = `
            <a href="${getPostHref(post)}" title="${post.title}">
                <span class="popular-item-rank">${index + 1}</span>
                ${truncateTitle(post.title, 25)}
            </a>
            <div class="popular-item-meta">
                <span class="popular-item-views">${formatViewCount(post.views)}</span>
            </div>
        `;
        
        fragment.appendChild(item);
    });
    
    container.appendChild(fragment);
}

// 渲染热门文章降级方案
function renderPopularPostsFallback(container) {
    container.innerHTML = '';
    
    const posts = AppState.blogPosts.slice(0, CONFIG.MAX_POPULAR_POSTS);
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts">暂无文章</p>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    posts.forEach((post, index) => {
        const item = document.createElement('div');
        item.className = 'popular-item';
        
        item.innerHTML = `
            <a href="${getPostHref(post)}" title="${post.title}">
                <span class="popular-item-rank">${index + 1}</span>
                ${truncateTitle(post.title, 25)}
            </a>
        `;
        
        fragment.appendChild(item);
    });
    
    container.appendChild(fragment);
}

// 截断标题
function truncateTitle(title, maxLength) {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
}

// 格式化访问量
function formatViewCount(count) {
    if (count >= 10000) {
        return (count / 10000).toFixed(1) + 'w';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
}

// ====== 面包屑导航 ======

// 初始化面包屑
function initBreadcrumb() {
    const currentPath = window.location.pathname;
    
    // 首页不需要面包屑
    if (currentPath === '/' || currentPath === '/index.html') {
        return;
    }
    
    // 生成面包屑（支持 /p/<id>.html 与 /c/<id>/index.html）
    const breadcrumbHtml = generateBreadcrumb(currentPath);
    
    // 插入面包屑
    const contentWrapper = document.querySelector('.content-wrapper');
    if (contentWrapper && breadcrumbHtml) {
        contentWrapper.insertAdjacentHTML('afterbegin', breadcrumbHtml);
    }
}

// 生成面包屑 HTML
function generateBreadcrumb(currentPath) {
    // ASCII-only article page
    if (isAsciiPostPath(currentPath)) {
        const post = findPostByUrlPath(currentPath);
        if (!post) return null;

        // original_path example: notes/阅读感悟/活着-余华.html
        const original = post.original_path || post.path || '';
        const parts = original.replace(/^\//, '').split('/').filter(Boolean);
        if (parts.length === 0) return null;

        // drop filename
        parts.pop();
        // drop leading "notes"
        if (parts[0] === 'notes') parts.shift();

        let breadcrumbHtml = `
            <nav class="breadcrumb" aria-label="面包屑导航">
                <span class="breadcrumb-item">
                    <a href="/index.html">首页</a>
                </span>
        `;

        // Build cumulative directory path under notes/
        let cumulative = 'notes';
        for (let i = 0; i < parts.length; i++) {
            cumulative += '/' + parts[i];
            const dirNode = findDirectoryByPath(AppState.directoryStructure, cumulative);
            breadcrumbHtml += `<span class="breadcrumb-separator">/</span>`;
            if (dirNode) {
                breadcrumbHtml += `
                    <span class="breadcrumb-item">
                        <a href="${getDirHref(dirNode)}">${parts[i]}</a>
                    </span>
                `;
            } else {
                breadcrumbHtml += `
                    <span class="breadcrumb-item">
                        <span>${parts[i]}</span>
                    </span>
                `;
            }
        }

        breadcrumbHtml += `<span class="breadcrumb-separator">/</span>`;
        breadcrumbHtml += `
            <span class="breadcrumb-item current">
                <span>${getPageTitle() || post.title || '文章'}</span>
            </span>
        `;
        breadcrumbHtml += '</nav>';
        return breadcrumbHtml;
    }

    // ASCII-only directory page
    if (isAsciiDirPath(currentPath)) {
        const dirNode = findDirByUrlPath(currentPath);
        if (!dirNode) return null;

        const original = dirNode.path || '';
        const parts = original.replace(/^\//, '').split('/').filter(Boolean);
        if (parts[0] === 'notes') parts.shift();

        let breadcrumbHtml = `
            <nav class="breadcrumb" aria-label="面包屑导航">
                <span class="breadcrumb-item">
                    <a href="/index.html">首页</a>
                </span>
        `;

        let cumulative = 'notes';
        for (let i = 0; i < parts.length; i++) {
            cumulative += '/' + parts[i];
            const node = findDirectoryByPath(AppState.directoryStructure, cumulative);
            breadcrumbHtml += `<span class="breadcrumb-separator">/</span>`;
            if (node && i !== parts.length - 1) {
                breadcrumbHtml += `
                    <span class="breadcrumb-item">
                        <a href="${getDirHref(node)}">${parts[i]}</a>
                    </span>
                `;
            } else {
                breadcrumbHtml += `
                    <span class="breadcrumb-item current">
                        <span>${parts[i]}</span>
                    </span>
                `;
            }
        }
        breadcrumbHtml += '</nav>';
        return breadcrumbHtml;
    }

    // 解析路径
    const pathParts = currentPath
        .replace(/^\//, '')
        .replace(/\.html$/, '')
        .split('/')
        .filter(part => part && part !== 'index');
    
    if (pathParts.length === 0) {
        return null;
    }
    
    let breadcrumbHtml = `
        <nav class="breadcrumb" aria-label="面包屑导航">
            <span class="breadcrumb-item">
                <a href="/index.html">首页</a>
            </span>
    `;
    
    let currentUrl = '';
    
    pathParts.forEach((part, index) => {
        currentUrl += '/' + part;
        const isLast = index === pathParts.length - 1;
        const displayName = decodeURIComponent(part);
        
        breadcrumbHtml += `<span class="breadcrumb-separator">/</span>`;
        
        if (isLast) {
            // 最后一项显示当前页面标题
            const pageTitle = getPageTitle() || displayName;
            breadcrumbHtml += `
                <span class="breadcrumb-item current">
                    <span>${pageTitle}</span>
                </span>
            `;
        } else {
            // 中间项链接到目录索引页
            breadcrumbHtml += `
                <span class="breadcrumb-item">
                    <a href="${currentUrl}/index.html">${displayName}</a>
                </span>
            `;
        }
    });
    
    breadcrumbHtml += '</nav>';
    
    return breadcrumbHtml;
}

// 获取当前页面标题
function getPageTitle() {
    // 尝试从 h1 获取标题
    const h1 = document.querySelector('.markdown-content h1');
    if (h1) {
        return h1.textContent.trim();
    }
    
    // 从 document.title 获取
    const title = document.title;
    if (title && title.includes(' - ')) {
        return title.split(' - ')[0].trim();
    }
    
    return null;
}

// ====== 全局API导出 ======
window.blogUtils = {
    sharePost,
    highlightKeywords,
    getUrlParameter: Utils.getUrlParameter,
    showToast,
    clearCache: CacheManager.clearCache,
    checkForUpdates: CacheManager.checkForUpdates,
    toggleLeftSidebar,
    toggleRightSidebar,
    getPageViews: ViewCountManager.getPageViews.bind(ViewCountManager)
};

// ====== 目录列表 ======

// 初始化目录列表
function initDirectoryList() {
    try {
        const dirListHtml = generateDirectoryList();
        if (dirListHtml) {
            const contentArea = document.querySelector('.markdown-content');
            if (contentArea) {
                contentArea.insertAdjacentHTML('beforeend', dirListHtml);
            }
        }
    } catch (error) {
        console.error('❌ 目录列表初始化失败:', error);
    }
}

// 动态生成目录列表
function generateDirectoryList() {
    const currentPath = window.location.pathname;

    // Find current directory node (supports /c/<id>/index.html and legacy /notes/.../index.html)
    let currentDir = null;
    if (isAsciiDirPath(currentPath)) {
        currentDir = findDirByUrlPath(currentPath);
    } else {
        // Legacy: /notes/.../something.html -> match against "notes/..." (no leading slash)
        let legacyDirPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
        legacyDirPath = legacyDirPath.replace(/^\//, '');
        // normalize possible trailing /index
        if (!legacyDirPath || legacyDirPath === '') legacyDirPath = '';
        currentDir = findDirectoryByPath(AppState.directoryStructure, legacyDirPath);
    }
    
    if (!currentDir || !currentDir.subdirs || currentDir.subdirs.length === 0) {
        return null;
    }
    
    // 生成目录列表HTML
    const subdirItems = currentDir.subdirs
        .map(subdir => {
            const dirName = (subdir.path || '').split('/').pop() || subdir.name || '目录';
            return `<li><a href="${getDirHref(subdir)}">${dirName}</a></li>`;
        })
        .join('');
    
    return `<h2>📁 子目录</h2><ul>${subdirItems}</ul>`;
}

// 根据路径查找目录（递归）
function findDirectoryByPath(directories, targetPath) {
    if (!directories || !Array.isArray(directories)) {
        return null;
    }
    
    for (const dir of directories) {
        if (dir.path === targetPath) {
            return dir;
        }
        
        if (dir.subdirs && dir.subdirs.length > 0) {
            const found = findDirectoryByPath(dir.subdirs, targetPath);
            if (found) {
                return found;
            }
        }
    }
    
    return null;
}

function findDirectoryById(directories, targetId) {
    if (!directories || !Array.isArray(directories)) {
        return null;
    }
    for (const dir of directories) {
        if (dir.id === targetId) return dir;
        if (dir.subdirs && dir.subdirs.length > 0) {
            const found = findDirectoryById(dir.subdirs, targetId);
            if (found) return found;
        }
    }
    return null;
}

// ====== 文章卡片渲染 ======
function renderArticleCards(container, dirPath) {
    if (!container) return;
    
    console.log('📂 渲染文章卡片，目录:', dirPath);
    console.log('📚 所有文章:', AppState.blogPosts);
    console.log('📁 目录结构:', AppState.directoryStructure);
    
    // 获取当前目录下的所有文章（按 original_path 归类，避免中文 URL 暴露到地址栏）
    const articlesInDir = getArticlesInDirectory(dirPath);
    console.log('📄 当前目录文章:', articlesInDir);
    
    // 获取子目录
    const currentDir = findDirectoryByPath(AppState.directoryStructure, dirPath);
    const subdirs = currentDir ? currentDir.subdirs : [];
    console.log('📂 子目录:', subdirs);
    
    let html = '';
    
    // 如果有子目录，先显示子目录卡片
    if (subdirs && subdirs.length > 0) {
        html += '<div class="directory-header"><h2>📁 子目录</h2></div>';
        html += '<div class="article-cards">';
        
        subdirs.forEach(subdir => {
            const dirName = subdir.path.split('/').pop();
            const articleCount = getArticlesInDirectory(subdir.path).length;
            html += `
                <a href="${getDirHref(subdir)}" class="article-card subdir-card">
                    <div class="subdir-card-icon">📂</div>
                    <div class="subdir-card-title">${dirName}</div>
                    <div class="subdir-card-count">${articleCount} 篇文章</div>
                </a>
            `;
        });
        
        html += '</div>';
    }
    
    // 显示当前目录下的文章卡片
    if (articlesInDir.length > 0) {
        html += '<div class="directory-header"><h2>📄 文章列表</h2></div>';
        html += '<div class="article-cards">';
        
        articlesInDir.forEach(article => {
            const sourcePath = article.original_path || article.path || '';
            const pathParts = sourcePath.split('/');
            pathParts.pop(); // filename
            const prettyDir = pathParts.slice(1).join(' / '); // 移除 'notes' 前缀
            
            const keywordsHtml = article.keywords && article.keywords.length > 0
                ? article.keywords.map(k => `<span class="article-card-keyword">${k}</span>`).join('')
                : '';
            
            html += `
                <a href="${getPostHref(article)}" class="article-card">
                    <div class="article-card-title">${article.title}</div>
                    <div class="article-card-path">${prettyDir || '根目录'}</div>
                    <div class="article-card-keywords">${keywordsHtml}</div>
                </a>
            `;
        });
        
        html += '</div>';
    }
    
    // 如果既没有子目录也没有文章
    if ((!subdirs || subdirs.length === 0) && articlesInDir.length === 0) {
        html = '<div class="no-results"><p>📭 该目录下暂无内容</p></div>';
    }
    
    container.innerHTML = html;
}

// 获取指定目录下的所有文章（包括子目录）
function getArticlesInDirectory(dirPath) {
    return AppState.blogPosts.filter(post => {
        const original = post.original_path || post.path || '';
        return original.startsWith(dirPath + '/');
    });
}

// 初始化目录页面的文章卡片
function initArticleCards() {
    const currentPath = window.location.pathname;
    console.log('🎴 initArticleCards 开始，当前路径:', currentPath);
    
    let dirPath = null;

    // New ASCII-only directory page: /c/<id>/index.html
    if (isAsciiDirPath(currentPath)) {
        const dirNode = findDirByUrlPath(currentPath);
        if (!dirNode) {
            console.log('🎴 跳过：找不到目录节点', currentPath);
            return;
        }
        dirPath = dirNode.path; // legacy (may contain Chinese) used internally for grouping
    } else {
        // Legacy: notes/<...>/index.html
        if (!currentPath.includes('/notes/') || !currentPath.endsWith('/index.html')) {
            console.log('🎴 跳过：不是目录页面');
            return;
        }
        const pathMatch = currentPath.match(/\/notes\/(.+)\/index\.html$/);
        if (!pathMatch) return;
        const decodedPath = decodeURIComponent(pathMatch[1]);
        dirPath = 'notes/' + decodedPath;
    }
    
    console.log('📂 初始化文章卡片，目录路径:', dirPath);
    
    // 找到内容容器
    const contentContainer = document.querySelector('.markdown-content');
    console.log('🎴 内容容器:', contentContainer);
    if (!contentContainer) {
        console.log('🎴 跳过：找不到 .markdown-content 容器');
        return;
    }
    
    // 保留标题和描述，替换文章列表
    const h1 = contentContainer.querySelector('h1');
    const firstP = contentContainer.querySelector('p');
    console.log('🎴 找到标题:', h1?.textContent, '描述:', firstP?.textContent);
    
    // 创建卡片容器
    const cardsContainer = document.createElement('div');
    cardsContainer.id = 'article-cards-container';
    
    // 清空内容但保留标题
    contentContainer.innerHTML = '';
    if (h1) contentContainer.appendChild(h1);
    if (firstP) contentContainer.appendChild(firstP);
    contentContainer.appendChild(cardsContainer);
    
    console.log('🎴 开始渲染文章卡片...');
    // 渲染卡片
    renderArticleCards(cardsContainer, dirPath);
}

// ====== Three.js 3D 星空效果 ======
function initThreeJsStarfield() {
    // 仅在首页初始化
    const currentPath = window.location.pathname;
    if (currentPath !== '/' && currentPath !== '/index.html') {
        return;
    }
    
    const container = document.getElementById('starfield-container');
    const canvas = document.getElementById('starfield-canvas');
    
    if (!container || !canvas || typeof THREE === 'undefined') {
        console.log('📦 Three.js 星空效果：容器未找到或 Three.js 未加载');
        return;
    }
    
    console.log('🌟 初始化 Three.js 星空效果');
    
    // 场景设置
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // 创建星星粒子系统
    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    
    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        // 随机位置 - 球形分布
        const radius = 50 + Math.random() * 150;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i3 + 2] = radius * Math.cos(phi);
        
        // 随机颜色 - 偏蓝紫色调
        const colorChoice = Math.random();
        if (colorChoice < 0.3) {
            // 蓝色
            starColors[i3] = 0.4 + Math.random() * 0.2;
            starColors[i3 + 1] = 0.5 + Math.random() * 0.3;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        } else if (colorChoice < 0.6) {
            // 紫色
            starColors[i3] = 0.6 + Math.random() * 0.3;
            starColors[i3 + 1] = 0.3 + Math.random() * 0.2;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        } else if (colorChoice < 0.8) {
            // 白色
            starColors[i3] = 0.9 + Math.random() * 0.1;
            starColors[i3 + 1] = 0.9 + Math.random() * 0.1;
            starColors[i3 + 2] = 0.95 + Math.random() * 0.05;
        } else {
            // 青色
            starColors[i3] = 0.3 + Math.random() * 0.2;
            starColors[i3 + 1] = 0.8 + Math.random() * 0.2;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        }
        
        // 随机大小
        starSizes[i] = Math.random() * 2 + 0.5;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    
    // 星星材质
    const starMaterial = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
    });
    
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    
    // 创建星云效果 - 多个发光球体
    const nebulaGroup = new THREE.Group();
    const nebulaColors = [0x6366f1, 0x8b5cf6, 0xec4899, 0x06b6d4];
    
    for (let i = 0; i < 5; i++) {
        const nebulaGeometry = new THREE.SphereGeometry(15 + Math.random() * 20, 32, 32);
        const nebulaMaterial = new THREE.MeshBasicMaterial({
            color: nebulaColors[Math.floor(Math.random() * nebulaColors.length)],
            transparent: true,
            opacity: 0.03 + Math.random() * 0.02,
            side: THREE.DoubleSide
        });
        const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
        
        nebula.position.set(
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 60 - 30
        );
        
        nebulaGroup.add(nebula);
    }
    scene.add(nebulaGroup);
    
    // 相机位置
    camera.position.z = 50;
    
    // 鼠标交互
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    
    container.addEventListener('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    });
    
    // 动画循环
    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);
        
        // 平滑跟随鼠标
        targetX += (mouseX * 0.5 - targetX) * 0.02;
        targetY += (mouseY * 0.5 - targetY) * 0.02;
        
        // 旋转星星
        stars.rotation.y += 0.0003;
        stars.rotation.x += 0.0001;
        
        // 相机跟随鼠标
        camera.position.x = targetX * 10;
        camera.position.y = targetY * 10;
        camera.lookAt(scene.position);
        
        // 星云缓慢移动
        nebulaGroup.rotation.y += 0.0002;
        nebulaGroup.children.forEach((nebula, i) => {
            nebula.rotation.x += 0.001 * (i + 1) * 0.1;
            nebula.rotation.y += 0.001 * (i + 1) * 0.1;
        });
        
        renderer.render(scene, camera);
    }
    
    animate();
    
    // 响应式调整
    const handleResize = Utils.debounce(() => {
        if (!container) return;
        
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }, 100);
    
    window.addEventListener('resize', handleResize);
    
    // 清理函数（页面卸载时）
    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(animationId);
        renderer.dispose();
        starGeometry.dispose();
        starMaterial.dispose();
    });
    
    console.log('✅ Three.js 星空效果初始化完成');
}