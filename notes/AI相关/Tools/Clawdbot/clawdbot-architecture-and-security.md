# Clawdbot 架构与安全分析

## 目录
1. [Clawdbot 核心架构](#1-clawdbot-核心架构)
2. [为什么能通过命令行操作本地电脑？](#2-为什么能通过命令行操作本地电脑)
3. [为什么需要 gateway 的存在](#3-为什么需要-gateway-的存在)
4. [调用 LLM 时的本地信息泄漏风险](#4-调用-llm-时的本地信息泄漏风险)

---

## 1. Clawdbot 核心架构

### 1. 整体架构图

```
WhatsApp / Telegram / Slack / Discord / WebChat
               │
               ▼
┌───────────────────────────────┐
│         Gateway              │
│    (控制平面)             │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
     ├─ AI Agent (RPC 模式)
     ├─ CLI 命令行
     ├─ WebChat UI
     ├─ macOS 菜单栏应用
     └─ iOS/Android 节点
```

---

### 2. 为什么能通过命令行操作本地电脑？

#### 核心：本地运行 + 系统调用

**① Gateway 是本地服务**
- 用 Node.js 编写
- 通过 `launchd`/`systemd` 作为系统服务运行
- 监听 WebSocket 端口（默认 `18789`）
- 有完整的本地文件系统访问权限

**② exec 工具的作用**
```bash
# Clawdbot 的 exec 工具可以：
exec 命令                    # 执行任意 shell 命令
node invoke <command>         # 通过节点调用设备功能
system.run <cmd>              # 运行系统命令
```

**③ macOS 特有：AppleScript**
```applescript
# 通过 osascript 操作 macOS 原生应用
osascript -e 'tell application "Calendar" to make new event...'
osascript -e 'tell application "Reminders" to make new reminder...'
osascript -e 'tell application "Finder" to open...'
```

---

### 3. 具体实现机制

#### 在 macOS 上添加提醒的流程

```bash
# 我刚才执行的命令
osascript -e 'tell application "Reminders"
    set newReminder to make new reminder 
        with properties {
            name:"明天中午12点 - 午餐提醒",
            due date:date "Friday, January 30, 2026 12:00:00"
        }
end tell'
```

**这个过程：**
1. Clawdbot 接收到你的消息
2. 决定使用 `exec` 工具
3. 调用 `osascript` 命令
4. `osascript` 通过 macOS 的 Apple Events 系统与 Reminders 应用通信
5. Reminders 创建提醒并通知系统

---

### 4. 不同系统的调用方式

| 操作 | macOS 方法 | Linux 方法 | 说明 |
|------|------------|------------|------|
| 日历 | `osascript -e 'tell application "Calendar"'` | `dbus-send --print-reply` | 通过系统级 API 调用 |
| 提醒 | `osascript -e 'tell application "Reminders"'` | `task add` | 同上 |
| 浏览器 | 通过 CDP 协议控制 Chrome/Chromium | 同左 | 远程控制浏览器 |
| 照片 | `camera_snap` 节点调用 | `v4l2-ctl` | 调用摄像头硬件 |
| 屏幕 | `screen_record` | `ffmpeg -f x11grab` | 屏幕录制 |

---

### 5. 关键技术点

#### ① WebSocket 控制平面
```javascript
// Gateway 和客户端通过 WS 通信
const ws = new WebSocket('ws://127.0.0.1:18789')

// 发送命令到 Gateway
ws.send(JSON.stringify({
  type: 'tool_call',
  tool: 'exec',
  args: ['osascript -e "...']
}))

// 接收执行结果
ws.on('message', (data) => {
  console.log(JSON.parse(data).output)
})
```

#### ② Pi Agent 的 RPC 模式
```javascript
// AI Agent 通过 RPC 协议接收工具调用
gateway.on('tool_call', async ({ tool, args }) => {
  if (tool === 'exec') {
    const result = await spawn('bash', args)
    return { output: result.stdout, exitCode: result.code }
  }
})
```

#### ③ Node 系统的权限控制
```bash
# macOS 有 TCC (透明度与控制) 权限
# 通过 macOS 应用可以声明和请求权限
# Calendar、Reminders、通知、文件系统等
```

---

### 6. 为什么称为"本地优先"？

```
传统云端 AI:
┌──────────────┐
│  云端服务器  │ ◀── 你的请求 → 云端处理 → 返回结果
└──────────────┘

Clawdbot 本地优先:
┌─────────────────┐
│  你的 Mac      │ ◀── 直接执行本地命令 → 无需上传数据
│  (本地运行)   │
└─────────────────┘
```

**优势：**
- ✅ 数据不离开本地设备
- ✅ 响应速度快
- ✅ 离线也能用（本地功能）
- ✅ 完全控制自己的数据

---

### 7. 实际运行示例

```bash
# 启动 Gateway（作为系统服务）
clawdbot gateway --port 18789

# 查看状态
clawdbot status

# 发送消息
clawdbot message send --to +1234567890 --message "你好"

# 在 WebChat 中对话
# 直接访问 ws://127.0.0.1:18789/webchat
```

---

## 2. 为什么能通过命令行操作本地电脑？

**详细解释：**

通过 exec 工具 + AppleScript，Clawdbot 可以：
- 读取本地文件
- 写入本地文件
- 运行任意 shell 命令
- 控制系统应用（日历、提醒、通知等）
- 浏览网页、截图、执行操作

---

## 3. 为什么需要 Gateway 的存在

### 场景 1：每个客户端独立连接

```
客户端 A (WebChat) ─┐
                    ├─ 直接连接 WhatsApp
客户端 B (macOS app) ├─ 直接连接 Telegram  
客户端 C (CLI)     ├─ 直接连接 Slack
客户端 D (iOS node) ─┘   ├─ 直接调用 macOS API
                          └─ 直接运行 shell 命令
```

**问题：**
- ❌ **重复代码**：每个客户端都要实现相同的功能（消息收发、状态管理）
- ❌ **状态不统一**：CLI 发送的消息，macOS app 看不到
- ❌ **工具分散**：每个客户端都要实现自己的浏览器控制、文件操作
- ❌ **安全风险**：多个端点连接同一服务，权限控制困难
- ❌ **资源浪费**：每个客户端都要维护 AI Agent 运行时

---

## Gateway 解决了什么？

### 1. 统一控制平面

```javascript
// Gateway 集中管理一切
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

### 2. 客户端端变成"傻瓜终端"

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
    
    for await of ws.on('message') {
      if (data.type === 'assistant_response') {
        console.log(data.content)
        break
      }
    }
  }
}
```

**优势：**
- ✅ **极简客户端**：只需要 WebSocket + UI
- ✅ **功能一致**：所有端享受相同的功能
- ✅ **自动更新**：Gateway 更新，所有客户端自动受益

---

### 3. 会话统一和共享

```javascript
// Gateway 统一管理会话状态
Gateway 的会话管理器：
┌─────────────────────────────────────┐
│  Session State                   │
│  ┌─────────────────────────┐       │
│  │ agent:main:main      │       │
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

### 4. 安全和权限集中管理

```javascript
// Gateway 集中处理所有安全问题
Gateway 安全层：
┌─────────────────────────────────────┐
│  认证管理器                       │
│  - OAuth token 管理                │
│  - API key 轮询和降级            │
│  - 模型 failover                 │
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

### 5. 工具系统的统一调度

```javascript
// Gateway 作为工具调度中心
工具调用流程：

1. AI Agent 分析需要什么工具
2. Agent 向 Gateway 请求：{ tool: 'exec', args: [...] }
3. Gateway 检查权限和安全
4. Gateway 路由到正确的执行器
5. Gateway 返回结果给 Agent
6. Agent 根据结果继续思考

示例：
┌─────────────────────────────────────┐
│          Gateway                │
│                                 │
│  Agent 请求：                    │
│  "帮我打开浏览器查 GitHub"       │
│        ↓                        │
│  Gateway 路由：                  │
│  ┌─────────────────────────┐     │
│  │ browser.open → CDP    │     │
│  │ snapshot              │     │
│  │ act → navigate        │     │
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

## 总结：Gateway 的核心价值

| 维度 | 无 Gateway | 有 Gateway |
|------|------------|------------|
| **开发复杂度** | 每个端点独立实现 | 集中实现一次 |
| **代码重复** | 大量重复逻辑 | DRY 原则 |
| **会话同步** | 完全独立 | 多端共享 |
| **安全性** | 分散管理 | 统一控制 |
| **维护成本** | 需同时维护 N 个客户端 | 只维护 Gateway |
| **功能一致性** | 很难保证 | 天然保证 |
| **扩展性** | 每个都要改 | 部署 Gateway 即可 |
| **新功能** | 每个端都要适配 | 一次接入 |

---

## 现实例子

**你现在添加提醒的完整流程：**

```
你
 └─ WebChat 发送："添加明天12点提醒"
     ↓
Gateway 收到 WebSocket 消息
     ↓
Pi Agent 分析需求
     ↓
Agent 调用工具：exec(osascript -e 'tell application "Reminders"...')
     ↓
Gateway 执行 osascript 命令
     ↓
Gateway 返回结果给 Agent
     ↓
Agent 回复："✅ 已添加..."
     ↓
Gateway 通过 WebSocket 推送到 WebChat 显示
```

**如果没有 Gateway，这个流程会断裂！**

---

## 总结：Gateway 是 Clawdbot 的"大脑和神经中枢"，让所有"四肢"（客户端）协同工作！

---

## 4. 调用 LLM 时的本地信息泄漏风险

### 1. 数据流向分析

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

### 2. 到底会泄漏什么？

#### ① 对话历史（最大的风险）

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

#### ② 系统提示词

```javascript
// AGENTS.md、SOUL.md、TOOLS.md 等文件内容
const systemPrompt = loadFile('AGENTS.md') + loadFile('SOUL.md')
```

**风险：**
- 所有注入到 Agent 的配置都会发送给 LLM
- 包括你定义的工作空间、偏好设置等

#### ③ 工具执行结果

```javascript
// Agent 调用 exec 读取文件后
const toolResult = exec('cat /Users/jianwang/secret.txt')
// 这个结果会被发送回 LLM 用于上下文
```

**风险：**
- 如果 Agent 读取了敏感文件，内容会出现在 LLM 的上下文中
- 即使文件本身不直接发送，但读取后的"记忆"会持续存在

---

## Clawdbot 的安全措施

尽管有风险，Clawdbot **确实实现了多项安全机制**：

### ✅ ① 配置层面的控制

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

### ✅ ② 模型提供商选择

```bash
# 可以选择不同提供商
anthropic/claude-opus-4.5      # Anthropic 承诺不训练数据
openai/gpt-4                  # OpenAI 的隐私政策
zai/glm-4.7                    # 可能是本地/中国模型
```

---

### ✅ ③ 本地模型选项

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

### ✅ ④ 工具权限控制

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

### ✅ ⑤ 沙箱隔离

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

## 实际风险对比

| 风险类型 | 传统云端 ChatGPT | Clawdbot | 说明 |
|-----------|-----------------|-----------|------|
| 对话历史 | ✅ 全部上传 | ✅ 全部上传 | 风险相同 |
| 工具执行结果 | ❌ 没有 | ⚠️ 会上传 | Clawdbot 特有风险 |
| 本地文件系统 | ❌ 无法访问 | ⚠️ Agent 可读取 | Clawdbot 特有风险 |
| 系统配置 | ❌ 不涉及 | ⚠️ 会注入到 prompt | Clawdbot 特有风险 |
| 数据离开设备 | ✅ 全部 | ⚠️ 部分上传 | Clawdbot 本地操作部分不上传 |

**关键点：**
- **Clawdbot 的"本地优先"主要体现在工具执行（exec、file），不体现在 LLM 调用上**
- LLM 调用本身**仍然是云端的**

---

## 网络传输安全

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

## 如何最大程度降低风险？

### ① 使用本地模型（最佳）

```bash
# 配置本地 Ollama
clawdbot config set models.providers.ollama.baseUrl http://localhost:11434
clawdbot config set models.providers.ollama.apiKey local

# 后所有对话都在本地完成
```

---

### ② 敏感信息不要写在对话中

```javascript
// ❌ 不推荐
"我的密码是 abc123，帮我登录"

// ✅ 推荐（通过本地工具）
```

---

### ③ 定期重置会话

```bash
clawdbot config set agents.defaults.session.reset.mode daily
# 每天清除历史，旧对话不会持续发送
```

---

### ④ 禁用某些工具

```json
{
  "tools": {
    "deny": ["exec", "read"]  // 禁止文件操作
  }
}
```

---

### ⑤ 选择隐私优先的提供商

```bash
# Anthropic 承诺不使用客户数据训练
clawdbot config set agent.model anthropic/claude-opus-4.5
```

---

## 总结

**是的，Clawdbot 确实存在信息泄漏风险，但需要分清：**

1. **LLM 调用层**：与传统 ChatGPT 类似，对话内容会发送到云端 API
2. **工具执行层**：额外的风险点（Agent 可以读取文件、执行命令）

**关键认知：**
- ❌ **"本地优先"≠ "完全离线"**
- ❌ **"本地运行"≠ "数据不离开设备"**
- ✅ **真正的本地安全只有：本地 LLM（Ollama/Llamafile）**

**建议：**
- 如果处理高度敏感信息，**使用本地模型**（Ollama）
- 如果使用云端模型，**避免在对话中讨论敏感话题**
- **定期清理历史记录**（daily reset）
- **理解并接受**这是云端 AI 的固有特性

**Clawdbot 的价值在于给了你选择权：**
- 你可以用云端模型（更快、更强）
- 也可以用本地模型（完全私密）
- 根据场景选择合适的模式

这是权衡，不是完美的解决方案。🔐
