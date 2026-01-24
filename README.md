# Ken的知识库

一个基于纯静态HTML/CSS/JavaScript构建的知识库网站，具有自动导航生成和关键词提取功能。

## 功能特性

- **纯静态架构**: 无需任何后端服务，直接部署到GitHub Pages
- **自动导航生成**: 基于文件系统自动生成导航菜单，无需手动维护
- **智能关键词提取**: 从文章标题自动提取核心关键词，用于左侧导航
- **GitHub Actions集成**: 自动将Markdown文件转换为HTML格式
- **响应式设计**: 适配各种屏幕尺寸
- **深色太空主题**: 现代化的视觉设计

## 项目结构

```
├── notes/              # 知识库文章目录
├── .github/workflows/  # GitHub Actions工作流
├── template.html       # HTML模板文件
├── style.css           # 样式文件
├── script.js           # JavaScript逻辑
├── generate_nav.py     # 导航数据生成脚本
├── nav_data.json       # 自动生成的导航数据
└── .nojekyll           # 禁用GitHub Pages的Jekyll构建
```

## 本地开发

### 1. 安装依赖

```bash
# 安装pandoc用于Markdown转HTML
brew install pandoc  # macOS
# 或
sudo apt-get install pandoc  # Ubuntu
```

### 2. 运行本地服务器

```bash
python3 -m http.server 8000
```

然后在浏览器中访问 `http://localhost:8000`

### 3. 更新导航数据

当你添加或修改文章后，需要重新生成导航数据：

```bash
python3 generate_nav.py
```

## 发布流程

1. 将Markdown文件添加到 `notes/` 目录下
2. 提交代码到GitHub仓库的 `main` 分支
3. GitHub Actions会自动执行以下操作：
   - 将Markdown文件转换为HTML
   - 生成新的导航数据
   - 提交更新到仓库
4. GitHub Pages会自动部署更新后的网站

## 文章编写规范

- 使用Markdown格式编写文章
- 每个文章文件以 `# 标题` 开头
- 文章会自动按文件系统结构组织
- 支持子目录嵌套

## 自定义样式

修改 `style.css` 文件来自定义网站样式。主题基于深色太空风格，主要包含：

- 固定的顶部导航栏
- 固定的左侧关键词导航
- 响应式布局
- 平滑滚动效果
- 悬停动画

## 自动关键词提取规则

1. 从每篇文章的标题提取最多2个核心关键词
2. 优先提取核心主题词
3. 支持英文缩写识别
4. 支持核心概念组合提取

## 许可证

MIT License

