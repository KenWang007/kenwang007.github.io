# Clawdbot 实现原理与架构说明

## 📋 目录

1. [Clawdbot 核心架构](#1-clawdbot-核心架构)
2. [为什么能通过命令行操作本地电脑](#2-为什么能通过命令行操作本地电脑)
3. [为什么需要 Gateway 的存在](#3-为什么需要-gateway-的存在)
4. [调用 LLM 时的隐私风险](#4-调用-llm-时的隐私风险)

---

## 1. Clawdbot 核心架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                                                      │
│   多种客户端                                         │
│   WebChat / CLI / macOS app / iOS / Android / Slack / Discord  │
│                                                      │
│              ▼                                       │
│   ┌─────────────────────────────────────┐              │
│   │         Gateway (本地服务)       │              │
│   │    ws://127.0.0.1:18789          │              │
│   │                                  │              │
│   │  ┌──────────────────────────────┐   │              │
│   │ │  AI Agent (Pi Agent)     │   │              │
│   │ │  - 接收用户指令            │   │              │
│   │ │  - 调用 LLM API              │   │              │
│   │ │  - 路由到工具调用            │   │              │
│   │ └───────────────────────────────┘   │              │
│   │                                  │              │
│   │  ┌──────────────────────────────┐   │              │
│   │ │  工具调度器               │   │              │
│   │ │  - exec (shell 命令)       │   │              │
│   │ │  - browser (浏览器控制)      │   │              │
│   │ │  - nodes (设备节点)         │   │              │
│   │ │  - canvas (画布)           │   │              │
│   │ └───────────────────────────────┘   │              │
│   │                                  │              │
│   │  ┌──────────────────────────────┐   │              │
│   │ │  系统桥接层               │   │              │
│   │ │  - macOS: AppleScript       │   │              │
│   │ │  - Linux: D-Bus             │   │              │
│   │ │  - iOS/Android: 本地 API      │   │              │
│   │ └───────────────────────────────┘   │              │
│   └─────────────────────────────────────┘   │              │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

### 1.2 Gateway 的核心组件

```javascript
// Gateway (Node.js) 是一个本地运行的守护进程
const Gateway = {
  // 1. WebSocket 服务器
  server: {
    port: 18789,
    protocol: 'ws://'
  },

  // 2. 通道管理器
  channels: {
    whatsapp: WhatsAppBot,
    telegram: TelegramBot,
    discord: DiscordBot,
    slack: SlackBot,
    imessage: BlueBubblesPlugin,
    // ...更多通道
  },

  // 3. 会话管理器
  sessions: {
    store: SQLite / Memory,
    mainSession: 'agent:main:main',
    reset: {
      mode: 'daily'  // 每天重置历史
    }
  },

  // 4. 工具路由器
  tools: {
    exec: ExecTool,      // shell 命令执行
    browser: BrowserTool, // 浏览器控制
    nodes: NodesTool,     // 设备节点调用
    canvas: CanvasTool,   // 画布交互
    cron: CronTool        // 定时任务
  },

  // 5. AI Agent (Pi Agent)
  agent: {
    model: 'anthropic/claude-opus-4-5',
    contextWindow: 100000,
    tools: streaming
  },

  // 6. 配置管理
  config: {
    auth: {},        // 认证配置
    security: {},    // 安全策略
    agents: {}       // Agent 配置
  }
}
```

---

## 2. 为什么能通过命令行操作本地电脑？

### 2.1 核心原理：本地运行 + 系统调用

#### 2.1.1 Gateway 作为本地服务

**启动方式：**
```bash
# 方式 1: 作为系统服务（macOS）
clawdbot gateway --port 18789
# ↑ 通过 launchd 自动启动，开机自启

# 方式 2: 手动启动
clawdbot gateway --port 18789 --verbose
```

**权限：**
- ✅ 完整的文件系统访问（读写任意文件）
- ✅ shell 命令执行权限（exec 工具）
- ✅ 通过 AppleScript/D-Bus 调用系统应用
- ✅ 持久化配置存储（~/.clawdbot/）

---

#### 2.1.2 exec 工具的实现

```bash
# exec 工具提供了什么能力

# 1. 执行任意 shell 命令
clawdbot agent --message "列出当前目录的文件"
# ↓ 转换为 → exec(['ls', '-la'])

# 2. 通过 AppleScript 操作 macOS 应用
clawdbot agent --message "添加日历事件"
# ↓ 转换为 → exec(['osascript', '-e', 'tell application "Calendar" to make new event...'])

# 3. 通过节点调用设备功能
clawdbot agent --message "用前置摄像头拍照"
# ↓ 转换为 → node.invoke('camera_snap')
```

---

#### 2.1.3 macOS 系统调用示例

**AppleScript 与系统应用的通信：**

```applescript
# 日历应用
tell application "Calendar"
  make new event at end of events with properties {summary:"会议", start date:theDate}
end tell

# 提醒应用
tell application "Reminders"
  make new reminder with properties {name:"午餐提醒", due date:theDate}
end tell

# 文件管理器
tell application "Finder"
  open folder "~/Documents"
end tell

# 通知系统
tell application "System Events"
  display notification "任务完成"
end tell
```

**完整流程示例（添加提醒）：**

```bash
# 步骤 1: 用户在 WebChat 中发送消息
用户: "添加明天中午12点的提醒"

# 步骤 2: WebChat 通过 WebSocket 发送到 Gateway
ws.send(JSON.stringify({
  type: 'user_message',
  content: '添加明天中午12点的提醒'
}))

# 步骤 3: Gateway 接收并转发给 AI Agent
gateway.on('user_message', async (data) => {
  await agent.process(data)
})

# 步骤 4: AI Agent 分析需求，决定调用工具
agent: {
  tools: {
    exec: {
      command: ['osascript', '-e', 
        `tell application "Reminders" 
         make new reminder 
         with properties {
           name:"明天中午12点 - 午餐提醒", 
           due date:date "2026-01-30 12:00:00"
         }`]
    }
  }
}

# 步骤 5: Gateway 执行工具命令
const result = await exec(command)

# 步骤 6: 返回结果给 AI Agent
agent.receive(result)

# 步骤 7: Agent 生成回复
const response = "✅ 已添加提醒到系统 Reminders"

# 步骤 8: Gateway 通过 WebSocket 推送给所有客户端
ws.send(JSON.stringify({
  type: 'assistant_response',
  content: response
}))

# 步骤 9: WebChat 显示回复
```

---

#### 2.1.4 不同操作系统的调用方式

| 操作 | macOS 方法 | Linux 方法 | 说明 |
|------|------------|------------|------|
| 日历 | `osascript -e 'tell application "Calendar"'` | `dbus-send --print-reply` | 通过系统级 API 调用 |
| 提醒 | `osascript -e 'tell application "Reminders"'` | `task add` | 同上 |
| 文件 | `osascript -e 'tell application "Finder"'` | `gio open` | 通过文件管理器操作 |
| 浏览器 | 通过 CDP 协议控制 Chrome/Chromium | 同左 | 远程控制浏览器 |
| 照片 | `camera_snap` 节点调用 | `v4l2-ctl` | 调用摄像头硬件 |
| 录屏 | `screen_record` | `ffmpeg -f x11grab` | 屏幕录制 |
| 通知 | `system_notify` | `notify-send` | 系统通知 |

---

### 2.2 为什么称为"本地优先"？

```
传统云端 AI:
┌──────────────┐
│  云端服务器  │ ◀── 你的请求 → 云端处理 → 返回结果
└──────────────┘

Clawdbot 本地优先:
┌──────────────┐
│  你的 Mac    │ ◀── 直接执行本地命令 → 无需上传数据
│  (本地运行)  │
└──────────────┘
```

**本地优先的优势：**
- ✅ 数据不离开本地设备（执行结果在本地处理）
- ✅ 响应速度快（本地网络调用，不经过互联网）
- ✅ 离线也能用（本地功能如文件操作、系统调用）
- ✅ 完全控制自己的数据和配置

**重要说明：**
- ⚠️ "本地优先" 主要体现在工具执行层（exec、file 操作）
- ⚠️ LLM 调用本身仍然是云端的（除非配置本地模型）

---

### 2.3 实际运行示例

```bash
# 启动 Gateway（作为系统服务）
clawdbot gateway --port 18789

# 查看状态
clawdbot status

# 发送消息
clawdbot message send --to +1234567890 --message "你好"

# 在 WebChat 中对话
# 直接访问 ws://127.0.0.1:18789/webchat

# 重启 Gateway
clawdbot gateway restart
```

---

## 3. 为什么需要 Gateway 的存在？

### 3.1 没有 Gateway 的问题

#### 场景：每个客户端独立连接

```
客户端 A (WebChat) ─┐
                    ├─ 直接连接 WhatsApp
客户端 B (macOS app) ├─ 直接连接 Telegram  
客户端 C (CLI)     ├─ 直接连接 Slack
客户端 D (iOS node) ─┘   ├─ 直接调用 macOS API
                          └─ 直接运行 shell 命令
```

**存在的问题：**

- ❌ **代码重复**：每个客户端都要实现相同的功能（消息收发、状态管理）
- ❌ **状态不统一**：CLI 发送的消息，macOS app 看不到
- ❌ **工具分散**：每个客户端都要实现自己的浏览器控制、文件操作
- ❌ **安全风险**：多个端点连接同一服务，权限控制困难
- ❌ **资源浪费**：每个客户端都要维护 AI Agent 运行时
- ❌ **功能不一致**：不同客户端的功能可能有差异

---

### 3.2 Gateway 解决的核心问题

#### 3.2.1 统一控制平面

```
┌─────────────────────────────────────┐
│          Gateway                │
│    ws://127.0.0.1:18789          │
│                                 │
│  ┌────────────────────────┐        │
│  │  通道管理器         │        │
│  │ - 连接/断开         │        │
│  │ - 重连逻辑         │        │
│  │ - 消息队列         │        │
│  └────────────────────────┘        │
│                                 │
│  ┌────────────────────────┐        │
│  │  会话管理器         │        │
│  │ - 上下文保持         │        │
│  │ - 历史记录         │        │
│  │ - 多端同步         │        │
│  └────────────────────────┘        │
│                                 │
│  ┌────────────────────────┐        │
│  │  工具路由器         │        │
│  │ - exec、browser      │        │
│  │ - canvas、nodes      │        │
│  └────────────────────────┘        │
│                                 │
│  ┌────────────────────────┐        │
│  │  AI Agent (Pi)       │        │
│  │ - 模型调用           │        │
│  │ - 工具流式传输       │        │
│  └────────────────────────┘        │
└─────────────────────────────────────┘
```

---

#### 3.2.2 客户端简化为"傻瓜终端"

```javascript
// 所有客户端只需要做一件事：连接 Gateway
class WebChat {
  constructor() {
    this.ws = new WebSocket('ws://127.0.0.1:18789/webchat')
  }  
  
  send(message) {
    this.ws.send(JSON.stringify({ type: 'user_message', content: message }))
  }  
  
  onMessage(data) {
    display(data.assistant_response)  // 直接显示
  }
}

class CLI {
  async main(message) {
    const ws = await connect('ws://127.0.0.1:18789')
    ws.send({ type: 'user_message', content: message })
    
    for await (const data of ws.on('message')) {
      if (data.type === 'assistant_response') {
        console.log(data.content)
        break
      }
    }
  }
}
```

**客户端的优势：**
- ✅ **极简客户端**：只需要 WebSocket + UI
- ✅ **功能一致**：所有端享受相同的功能
- ✅ **自动更新**：Gateway 更新，所有客户端自动受益

---

#### 3.2.3 会话统一和共享

```javascript
// Gateway 统一管理会话状态
Gateway 的会话管理器：
┌─────────────────────────────────────┐
│  Session State                   │
│  ┌─────────────────────────┐       │
│  │  agent:main:main      │       │
│  │ - 上下文: [过去消息]  │       │
│  │ - 用户偏好           │       │
│  │ - 工具权限           │       │
│  └─────────────────────────┘       │
│                                 │
│  多个客户端可以接入同一会话：       │
│  • WebChat                    │
│  • macOS menu bar             │
│  • CLI (继续对话)             │
└─────────────────────────────────────┘
```

**没有 Gateway：**
- ❌ WebChat 的对话和 macOS app 完全独立
- ❌ CLI 无法继续之前的对话

**有 Gateway：**
- ✅ 切换设备无缝继续同一对话
- ✅ 统一的上下文和记忆

---

#### 3.2.4 安全和权限集中管理

```javascript
// Gateway 中处理所有安全问题
Gateway 安全层：
┌─────────────────────────────────────┐
│  认证管理器                       │
│  - OAuth token 管理                │
│  - API key 轮询和降级            │
│  - 模型故障转移                 │
│                                  │
│  权限控制器                       │
│  - channel.allowFrom (白名单)        │
│  - dmPolicy (私信策略)            │
│  - sandbox.mode (沙箱隔离)         │
│                                  │
│  审计日志                          │
│  - 所有工具调用记录                │
│  - 敏感操作追踪                 │
└─────────────────────────────────────┘
```

**没有 Gateway：**
- ❌ 每个客户端都要实现自己的安全逻辑
- ❌ 权限策略分散，难以统一管理
- ❌ 容易出现安全漏洞（某个客户端漏了）

---

#### 3.2.5 工具系统的统一调度

```javascript
// Gateway 作为工具调度中心
工具调用流程：

1. AI Agent 分析需要什么工具
2. Agent 向 Gateway 请求：{ tool: 'exec', args: [...] }
3. Gateway 检查权限和安全
4. Gateway 路由到正确的执行器
5. Gateway 返回结果给 Agent
6. Agent 根据结果继续思考

示例流程：
┌─────────────────────────────────────┐
│          Gateway                │
│                                 │
│  Agent 请求：                    │
│  "帮我打开浏览器查 GitHub"       │
│        ↓                        │
│  Gateway 路由：                  │
│  ┌─────────────────────────┐     │
│  │  browser.open → CDP    │     │
│  │  snapshot              │     │
│  │  act → navigate        │     │
│  └─────────────────────────┘     │
│        ↓                        │
│  返回给 Agent：                    │
│  "已打开 GitHub，页面内容如下..." │
└─────────────────────────────────────┘
```

**没有 Gateway：**
- ❌ 每个客户端都要实现完整的浏览器控制
- ❌ 重复造轮子

---

### 3.3 总结：Gateway 的核心价值

| 维度 | 无 Gateway | 有 Gateway |
|------|------------|------------|
| **开发复杂度** | 每个端点独立实现 | 集中实现一次 |
| **代码重复** | 大量重复逻辑 | DRY 原则 |
| **会话同步** | 完全独立 | 多端共享 |
| **安全性** | 分散管理 | 统一控制 |
| **维护成本** | 需同时维护 N 个客户端 | 只维护 Gateway |
| **功能一致性** | 很难保证 | 天然保证 |
| **扩展性** | 每个端都要改 | 部署 Gateway 即可 |
| **新功能** | 每个端都要适配 | 一次接入 |

---

## 4. 调用 LLM 时的隐私风险

### 4.1 数据流向分析

```
本地设备                          云端 LLM API
     │                                    │
     ├─ 用户消息 ───────────────────────┤
     ├─ 对话历史 ───────────────────────┤
     ├─ 系统提示词 ───────────────────────┤
     └─ 工具执行结果 ───────────────────┤
```

**这些内容都会通过 HTTPS 发送到 OpenAI/Anthropic 等云端 API。**

---

### 4.2 到底会泄漏什么？

#### 4.2.1 对话历史（最大的风险）

```javascript
// Gateway 会话管理器发送给 LLM 的内容
{
  "messages": [
    { "role": "user", "content": "帮我修改 /etc/hosts" },
    { "role": "assistant", "content": "好的，已执行..." },
    { "role": "user", "content": "还有昨天我们讨论的机密计划" }
  ]
}
```

**风险：**
- 所有对话历史都会发送到云端
- 包括之前讨论的敏感信息
- 即使你"忘记"了，云端 API 记录可能还在

---

#### 4.2.2 系统提示词

```javascript
// AGENTS.md、SOUL.md、TOOLS.md 等文件内容
const systemPrompt = loadFile('AGENTS.md') + loadFile('SOUL.md')
```

**风险：**
- 所有注入到 Agent 的配置都会发送给 LLM
- 包括你定义的工作空间、偏好设置等

---

#### 4.2.3 工具执行结果

```javascript
// Agent 调用 exec 读取文件后
const toolResult = exec('cat /Users/jianwang/secret.txt')
// 这个结果会被发送回 LLM 用于上下文
```

**风险：**
- 如果 Agent 读取了敏感文件，内容会出现在 LLM 的上下文中
- 即使文件本身不直接发送，但读取后的"记忆"会持续存在

---

### 4.3 Clawdbot 的安全措施

尽管有风险，Clawdbot **确实实现了多项安全机制**：

#### 4.3.1 配置层面的控制

```json
{
  "agents": {
    "defaults": {
      "contextTokens": 100000,  // 限制上下文大小
      "session": {
        "reset": {
          "mode": "daily"  // 每天重置会话，旧历史不会累积
        }
      },
      "memorySearch": {
        "enabled": true  // 本地记忆搜索，不用每次重传
      }
    }
  }
}
```

---

#### 4.3.2 模型提供商选择

```bash
# 可以选择不同提供商
anthropic/claude-opus-4-5      # Anthropic 承诺不训练数据
openai/gpt-4                  # OpenAI 的隐私政策
zai/glm-4.7                    # 可能是本地/中国模型
```

---

#### 4.3.3 本地模型选项

```json
{
  "models": {
    "providers": {
      "ollama": {  // 本地 LLM，数据不离开设备
        "baseUrl": "http://localhost:11434",
        "apiKey": "local"
      }
    }
  }
}
```

---

#### 4.3.4 工具权限控制

```json
{
  "tools": {
    "exec": {
      "ask": "on-miss"  // 敏感命令需要确认
      "safeBins": ["ls", "date"]  // 安全命令白名单
    }
  }
}
```

---

#### 4.3.5 沙箱隔离

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"  // 非 main 会话在 Docker 沙箱中运行
      }
    }
  }
}
```

---

### 4.4 实际风险对比

| 风险类型 | 传统云端 ChatGPT | Clawdbot | 说明 |
|-----------|-----------------|-----------|------|
| 对话历史 | ✅ 全部上传 | ✅ 全部上传 | 风险相同 |
| 工具执行结果 | ❌ 没有 | ⚠️ 会上传 | Clawdbot 特有风险 |
| 本地文件系统 | ❌ 无法访问 | ⚠️ Agent 可读取 | Clawdbot 特有风险 |
| 系统配置 | ❌ 不涉及 | ⚠️ 会注入到 prompt | Clawdbot 特有风险 |
| 数据离开设备 | ✅ 全部 | ⚠️ 部分上传 | Clawdbot 本地操作部分不上传 |

**关键点：**
- **Clawdbot 的"本地优先"主要体现在工具执行（exec、file），不体现在 LLM 调用上**
- **LLM 调用本身仍然是云端的**（除非使用本地模型如 Ollama）

---

### 4.5 网络传输安全

```plaintext
你的设备                     ISP                   LLM API 服务器
     │                              │                    │
     │ ┌────────────────┐        │                    │
     │ │ HTTPS 加密    │        │                    │
     │ └────────────────┘        │                    │
     │                              │                    │
     ▼                              ▼                    │
    TLS 1.3 加密传输                │
