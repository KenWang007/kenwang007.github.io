---
slug: llm-agent-and-tools
title: 🤖 LLM Agent 与工具生态
---

# 🤖 LLM Agent 与工具生态

## 1. 什么是 LLM Agent？

### 1.1 Agent 定义

**LLM Agent**（智能体）是一种能够自主感知环境、做出决策并采取行动的 AI 系统。它以大型语言模型为"大脑"，通过工具调用、记忆管理和自主规划来完成复杂任务。

```
┌─────────────────────────────────────────────────────────┐
│                    LLM Agent 架构                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ┌─────────────┐                      │
│                    │   LLM 大脑   │                      │
│                    │  (推理决策)  │                      │
│                    └──────┬──────┘                      │
│                           │                             │
│         ┌─────────────────┼─────────────────┐          │
│         ▼                 ▼                 ▼          │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐    │
│   │   感知   │      │   规划   │      │   行动   │    │
│   │ Perceive │      │   Plan   │      │   Act    │    │
│   └──────────┘      └──────────┘      └──────────┘    │
│         │                 │                 │          │
│         ▼                 ▼                 ▼          │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐    │
│   │  Memory  │      │  Tools   │      │ Actions  │    │
│   │   记忆   │      │   工具   │      │  执行    │    │
│   └──────────┘      └──────────┘      └──────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Agent vs 普通 LLM 对话

| 维度 | 普通 LLM 对话 | LLM Agent |
|------|--------------|-----------|
| **交互模式** | 单轮问答 | 多轮自主迭代 |
| **能力边界** | 仅限文本生成 | 可调用外部工具 |
| **任务复杂度** | 简单任务 | 复杂多步骤任务 |
| **状态管理** | 无状态/短期记忆 | 长期记忆 + 上下文 |
| **执行方式** | 被动响应 | 主动规划执行 |
| **环境交互** | 无 | 可操作外部系统 |

### 1.3 Agent 的核心组件

```python
# Agent 核心组件概念模型
class LLMAgent:
    def __init__(self):
        self.llm = "大语言模型 - 推理和决策的核心"
        self.memory = {
            "short_term": "对话历史、当前任务上下文",
            "long_term": "持久化知识、用户偏好、历史经验"
        }
        self.tools = "外部工具集 - 扩展能力边界"
        self.planning = "任务分解、执行策略制定"
        
    def run(self, task):
        # 1. 理解任务
        # 2. 制定计划
        # 3. 循环执行：思考 → 行动 → 观察
        # 4. 返回结果
        pass
```

### 1.4 Agent 的典型应用场景

| 场景 | 描述 | 示例 |
|------|------|------|
| **代码开发** | 自动编写、调试、重构代码 | Cursor Agent、GitHub Copilot |
| **数据分析** | 自动查询、分析、可视化数据 | Code Interpreter |
| **自动化办公** | 邮件处理、日程管理、文档生成 | AutoGPT |
| **客户服务** | 多轮对话、工单处理、问题解决 | 智能客服系统 |
| **研究助手** | 文献检索、信息整合、报告生成 | Perplexity AI |

---

## 2. ReAct 框架

### 2.1 什么是 ReAct？

**ReAct**（Reasoning + Acting）是一种将推理和行动交织进行的 Agent 框架。它让模型在执行任务时交替进行"思考"和"行动"，形成 **Thought → Action → Observation** 的循环。

```
┌─────────────────────────────────────────────────────────┐
│                    ReAct 循环                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│     ┌──────────┐                                       │
│     │  Task    │  ← 用户输入的任务                      │
│     └────┬─────┘                                       │
│          │                                             │
│          ▼                                             │
│     ┌──────────┐                                       │
│  ┌─→│ Thought  │  ← 模型思考下一步该做什么              │
│  │  └────┬─────┘                                       │
│  │       │                                             │
│  │       ▼                                             │
│  │  ┌──────────┐                                       │
│  │  │  Action  │  ← 选择并执行一个动作/工具             │
│  │  └────┬─────┘                                       │
│  │       │                                             │
│  │       ▼                                             │
│  │  ┌──────────┐                                       │
│  │  │Observation│ ← 观察动作的执行结果                  │
│  │  └────┬─────┘                                       │
│  │       │                                             │
│  │       ▼                                             │
│  │  ┌──────────┐                                       │
│  └──│ 任务完成? │ ── 否 ──┐                            │
│     └────┬─────┘         │                            │
│          │ 是            │                            │
│          ▼               │                            │
│     ┌──────────┐         │                            │
│     │  Answer  │ ←───────┘                            │
│     └──────────┘                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 ReAct 示例

