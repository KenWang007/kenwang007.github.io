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
        
        // 监听更新
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // 有新版本可用
                    console.log('🔄 发现新版本');
                    showToast('📦 新版本可用，刷新页面以更新', 5000);
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
    
    // 初始化滚动监听
    initScrollEffects();
    
    // 初始化响应式调整
    initResponsiveHandlers();
    
    // 恢复侧边栏状态
    restoreSidebarState();
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
        { name: 'AI', path: 'notes/AI' },
        { name: 'AI Learning', path: 'notes/AI Learning' },
        { name: 'Architecture', path: 'notes/Architecture' },
        { name: 'books', path: 'notes/books' }
    ];
    
    AppState.blogPosts = [
        {
            title: "📚 RAG技术全面介绍",
            path: "notes/AI Learning/RAG/introduction.html",
            keywords: ["RAG", "检索增强生成"]
        },
        {
            title: "🏗️ 架构随笔",
            path: "notes/Architecture/index.html",
            keywords: ["架构", "设计"]
        },
        {
            title: "📖 读书摘要",
            path: "notes/books/index.html",
            keywords: ["读书", "摘要"]
        },
        {
            title: "🤖 AI学习",
            path: "notes/AI Learning/index.html",
            keywords: ["AI", "学习"]
        },
        {
            title: "💻 Python学习",
            path: "notes/Architecture/Python-learning.html",
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
    
    // 清空现有菜单
    navMenu.innerHTML = '';
    
    // 添加首页菜单项
    const homeItem = createMenuItem('首页', '/index.html');
    navMenu.appendChild(homeItem);
    
    // 添加notes目录下的一级文件夹作为菜单项
    AppState.navMenuData.forEach(folder => {
        const menuItem = createMenuItem(folder.name, `/${folder.path}/index.html`);
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
    
    if (!searchKeyword) {
        console.warn('⚠️ 未提供搜索关键词');
        displayNoSearchTerm();
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
        link.href = `/${post.path}`;
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
    
    const handleScroll = Utils.throttle(() => {
        if (window.scrollY > 50) {
            nav.style.boxShadow = '0 2px 20px rgba(99, 102, 241, 0.2)';
        } else {
            nav.style.boxShadow = '0 2px 20px rgba(99, 102, 241, 0.1)';
        }
    }, 100);
    
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
    if (leftSidebar.querySelector('.sidebar-toggle-left')) {
        return;
    }
    
    // 创建折叠按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle sidebar-toggle-left';
    toggleBtn.innerHTML = '‹';
    toggleBtn.setAttribute('aria-label', '折叠/展开关键词索引');
    toggleBtn.setAttribute('title', '点击折叠/展开');
    
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLeftSidebar();
        // 更新按钮箭头方向
        toggleBtn.innerHTML = AppState.leftSidebarCollapsed ? '›' : '‹';
    });
    
    leftSidebar.appendChild(toggleBtn);
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
    if (rightSidebar.querySelector('.sidebar-toggle-right')) {
        return;
    }
    
    // 创建折叠按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle sidebar-toggle-right';
    toggleBtn.innerHTML = '›';
    toggleBtn.setAttribute('aria-label', '折叠/展开热门文章');
    toggleBtn.setAttribute('title', '点击折叠/展开');
    
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRightSidebar();
        // 更新按钮箭头方向
        toggleBtn.innerHTML = AppState.rightSidebarCollapsed ? '‹' : '›';
    });
    
    rightSidebar.appendChild(toggleBtn);
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
        const articlePaths = AppState.blogPosts.map(post => post.path);
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
        .map(post => ({
            ...post,
            views: AppState.viewCounts[post.path] || Math.floor(Math.random() * 50) + 5
        }))
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
            <a href="/${post.path}" title="${post.title}">
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
            <a href="/${post.path}" title="${post.title}">
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
    
    // 生成面包屑
    const breadcrumbHtml = generateBreadcrumb(currentPath);
    
    // 插入面包屑
    const contentWrapper = document.querySelector('.content-wrapper');
    if (contentWrapper && breadcrumbHtml) {
        contentWrapper.insertAdjacentHTML('afterbegin', breadcrumbHtml);
    }
}

// 生成面包屑 HTML
function generateBreadcrumb(currentPath) {
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
    
    // 移除文件名，只保留目录路径
    let dirPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    if (!dirPath || dirPath === '') {
        dirPath = '/';
    }
    
    // 在directoryStructure中查找当前目录
    const currentDir = findDirectoryByPath(AppState.directoryStructure, dirPath);
    
    if (!currentDir || !currentDir.subdirs || currentDir.subdirs.length === 0) {
        return null;
    }
    
    // 生成目录列表HTML
    const subdirItems = currentDir.subdirs
        .map(subdir => {
            const dirName = subdir.path.split('/').pop();
            return `<li><a href="/${subdir.path}/index.html">${dirName}</a></li>`;
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