```

**安全的部分：**
- ✅ 传输使用 TLS 1.3 加密
- ✅ 中间人无法看到内容
- ✅ 大多数 reputable API 提供商有严格的隐私政策

**可能暴露的：**
- ⚠️ **元数据**：IP 地址、请求时间、API 端点
- ⚠️ **使用模式**：请求频率、大致使用量
- ⚠️ **模型提供商**：知道你在使用哪个服务

---

### 4.6 如何最大程度降低风险？

#### 4.6.1 使用本地模型（最佳）

```bash
# 配置本地 Ollama
clawdbot config set models.providers.ollama.baseUrl http://localhost:11434
clawdbot config set models.providers.ollama.apiKey local

# 之后所有对话都在本地完成
```

---

#### 4.6.2 敏感信息不要写在对话中

```javascript
// ❌ 不推荐
"我的密码是 abc123，帮我登录"

// ✅ 推荐（通过本地工具）
"请在本地输入密码"
```

---

#### 4.6.3 定期重置会话

```bash
clawdbot config set agents.defaults.session.reset.mode daily
# 每天清除历史，旧对话不会持续发送
```

---

#### 4.6.4 禁用某些工具

```json
{
  "tools": {
    "deny": ["exec", "read"]  // 禁止文件操作
  }
}
```

---

#### 4.6.5 选择隐私优先的提供商

```bash
# Anthropic 承诺不使用客户数据训练
clawdbot config set agent.model anthropic/claude-opus-4-5
```

---

## 总结

### 5.1 关键认知

- ❌ **"本地优先"≠ "完全离线"**
- ❌ **"本地运行"≠ "数据不离开设备"**
- ✅ **真正的本地安全只有：本地 LLM（Ollama/Llamafile）**

### 5.2 Clawdbot 的价值

**Clawdbot 的价值在于给了你选择权：**
- ✅ 你可以用云端模型（更快、更强）
- ✅ 也可以用本地模型（完全私密）
- ✅ 根据场景选择合适的模式

**这是权衡，不是完美的解决方案。🔐**

---

## 附录：快速参考

### 常用命令

```bash
# Gateway 管理
clawdbot gateway start     # 启动 Gateway
clawdbot gateway stop      # 停止 Gateway
clawdbot gateway restart   # 重启 Gateway
clawdbot status           # 查看状态

# 发送消息
clawdbot message send --to <目标> --message "内容"

# 配置
clawdbot config get <路径>     # 获取配置
clawdbot config set <路径> <值> # 设置配置
clawdbot config list           # 列出配置

# 调试
clawdbot doctor              # 诊断问题
```

### 配置文件路径

```bash
# 主配置文件
~/.clawdbot/clawdbot.json

# 工作区（默认）
~/clawd/

# 工作区 AGENTS.md
~/clawd/AGENTS.md

# 工作区 SOUL.md
~/clawd/SOUL.md

# 会话存储
~/.clawdbot/sessions/
```

### 安全建议

1. ✅ 使用本地模型处理敏感信息
2. ✅ 定期清理会话历史（daily reset）
3. ✅ 不要在对话中讨论敏感话题（如使用云端模型）
4. ✅ 禁用不需要的文件操作工具
5. ✅ 选择隐私优先的 LLM 提供商
6. ✅ 了解并接受这是云端 AI 的固有特性

---

**文档版本：** v1.0  
**最后更新：** 2026-01-29  
**作者：** Clawdbot 社区贡献