假设任务是：**"查询北京今天的天气，并根据天气推荐穿搭"**

```
Task: 查询北京今天的天气，并根据天气推荐穿搭

Thought 1: 我需要先查询北京今天的天气情况
Action 1: search_weather(city="北京")
Observation 1: 北京今日天气：晴，气温 -2°C ~ 8°C，北风3-4级

Thought 2: 今天北京比较冷，气温在零下到8度，有风。我需要推荐保暖的穿搭
Action 2: generate_recommendation(weather="晴，-2°C~8°C，北风")
Observation 2: 推荐穿搭：羽绒服+毛衣+保暖内衣，围巾手套帽子三件套

Thought 3: 我已经获得了天气信息和穿搭推荐，可以给出最终答案了
Answer: 北京今天天气晴朗，但气温较低（-2°C ~ 8°C），有北风3-4级。
        建议穿着：羽绒服搭配毛衣和保暖内衣，外出时带上围巾、手套和帽子防风保暖。
```

### 2.3 ReAct 的优势

| 优势 | 说明 |
|------|------|
| **可解释性强** | 每一步思考过程都清晰可见 |
| **灵活适应** | 可根据观察结果动态调整策略 |
| **减少幻觉** | 通过工具获取真实信息，而非纯靠模型生成 |
| **错误可追溯** | 容易定位问题发生在哪个步骤 |

### 2.4 ReAct 代码实现

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI
from langchain.tools import Tool
from langchain import hub

# 1. 定义工具
def search_weather(city: str) -> str:
    """查询城市天气"""
    # 实际应调用天气 API
    return f"{city}今日：晴，5°C ~ 15°C"

def calculate(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))

tools = [
    Tool(name="Weather", func=search_weather, description="查询城市天气"),
    Tool(name="Calculator", func=calculate, description="计算数学表达式"),
]

# 2. 创建 ReAct Agent
llm = ChatOpenAI(model="gpt-4", temperature=0)
prompt = hub.pull("hwchase17/react")  # 官方 ReAct prompt 模板

agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 3. 执行任务
result = agent_executor.invoke({
    "input": "北京今天天气怎么样？如果气温低于10度，计算穿3层衣服每层保暖2度能抵御多少寒冷"
})
print(result["output"])
```

---

## 3. 搭建 Agent 智能体系统

### 3.1 搭建流程概览

```
┌─────────────────────────────────────────────────────────┐
│              Agent 系统搭建流程                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1️⃣ 需求定义          2️⃣ 架构设计          3️⃣ 工具开发  │
│     ↓                    ↓                    ↓        │
│  确定任务边界         选择Agent框架         定义工具接口  │
│  明确输入输出         设计记忆系统          实现工具逻辑  │
│  评估复杂度           规划执行策略          测试工具功能  │
│                                                         │
│  4️⃣ Agent构建         5️⃣ 集成测试          6️⃣ 部署优化  │
│     ↓                    ↓                    ↓        │
│  编写系统Prompt       单元测试              监控日志    │
│  组装工具链           端到端测试            性能调优    │
│  配置记忆模块         异常处理              成本控制    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 方案一：使用 LangChain 构建

