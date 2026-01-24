// 博客网站UI/UX优化脚本

// 全局变量
let allKeywords = [];
let blogPosts = [];
let navMenuData = [];
let directoryStructure = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async function() {
    try {
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
    } catch (error) {
        console.error('加载导航数据失败:', error);
    }
});

// 加载导航数据
async function loadNavData() {
    try {
        const response = await fetch('/nav_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // 更新全局变量
        navMenuData = data.nav_menu || [];
        blogPosts = data.blog_posts || [];
        directoryStructure = data.directory_structure || [];
        
        console.log('导航数据加载成功:', {
            navMenuCount: navMenuData.length,
            blogPostsCount: blogPosts.length,
            directoryStructureCount: directoryStructure.length
        });
    } catch (error) {
        console.error('加载nav_data.json失败:', error);
        // 使用默认数据作为回退
        useDefaultNavData();
    }
}

// 使用默认导航数据作为回退
function useDefaultNavData() {
    console.log('使用默认导航数据');
    navMenuData = [
        { name: 'AI', path: 'notes/AI' },
        { name: 'AI Learning', path: 'notes/AI Learning' },
        { name: 'Architecture', path: 'notes/Architecture' },
        { name: 'books', path: 'notes/books' }
    ];
    blogPosts = [
        {
            title: "📚 RAG技术全面介绍",
            path: "notes/AI Learning/RAG/introduction.html",
            keywords: ["RAG", "检索增强生成", "AI", "大型语言模型", "LLM", "向量数据库"]
        },
        {
            title: "🏗️ 架构随笔",
            path: "notes/Architecture/index.html",
            keywords: ["架构", "设计", "随笔"]
        },
        {
            title: "📖 读书摘要",
            path: "notes/books/index.html",
            keywords: ["读书", "摘要", "思考"]
        },
        {
            title: "🤖 AI学习",
            path: "notes/AI Learning/index.html",
            keywords: ["AI", "学习", "技术"]
        },
        {
            title: "💻 Python学习",
            path: "notes/Architecture/Python-learning.html",
            keywords: ["Python", "编程", "学习"]
        }
    ];
}

// 初始化导航菜单
function initNavigation() {
    // 获取导航菜单容器
    const navMenu = document.getElementById('nav-menu');
    
    // 清空现有菜单
    navMenu.innerHTML = '';
    
    // 添加首页菜单项
    const homeItem = document.createElement('li');
    homeItem.innerHTML = `<a href="/index.html">首页</a>`;
    navMenu.appendChild(homeItem);
    
    // 添加notes目录下的一级文件夹作为菜单项
    navMenuData.forEach(folder => {
        const menuItem = document.createElement('li');
        menuItem.innerHTML = `<a href="/${folder.path}/index.html">${folder.name}</a>`;
        navMenu.appendChild(menuItem);
    });
}

// 初始化关键词索引
function initKeywords() {
    // 提取所有关键词
    extractKeywords();
    
    // 生成关键词索引
    generateKeywordIndex();
}

// 提取所有关键词
function extractKeywords() {
    // 清空现有关键词
    allKeywords = [];
    
    // 遍历所有博客文章，只使用nav_data.json中已经提取好的关键词
    blogPosts.forEach(post => {
        // 只使用post.keywords（从nav_data.json中提取的），不再从标题中重复提取
        allKeywords = [...new Set([...allKeywords, ...post.keywords])];
    });
    
    // 按字母顺序排序
    allKeywords.sort();
}

// 从标题中提取关键词
function extractKeywordsFromTitle(title) {
    // 移除标题中的表情符号和特殊字符
    const cleanTitle = title.replace(/[📚🏗️📖🤖💻]/g, '').trim();
    
    // 简单的关键词提取逻辑
    // 实际应用中可以使用更复杂的NLP算法
    const keywords = cleanTitle.split(/[,，\s]+/).filter(word => word.length > 1);
    
    return keywords;
}

// 生成关键词索引
function generateKeywordIndex() {
    const keywordList = document.getElementById('keyword-list');
    
    // 清空现有关键词
    keywordList.innerHTML = '';
    
    // 生成关键词链接
    allKeywords.forEach(keyword => {
        const keywordItem = document.createElement('div');
        keywordItem.className = 'keyword-item';
        keywordItem.innerHTML = `<a href="/search.html?keyword=${encodeURIComponent(keyword)}" class="keyword-link">${keyword}</a>`;
        keywordList.appendChild(keywordItem);
    });
}

// 初始化搜索功能
function initSearch() {
    // 检查当前页面是否是搜索结果页
    if (window.location.pathname.includes('search.html')) {
        handleSearch();
    }
}

// 处理搜索请求
function handleSearch() {
    // 获取URL参数中的关键词
    const urlParams = new URLSearchParams(window.location.search);
    const searchKeyword = urlParams.get('keyword');
    
    if (searchKeyword) {
        // 显示搜索结果
        displaySearchResults(searchKeyword);
        
        // 更新页面标题
        document.title = `搜索结果: ${searchKeyword} - Ken的知识库`;
    }
}

// 显示搜索结果
function displaySearchResults(keyword) {
    // 获取搜索结果容器
    const resultsContainer = document.getElementById('search-results');
    
    if (!resultsContainer) {
        console.error('搜索结果容器未找到');
        return;
    }
    
    // 清空现有结果
    resultsContainer.innerHTML = '';
    
    // 过滤包含关键词的博客文章
    const matchingPosts = blogPosts.filter(post => {
        // 检查标题和关键词中是否包含搜索关键词
        return post.title.toLowerCase().includes(keyword.toLowerCase()) ||
               post.keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()));
    });
    
    // 更新搜索统计
    const searchStats = document.getElementById('search-stats');
    if (searchStats) {
        searchStats.textContent = `找到 ${matchingPosts.length} 篇包含 "${keyword}" 的文章`;
    }
    
    // 生成搜索结果列表
    if (matchingPosts.length > 0) {
        matchingPosts.forEach(post => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            
            resultItem.innerHTML = `
                <h3 class="result-title">
                    <a href="/${post.path}">${post.title}</a>
                </h3>
                <div class="result-meta">
                    <span>关键词: ${post.keywords.join(', ')}</span>
                </div>
            `;
            
            resultsContainer.appendChild(resultItem);
        });
    } else {
        // 没有找到匹配的文章
        resultsContainer.innerHTML = `
            <div class="no-results">
                <p>未找到包含 "${keyword}" 的文章</p>
            </div>
        `;
    }
}

