# 📚 Ken的知识库

[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue?logo=github)](https://kenwang007.github.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen.svg)](CHANGELOG.md)

个人技术博客，记录AI学习、架构设计、编程技术和读书心得。

🌐 **在线访问**: [https://kenwang007.github.io/](https://kenwang007.github.io/)

## ✨ 特性

### 核心功能
- 📝 **Markdown支持**: 使用Markdown编写，自动转换为HTML
- 🎨 **暗黑太空主题**: 精美的暗黑主题设计，星空动画背景
- 🔍 **智能搜索**: 基于关键词的文章搜索
- 🏷️ **关键词索引**: 自动提取和分类关键词
- 📱 **响应式设计**: 完美支持桌面端和移动端

### 性能优化
- ⚡ **LocalStorage缓存**: 减少网络请求，提升加载速度
- 🔄 **后台更新**: 智能检测内容更新
- 💾 **Service Worker**: 支持离线访问
- 🚀 **PWA支持**: 可添加到主屏幕，像原生应用一样使用

### SEO优化
- 🎯 **完整Meta标签**: description、keywords、Open Graph、Twitter Cards
- 🗺️ **自动生成Sitemap**: 便于搜索引擎索引
- 📡 **RSS Feed**: 支持RSS订阅
- 📊 **结构化数据**: JSON-LD格式的Schema.org标记

### 辅助功能
- ♿ **无障碍支持**: ARIA标签、键盘导航
- 🖨️ **打印优化**: 优化的打印样式
- 🎭 **减少动画模式**: 尊重用户偏好设置

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, Vanilla JavaScript
- **构建工具**: Python 3.x
- **Markdown转换**: Pandoc
- **部署**: GitHub Pages
- **离线支持**: Service Worker API
- **PWA**: Web App Manifest

## 📦 安装与使用

### 前置要求

- Python 3.7+
- [Pandoc](https://pandoc.org/installing.html)
- Git

### 安装Pandoc

**macOS:**
```bash
brew install pandoc
```

**Ubuntu/Debian:**
```bash
sudo apt-get install pandoc
```

**Windows:**
下载并安装 [Pandoc for Windows](https://pandoc.org/installing.html)

### 克隆仓库

```bash
git clone https://github.com/kenwang007/kenwang007.github.io.git
cd kenwang007.github.io
```

### 生成网站

```bash
# 基本用法
python3 generate_nav.py

# 查看帮助
python3 generate_nav.py --help

# 详细输出
python3 generate_nav.py --verbose

# 不生成sitemap
python3 generate_nav.py --no-sitemap

# 不生成RSS
python3 generate_nav.py --no-rss
```

### 本地预览

```bash
# 使用Python内置服务器
python3 -m http.server 8000

# 访问 http://localhost:8000
```

## 📝 写作指南

### 创建新文章

1. 在 `notes/` 目录下创建或选择分类文件夹
2. 创建Markdown文件（.md）
3. 编写内容
4. 运行生成脚本

**示例文件结构:**
```
notes/
  ├── AI Learning/
  │   ├── index.md
  │   └── RAG/
  │       └── introduction.md
  ├── Architecture/
  │   └── Python-learning.md
  └── books/
      └── index.md
```

### Markdown格式

```markdown
# 文章标题

这里是文章内容...

## 二级标题

- 列表项1
- 列表项2

### 三级标题

代码示例：
\`\`\`python
print("Hello, World!")
\`\`\`
```

### 关键词提取

脚本会自动从标题中提取关键词。建议在标题中包含：
- 技术术语（如: RAG, Python, Docker）
- 核心概念（如: 架构, 设计模式）
- 操作对象（如: 配置, 部署）

## 🔧 配置

编辑 `config.json` 自定义网站配置：

```json
{
  "site": {
    "name": "你的网站名称",
    "url": "https://yourusername.github.io",
    "description": "网站描述"
  },
  "features": {
    "cache": {
      "enabled": true,
      "expiry": 86400000
    }
  }
}
```

## 📊 生成的文件

运行脚本后会生成：

- `nav_data.json` - 导航和文章数据
- `sitemap.xml` - 搜索引擎网站地图
- `rss.xml` - RSS订阅源
- `*.html` - 从Markdown转换的HTML文件

## 🚀 部署

### GitHub Pages部署

1. 推送到GitHub仓库
```bash
git add .
git commit -m "Update content"
git push origin main
```

2. 在仓库设置中启用GitHub Pages
   - Settings → Pages
   - Source: Deploy from branch
   - Branch: main / (root)

3. 访问 `https://yourusername.github.io`

## 🎨 自定义主题

编辑 `style.css` 中的CSS变量：

```css
:root {
    --color-primary: #6366f1;
    --color-bg-dark: #0a0a0f;
    --color-text-primary: #e0e0e0;
    /* 更多变量... */
}
```

## 📈 性能指标

- ⚡ Lighthouse Score: 95+
- 📦 首次加载: < 2s
- 🔄 缓存加载: < 500ms
- 📱 移动友好度: 100%

## 🤝 贡献

欢迎提交Issues和Pull Requests！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📧 联系方式

- GitHub: [@kenwang007](https://github.com/kenwang007)
- 网站: [https://kenwang007.github.io](https://kenwang007.github.io)

## 🙏 致谢

- 主题灵感来源于暗黑太空美学
- 使用了 [Pandoc](https://pandoc.org/) 进行Markdown转换
- 托管于 [GitHub Pages](https://pages.github.com/)

---

⭐ 如果这个项目对你有帮助，请给个Star！