```python
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import ConversationBufferMemory

# 1. 定义工具
@tool
def search_database(query: str) -> str:
    """在数据库中搜索信息"""
    # 实现数据库查询逻辑
    return f"搜索结果: {query} 的相关信息..."

@tool  
def send_email(to: str, subject: str, body: str) -> str:
    """发送邮件"""
    # 实现邮件发送逻辑
    return f"邮件已发送给 {to}"

@tool
def create_file(filename: str, content: str) -> str:
    """创建文件"""
    with open(filename, 'w') as f:
        f.write(content)
    return f"文件 {filename} 创建成功"

tools = [search_database, send_email, create_file]

# 2. 创建 Prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", """你是一个智能助手，可以帮助用户完成各种任务。
    你可以使用以下工具：搜索数据库、发送邮件、创建文件。
    请根据用户需求，选择合适的工具完成任务。"""),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# 3. 创建 Agent
llm = ChatOpenAI(model="gpt-4", temperature=0)
agent = create_openai_tools_agent(llm, tools, prompt)

# 4. 添加记忆
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

# 5. 创建执行器
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    memory=memory,
    verbose=True,
    max_iterations=10,  # 防止无限循环
    handle_parsing_errors=True
)

# 6. 运行
result = agent_executor.invoke({"input": "帮我查询销售数据并发邮件给老板汇报"})
```

### 3.3 方案二：使用 OpenAI Function Calling

```python
from openai import OpenAI
import json

client = OpenAI()

# 1. 定义工具 Schema
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "search_web",
            "description": "在网络上搜索信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["query"]
            }
        }
    }
]

# 2. 实现工具函数
def get_weather(city: str, unit: str = "celsius") -> str:
    return f"{city}天气：晴，25°C"

def search_web(query: str) -> str:
    return f"搜索'{query}'的结果：..."

available_functions = {
    "get_weather": get_weather,
    "search_web": search_web
}

# 3. Agent 执行循环
def run_agent(user_message: str):
    messages = [{"role": "user", "content": user_message}]
    
    while True:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        assistant_message = response.choices[0].message
        messages.append(assistant_message)
        
        # 检查是否需要调用工具
        if assistant_message.tool_calls:
            for tool_call in assistant_message.tool_calls:
                func_name = tool_call.function.name
                func_args = json.loads(tool_call.function.arguments)
                
                # 执行工具
                func = available_functions[func_name]
                result = func(**func_args)
                
                # 将结果加入消息
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result
                })
        else:
            # 没有工具调用，返回最终结果
            return assistant_message.content

# 4. 运行
print(run_agent("北京天气怎么样？"))
```

### 3.4 方案三：多 Agent 协作系统

```python
# 使用 LangGraph 构建多Agent系统
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    next_agent: str

# 定义专业Agent
def researcher_agent(state: AgentState) -> AgentState:
    """研究员Agent - 负责信息搜集"""
    # 实现研究逻辑
    return {"messages": ["研究结果..."], "next_agent": "writer"}

def writer_agent(state: AgentState) -> AgentState:
    """写作Agent - 负责内容生成"""
    # 实现写作逻辑
    return {"messages": ["生成的内容..."], "next_agent": "reviewer"}

def reviewer_agent(state: AgentState) -> AgentState:
    """审核Agent - 负责质量把控"""
    # 实现审核逻辑
    return {"messages": ["审核意见..."], "next_agent": "end"}

# 构建工作流图
workflow = StateGraph(AgentState)
workflow.add_node("researcher", researcher_agent)
workflow.add_node("writer", writer_agent)
workflow.add_node("reviewer", reviewer_agent)

workflow.set_entry_point("researcher")
workflow.add_edge("researcher", "writer")
workflow.add_edge("writer", "reviewer")
workflow.add_edge("reviewer", END)

# 编译并运行
app = workflow.compile()
result = app.invoke({"messages": ["请写一篇关于AI的文章"], "next_agent": "researcher"})
```