// 工具函数：获取URL参数
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// 工具函数：防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 平滑滚动功能
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 70, // 考虑顶部导航栏高度
                behavior: 'smooth'
            });
        }
    });
});

// 移动端菜单切换
function toggleMobileMenu() {
    const navMenu = document.getElementById('nav-menu');
    navMenu.classList.toggle('active');
}

// 监听窗口大小变化，响应式调整
window.addEventListener('resize', debounce(function() {
    // 响应式导航调整
    const navMenu = document.getElementById('nav-menu');
    if (window.innerWidth > 768 && navMenu.classList.contains('active')) {
        navMenu.classList.remove('active');
    }
}, 250));

// 关键词高亮功能
function highlightKeywords(text, keyword) {
    if (!keyword) return text;
    
    const regex = new RegExp(`(${keyword})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// 博客文章分享功能
function sharePost(title, url) {
    // 简单的分享功能实现
    const shareText = `分享文章: ${title} - ${url}`;
    
    // 检查浏览器是否支持原生分享API
    if (navigator.share) {
        navigator.share({
            title: title,
            url: url
        }).catch(error => {
            console.error('分享失败:', error);
            fallbackShare(shareText);
        });
    } else {
        // 降级方案：复制到剪贴板
        fallbackShare(shareText);
    }
}

// 分享降级方案
function fallbackShare(text) {
    // 复制到剪贴板
    navigator.clipboard.writeText(text).then(() => {
        alert('分享链接已复制到剪贴板');
    }).catch(error => {
        console.error('复制失败:', error);
        alert('分享失败，请手动复制链接');
    });
}

// 滚动监听，添加导航栏阴影效果
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.top-nav');
    if (window.scrollY > 50) {
        nav.style.boxShadow = '0 2px 20px rgba(99, 102, 241, 0.2)';
    } else {
        nav.style.boxShadow = '0 2px 20px rgba(99, 102, 241, 0.1)';
    }
});

// 页面加载动画
window.addEventListener('load', function() {
    document.body.classList.add('loaded');
});

// 导出全局函数（可选）
window.blogUtils = {
    sharePost,
    highlightKeywords,
    getUrlParameter
};

// 动态生成目录列表
function generateDirectoryList() {
    // 获取当前页面的路径
    const currentPath = window.location.pathname;
    
    // 移除文件名，只保留目录路径
    let dirPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    if (!dirPath) {
        dirPath = '/';
    }
    
    // 在directoryStructure中查找当前目录
    const currentDir = findDirectoryByPath(directoryStructure, dirPath);
    
    if (!currentDir || !currentDir.subdirs || currentDir.subdirs.length === 0) {
        return null;
    }
    
    // 生成目录列表HTML
    let html = '<h2>目录结构</h2><ul>';
    currentDir.subdirs.forEach(subdir => {
        const dirName = subdir.path.split('/').pop();
        html += `<li><a href="/${subdir.path}/index.html">${dirName}</a></li>`;
    });
    html += '</ul>';
    
    return html;
}

// 根据路径查找目录
function findDirectoryByPath(directories, targetPath) {
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

// 初始化目录列表
function initDirectoryList() {
    const dirListHtml = generateDirectoryList();
    if (dirListHtml) {
        // 查找目录列表容器
        const contentArea = document.querySelector('.markdown-content');
        if (contentArea) {
            // 在文章内容后插入目录列表
            contentArea.insertAdjacentHTML('beforeend', dirListHtml);
        }
    }
}