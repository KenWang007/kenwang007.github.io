# 什么是 Open WebUI

**Open WebUI** 是一个可扩展、功能丰富且用户友好的**自托管 AI 平台**，专为完全离线运行而设计。它基于通用标准构建，支持 **Ollama** 和 **OpenAI 兼容协议**（特别是 Chat Completions API）。这种协议优先的方法使其成为一个强大的、与供应商无关的 AI 部署解决方案，适用于本地和云端模型。

## 主要特性

- 🔒 **完全离线运行** - 所有数据都保存在本地，保护隐私安全
- 🔌 **多协议支持** - 同时支持 Ollama 和 OpenAI 兼容协议
- 🎨 **用户友好界面** - 现代化的 Web UI，操作简单直观
- 🔧 **高度可扩展** - 支持自定义主题、品牌定制等功能
- 🖥️ **跨平台兼容** - 支持 macOS、Linux（x86_64 和 ARM64）、Windows

---

# 如何在本地运行 Open WebUI

## 方式一：使用 Docker 🐳（推荐）

> ⚠️ **注意**：Open WebUI 需要 WebSocket 支持才能正常工作，请确保您的网络配置允许 WebSocket 连接。

### 如果 Ollama 已在本机运行

```bash
docker run -d -p 3000:8080 --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:main
```

### 使用 Nvidia GPU 支持

```bash
docker run -d -p 3000:8080 --gpus all --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:cuda
```

### Open WebUI 与 Ollama 捆绑安装

这种方式将 Open WebUI 和 Ollama 打包在一个容器中，一条命令即可完成安装：

**带 GPU 支持：**
```bash
docker run -d -p 3000:8080 --gpus=all -v ollama:/root/.ollama -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:ollama
```

**仅 CPU：**
```bash
docker run -d -p 3000:8080 -v ollama:/root/.ollama -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:ollama
```

安装完成后，访问 **http://localhost:3000** 即可使用！

---

## 方式二：使用 uv 安装（推荐的手动安装方式）

### 1. 安装 uv

**macOS/Linux：**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows：**
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. 运行 Open WebUI

**macOS/Linux：**
```bash
DATA_DIR=~/.open-webui uvx --python 3.11 open-webui@latest serve
```

**Windows：**
```powershell
$env:DATA_DIR="C:\open-webui\data"; uvx --python 3.11 open-webui@latest serve
```

---

## 方式三：使用 pip 安装

```bash
# 安装
pip install open-webui

# 启动
open-webui serve
```

> 💡 **提示**：推荐使用 Python 3.11 版本

安装完成后，访问 **http://localhost:8080** 即可使用。

---

## 更新 Open WebUI

### Docker 手动更新

使用 Watchtower 更新容器：
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock nickfedor/watchtower --run-once open-webui
```

### pip 更新

```bash
pip install --upgrade open-webui
```

---

## 参考资料

- [Open WebUI 官方文档](https://docs.openwebui.com/)
- [Open WebUI GitHub](https://github.com/open-webui/open-webui)