---

## 4. LLM / Agent 常用工具

### 4.1 工具分类概览

```
┌─────────────────────────────────────────────────────────┐
│                  Agent 工具生态                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📊 数据与检索          🌐 网络与API         💻 代码执行  │
│  ├─ 向量数据库          ├─ 网页搜索          ├─ Python   │
│  ├─ SQL 数据库          ├─ API 调用          ├─ Shell    │
│  ├─ 文档检索            ├─ 网页抓取          └─ 沙箱环境  │
│  └─ 知识图谱            └─ 邮件发送                      │
│                                                         │
│  📁 文件操作            🎨 多媒体            🔧 专业工具  │
│  ├─ 文件读写            ├─ 图像生成          ├─ 计算器   │
│  ├─ 目录管理            ├─ 语音合成          ├─ 日历     │
│  └─ 压缩解压            └─ 视频处理          └─ 翻译     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 常用工具详解

#### 4.2.1 搜索与检索工具

| 工具 | 用途 | 框架支持 |
|------|------|----------|
| **Tavily Search** | AI 优化的网页搜索 | LangChain, LlamaIndex |
| **SerpAPI** | Google 搜索结果 | LangChain |
| **DuckDuckGo** | 隐私搜索 | LangChain |
| **Wikipedia** | 百科知识检索 | LangChain |
| **Arxiv** | 学术论文搜索 | LangChain |
| **Retriever** | 向量库检索 | LangChain, LlamaIndex |

```python
# Tavily 搜索示例
from langchain_community.tools.tavily_search import TavilySearchResults

search = TavilySearchResults(max_results=5)
results = search.invoke("LLM Agent 最新进展")
```

#### 4.2.2 代码执行工具

| 工具 | 用途 | 特点 |
|------|------|------|
| **Python REPL** | 执行 Python 代码 | 简单直接 |
| **Shell** | 执行系统命令 | 功能强大，需注意安全 |
| **E2B Sandbox** | 云端安全沙箱 | 隔离执行，安全性高 |
| **Code Interpreter** | OpenAI 官方 | 集成 GPT，自带沙箱 |

```python
# Python REPL 工具
from langchain_experimental.tools import PythonREPLTool

python_tool = PythonREPLTool()
result = python_tool.invoke("print(2 + 2)")
```

#### 4.2.3 文件与文档工具

| 工具 | 用途 | 支持格式 |
|------|------|----------|
| **FileManagement** | 文件读写操作 | 所有文本文件 |
| **PDFLoader** | PDF 文档解析 | PDF |
| **DocxLoader** | Word 文档解析 | DOCX |
| **CSVLoader** | CSV 数据读取 | CSV |
| **UnstructuredLoader** | 通用文档解析 | 多种格式 |

```python
# 文件工具示例
from langchain.tools import ReadFileTool, WriteFileTool

read_tool = ReadFileTool()
write_tool = WriteFileTool()
```

#### 4.2.4 数据库工具

| 工具 | 用途 | 支持数据库 |
|------|------|------------|
| **SQLDatabaseToolkit** | SQL 查询 | MySQL, PostgreSQL, SQLite |
| **Chroma** | 向量检索 | Chroma DB |
| **Pinecone** | 向量检索 | Pinecone |
| **Neo4j** | 图数据库查询 | Neo4j |

```python
# SQL 工具示例
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import SQLDatabaseToolkit

db = SQLDatabase.from_uri("sqlite:///data.db")
toolkit = SQLDatabaseToolkit(db=db, llm=llm)
tools = toolkit.get_tools()
```

#### 4.2.5 API 与网络工具

| 工具 | 用途 | 示例 |
|------|------|------|
| **RequestsWrapper** | HTTP 请求 | 调用任意 API |
| **OpenWeatherMap** | 天气查询 | 获取天气信息 |
| **Gmail** | 邮件操作 | 发送/读取邮件 |
| **Slack** | 消息发送 | 团队通知 |
| **GitHub** | 代码仓库操作 | PR、Issue 管理 |

```python
# HTTP 请求工具
from langchain_community.utilities import RequestsWrapper

requests = RequestsWrapper()
response = requests.get("https://api.example.com/data")
```

### 4.3 自定义工具开发

```python
from langchain.tools import BaseTool, tool
from pydantic import BaseModel, Field
from typing import Type

# 方式一：使用装饰器（简单）
@tool
def multiply(a: int, b: int) -> int:
    """将两个数字相乘"""
    return a * b

# 方式二：继承 BaseTool（复杂场景）
class CalculatorInput(BaseModel):
    expression: str = Field(description="数学表达式")

class CalculatorTool(BaseTool):
    name: str = "calculator"
    description: str = "用于计算数学表达式"
    args_schema: Type[BaseModel] = CalculatorInput
    
    def _run(self, expression: str) -> str:
        try:
            result = eval(expression)
            return f"计算结果: {result}"
        except Exception as e:
            return f"计算错误: {str(e)}"
    
    async def _arun(self, expression: str) -> str:
        return self._run(expression)
```

### 4.4 主流 Agent 平台与框架

| 平台/框架 | 特点 | 适用场景 |
|-----------|------|----------|
| **LangChain** | 功能全面，工具丰富 | 通用 Agent 开发 |
| **LangGraph** | 支持复杂工作流 | 多 Agent 协作 |
| **AutoGPT** | 自主任务执行 | 自动化任务 |
| **CrewAI** | 多角色协作 | 团队模拟 |
| **MetaGPT** | 软件开发流程 | 自动编程 |
| **Dify** | 低代码平台 | 快速原型 |
| **Coze** | 字节跳动出品 | Bot 快速搭建 |
| **OpenAI Assistants** | 官方 API | 简单集成 |

### 4.5 工具选择最佳实践

```
工具选择决策树：

需要什么能力？
├── 信息获取
│   ├── 实时信息 → Tavily/SerpAPI 搜索
│   ├── 内部知识 → RAG + 向量检索
│   └── 结构化数据 → SQL 工具
├── 代码执行
│   ├── 简单计算 → Python REPL
│   ├── 安全隔离 → E2B/Docker 沙箱
│   └── 系统操作 → Shell（谨慎使用）
├── 文件操作
│   ├── 文本文件 → FileManagement
│   └── 复杂格式 → Unstructured
└── 外部交互
    ├── 通用 API → RequestsWrapper
    └── 特定服务 → 专用工具（Gmail, Slack等）
```

---

## 5. 总结

### 5.1 核心要点回顾

| 主题 | 关键点 |
|------|--------|
| **LLM Agent** | 以 LLM 为大脑，具备感知、规划、行动能力的智能系统 |
| **ReAct 框架** | Thought → Action → Observation 循环，推理与行动交织 |
| **系统搭建** | 工具定义 → Prompt 设计 → Agent 组装 → 执行器配置 |
| **工具生态** | 搜索、代码、文件、数据库、API 等多类工具支持 |

### 5.2 学习路径建议

```
入门 → 进阶 → 精通

1️⃣ 入门阶段
   • 理解 Agent 基本概念
   • 使用 LangChain 搭建简单 Agent
   • 熟悉 ReAct 框架

2️⃣ 进阶阶段
   • 自定义工具开发
   • 多 Agent 协作
   • 记忆系统设计

3️⃣ 精通阶段
   • 复杂工作流编排
   • 性能优化与成本控制
   • 安全与可靠性保障
```

### 5.3 参考资源

- [LangChain Agent 文档](https://python.langchain.com/docs/modules/agents/)
- [ReAct 论文](https://arxiv.org/abs/2210.03629)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [LangGraph 教程](https://langchain-ai.github.io/langgraph/)
- [AutoGPT 项目](https://github.com/Significant-Gravitas/AutoGPT)
