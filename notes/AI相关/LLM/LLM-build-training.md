---
slug: llm-build-training
title: 🏗️ 大模型架构、训练与部署
---

# 🏗️ 大模型架构、训练与部署

## 1. 大模型架构与训练

### 1.1 Transformer 架构详解

Transformer 是现代大语言模型的基础架构，由 Google 在 2017 年的论文《Attention Is All You Need》中提出。

```
┌─────────────────────────────────────────────────────────┐
│                  Transformer 架构                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐      ┌─────────────────┐          │
│  │    Encoder      │      │    Decoder      │          │
│  │  (理解输入)      │  →   │  (生成输出)      │          │
│  └─────────────────┘      └─────────────────┘          │
│                                                         │
│  每个 Block 包含：                                       │
│  ┌─────────────────────────────────────┐               │
│  │  Multi-Head Self-Attention          │ ← 捕捉依赖关系 │
│  │           ↓                         │               │
│  │  Add & Norm (残差连接 + 层归一化)     │               │
│  │           ↓                         │               │
│  │  Feed Forward Network               │ ← 特征变换    │
│  │           ↓                         │               │
│  │  Add & Norm                         │               │
│  └─────────────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.2 三种主流架构

| 架构类型 | 代表模型 | 特点 | 适用任务 |
|----------|----------|------|----------|
| **Encoder-Only** | BERT, RoBERTa | 双向注意力，理解能力强 | 文本分类、NER、问答 |
| **Decoder-Only** | GPT, LLaMA, Qwen | 自回归生成，单向注意力 | 文本生成、对话 |
| **Encoder-Decoder** | T5, BART | 编码理解 + 解码生成 | 翻译、摘要 |

```
架构对比：

Encoder-Only (BERT):
  输入: [CLS] 我 爱 北京 [SEP]
        ←────────────────────→  (双向注意力)
  
Decoder-Only (GPT):
  输入: 我 爱 北京
        →→→→→→→→→→  (单向注意力，只看左边)
        
Encoder-Decoder (T5):
  Encoder: [理解输入] ──→ Decoder: [生成输出]
```

### 1.3 大模型训练流程

```
┌─────────────────────────────────────────────────────────┐
│                大模型训练三阶段                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  阶段一：预训练 (Pre-training)                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  数据：TB级互联网文本（网页、书籍、代码...）         │   │
│  │  目标：Next Token Prediction（预测下一个词）        │   │
│  │  规模：数千GPU，训练数周到数月                       │   │
│  │  产出：Base Model（基座模型）                       │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                              │
│  阶段二：监督微调 (Supervised Fine-Tuning, SFT)         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  数据：高质量指令-回答对（10万~100万条）            │   │
│  │  目标：学习遵循指令、生成有帮助的回答              │   │
│  │  产出：SFT Model                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                              │
│  阶段三：对齐训练 (Alignment)                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  方法：RLHF / DPO / RLAIF                          │   │
│  │  目标：与人类偏好对齐，安全、有帮助、诚实           │   │
│  │  产出：Chat Model（可对话的模型）                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.4 预训练关键技术

#### 1.4.1 注意力机制优化

| 技术 | 原理 | 优势 |
|------|------|------|
| **Multi-Head Attention** | 多个注意力头并行计算 | 捕捉不同子空间的信息 |
| **Flash Attention** | IO-aware 精确注意力算法 | 显存减少，速度提升 2-4x |
| **GQA (Grouped Query)** | KV Cache 分组共享 | 推理效率提升 |
| **MQA (Multi-Query)** | 所有头共享 KV | 极致推理效率 |
| **Sliding Window** | 局部注意力窗口 | 支持更长上下文 |

#### 1.4.2 位置编码

```python
# 主流位置编码方案

位置编码方案对比：
┌────────────────┬─────────────────────────────────────┐
│ 方案           │ 特点                                 │
├────────────────┼─────────────────────────────────────┤
│ 绝对位置编码    │ 简单，但外推能力差                   │
│ (Sinusoidal)   │ 用于原始 Transformer                │
├────────────────┼─────────────────────────────────────┤
│ 可学习位置编码  │ GPT 系列采用                        │
│ (Learned)      │ 灵活但泛化受限于训练长度             │
├────────────────┼─────────────────────────────────────┤
│ RoPE           │ LLaMA/Qwen 采用                     │
│ (旋转位置编码)  │ 外推能力强，支持长文本               │
├────────────────┼─────────────────────────────────────┤
│ ALiBi          │ BLOOM 采用                          │
│ (线性偏置)      │ 无需训练，外推能力好                │
└────────────────┴─────────────────────────────────────┘
```

#### 1.4.3 训练优化技术

| 技术 | 作用 | 说明 |
|------|------|------|
| **混合精度训练 (FP16/BF16)** | 减少显存，加速计算 | BF16 数值稳定性更好 |
| **梯度累积** | 模拟更大 batch size | 显存受限时使用 |
| **梯度检查点** | 用计算换显存 | 重计算部分激活值 |
| **ZeRO 优化** | 分布式显存优化 | DeepSpeed 三阶段 |
| **张量并行 (TP)** | 切分模型层 | 单机多卡 |
| **流水线并行 (PP)** | 切分模型层序列 | 多机训练 |
| **数据并行 (DP)** | 数据分片 | 最基础的并行 |

### 1.5 预训练代码示例

```python
# 使用 Hugging Face Transformers 预训练示例
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from datasets import load_dataset

# 1. 加载模型和分词器
model_name = "gpt2"  # 或自定义架构
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# 2. 加载数据集
dataset = load_dataset("wikitext", "wikitext-2-raw-v1")

# 3. 数据预处理
def tokenize_function(examples):
    return tokenizer(examples["text"], truncation=True, max_length=512)

tokenized_dataset = dataset.map(tokenize_function, batched=True)

# 4. 训练配置
training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,
    per_device_train_batch_size=8,
    gradient_accumulation_steps=4,
    learning_rate=5e-5,
    warmup_steps=500,
    weight_decay=0.01,
    fp16=True,  # 混合精度
    logging_steps=100,
    save_steps=1000,
)

# 5. 数据整理器
data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer, mlm=False  # CLM 任务
)

# 6. 训练
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
    data_collator=data_collator,
)

trainer.train()
```

---

## 2. 大模型对齐与优化技术

### 2.1 什么是对齐（Alignment）？

对齐是指让模型的输出符合人类的期望和价值观，包括：
- **有帮助（Helpful）**：提供有用、准确的信息
- **诚实（Honest）**：不编造信息，承认不确定性
- **无害（Harmless）**：不产生有害、偏见内容

### 2.2 RLHF（基于人类反馈的强化学习）

```
┌─────────────────────────────────────────────────────────┐
│                    RLHF 流程                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 1: 收集人类偏好数据                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Prompt → 模型生成多个回答 → 人类标注排序        │   │
│  │  例：回答A > 回答B > 回答C                       │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                              │
│  Step 2: 训练奖励模型 (Reward Model)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  输入：(prompt, response) → 输出：奖励分数        │   │
│  │  学习预测人类偏好                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                              │
│  Step 3: PPO 强化学习优化                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  策略模型生成回答 → 奖励模型打分 → 更新策略       │   │
│  │  + KL 散度约束（防止偏离原模型太远）              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.3 DPO（直接偏好优化）

DPO 是 RLHF 的简化替代方案，无需单独训练奖励模型。

```python
# DPO 核心思想
"""
RLHF: SFT Model → Reward Model → PPO → Aligned Model
DPO:  SFT Model → 直接优化 → Aligned Model

DPO 损失函数：
L_DPO = -log σ(β * (log π(y_w|x) - log π(y_l|x) 
                    - log π_ref(y_w|x) + log π_ref(y_l|x)))

其中：
- y_w: 偏好的回答 (winner)
- y_l: 不偏好的回答 (loser)
- π: 当前策略
- π_ref: 参考策略（SFT模型）
- β: 温度参数
"""
```

| 方法 | 优势 | 劣势 |
|------|------|------|
| **RLHF** | 效果好，业界验证充分 | 复杂，需要训练奖励模型 |
| **DPO** | 简单，无需奖励模型 | 对数据质量要求高 |
| **RLAIF** | 用AI代替人类标注 | 依赖辅助模型质量 |

### 2.4 提示工程（Prompt Engineering）

提示工程是一种无需训练即可优化模型输出的技术。

#### 2.4.1 核心技巧

```
┌─────────────────────────────────────────────────────────┐
│                提示工程技巧大全                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🎭 角色设定 (Role Prompting)                           │
│  "你是一位资深的Python开发专家，擅长代码优化..."          │
│                                                         │
│  📝 指令清晰化                                          │
│  "请用中文回答，分点列出，每点不超过50字"                │
│                                                         │
│  📋 格式约束                                            │
│  "请以JSON格式返回结果，包含name、age、city字段"         │
│                                                         │
│  💡 思维链 (Chain of Thought, CoT)                      │
│  "让我们一步一步思考这个问题..."                         │
│                                                         │
│  📚 少样本学习 (Few-shot Learning)                      │
│  "示例1：输入XX → 输出YY                                │
│   示例2：输入AA → 输出BB                                │
│   现在请处理：输入CC → ?"                               │
│                                                         │
│  🔄 自我一致性 (Self-Consistency)                       │
│  多次采样，投票选择最一致的答案                          │
│                                                         │
│  🌳 思维树 (Tree of Thoughts)                           │
│  探索多条推理路径，评估选择最优                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 2.4.2 Prompt 模板示例

```python
# 系统级 Prompt 模板
SYSTEM_PROMPT = """
你是一个专业的{role}，具有以下特点：
1. {characteristic_1}
2. {characteristic_2}
3. {characteristic_3}

在回答问题时，请遵循以下原则：
- {principle_1}
- {principle_2}
- {principle_3}

输出格式要求：
{output_format}
"""

# Chain of Thought 模板
COT_PROMPT = """
问题：{question}

请按以下步骤思考：
1. 首先，理解问题的核心是什么
2. 然后，分析已知条件
3. 接着，制定解决方案
4. 最后，给出答案

让我们开始：
"""

# Few-shot 模板
FEW_SHOT_PROMPT = """
任务：{task_description}

示例1：
输入：{example_1_input}
输出：{example_1_output}

示例2：
输入：{example_2_input}
输出：{example_2_output}

现在请处理：
输入：{actual_input}
输出：
"""
```

#### 2.4.3 高级 Prompt 技术

| 技术 | 说明 | 适用场景 |
|------|------|----------|
| **ReAct** | 推理+行动交替 | Agent 任务 |
| **Reflexion** | 自我反思改进 | 复杂推理 |
| **Plan-and-Solve** | 先规划后执行 | 多步骤任务 |
| **Least-to-Most** | 从简到繁分解 | 复杂问题 |
| **Skeleton-of-Thought** | 先骨架后填充 | 长文本生成 |

---

## 3. 大模型微调

### 3.1 微调方法概览

```
┌─────────────────────────────────────────────────────────┐
│                  微调方法谱系                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  按参数更新范围：                                        │
│                                                         │
│  全参数微调 (Full Fine-tuning)                          │
│  ├── 更新所有参数                                       │
│  ├── 效果最好，但成本最高                               │
│  └── 需要大量显存和计算资源                              │
│                                                         │
│  参数高效微调 (PEFT)                                    │
│  ├── LoRA：低秩适配                                     │
│  ├── QLoRA：量化 + LoRA                                 │
│  ├── Prefix Tuning：前缀调优                            │
│  ├── P-Tuning v2：深度提示调优                          │
│  ├── Adapter：适配器层                                  │
│  └── IA3：抑制和放大内部激活                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 LoRA 详解

LoRA (Low-Rank Adaptation) 是最流行的参数高效微调方法。

```
┌─────────────────────────────────────────────────────────┐
│                    LoRA 原理                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  原始权重矩阵 W (d × k)                                  │
│                                                         │
│       ┌───────────────┐                                │
│  x ──→│   W (冻结)     │──→ y                           │
│       └───────────────┘                                │
│              +                                          │
│       ┌─────┐   ┌─────┐                                │
│  x ──→│  A  │──→│  B  │──→ Δy                          │
│       └─────┘   └─────┘                                │
│       (d × r)   (r × k)                                │
│                                                         │
│  最终输出：y' = Wx + BAx                                │
│                                                         │
│  核心思想：                                              │
│  - 冻结原始权重 W                                        │
│  - 新增低秩矩阵 A、B (r << d, k)                         │
│  - 只训练 A、B，参数量大幅减少                           │
│  - 例：r=8 时，参数量减少 ~10000 倍                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.3 微调实践代码

#### 3.3.1 使用 PEFT + LoRA 微调

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer
from datasets import load_dataset

# 1. 加载基座模型
model_name = "meta-llama/Llama-2-7b-hf"
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

# 2. 配置 LoRA
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,                      # 低秩维度
    lora_alpha=32,            # 缩放因子
    lora_dropout=0.1,         # Dropout
    target_modules=[          # 要适配的模块
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ],
)

# 3. 应用 LoRA
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# 输出：trainable params: 4,194,304 || all params: 6,742,609,920 || trainable%: 0.0622

# 4. 准备数据集
dataset = load_dataset("json", data_files="train_data.json")

def format_instruction(example):
    return f"""### 指令：
{example['instruction']}

### 回答：
{example['output']}"""

# 5. 训练配置
training_args = TrainingArguments(
    output_dir="./lora_output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    warmup_ratio=0.03,
)

# 6. 训练
trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    formatting_func=format_instruction,
    max_seq_length=512,
)

trainer.train()

# 7. 保存 LoRA 权重
model.save_pretrained("./lora_weights")
```

#### 3.3.2 使用 QLoRA 微调（显存更省）

```python
from transformers import BitsAndBytesConfig
import torch

# 4-bit 量化配置
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)

# 加载量化模型
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=bnb_config,
    device_map="auto"
)

# 后续与 LoRA 相同...
```

### 3.4 微调方法对比

| 方法 | 可训练参数 | 显存需求 | 效果 | 推荐场景 |
|------|-----------|----------|------|----------|
| **Full Fine-tuning** | 100% | 极高 | 最好 | 充足资源 |
| **LoRA** | ~0.1% | 中等 | 很好 | 通用场景 |
| **QLoRA** | ~0.1% | 低 | 较好 | 显存受限 |
| **Prefix Tuning** | ~0.01% | 低 | 一般 | 简单任务 |
| **Adapter** | ~1% | 中低 | 较好 | 多任务 |

### 3.5 微调数据格式

```python
# Alpaca 格式（最常用）
{
    "instruction": "将以下句子翻译成英文",
    "input": "今天天气很好",
    "output": "The weather is nice today."
}

# ShareGPT 格式（多轮对话）
{
    "conversations": [
        {"from": "human", "value": "你好"},
        {"from": "gpt", "value": "你好！有什么我可以帮助你的吗？"},
        {"from": "human", "value": "介绍一下北京"},
        {"from": "gpt", "value": "北京是中国的首都..."}
    ]
}

# OpenAI 格式
{
    "messages": [
        {"role": "system", "content": "你是一个有帮助的助手"},
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "你好！有什么可以帮你的？"}
    ]
}
```

---

## 4. 大模型推理与部署

### 4.1 推理优化技术

```
┌─────────────────────────────────────────────────────────┐
│                 推理优化技术栈                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔢 模型压缩                                            │
│  ├── 量化 (Quantization)                               │
│  │   ├── INT8：精度损失小，推理快 2x                    │
│  │   ├── INT4：精度有损，显存省 4x                      │
│  │   └── GPTQ/AWQ/GGUF：不同量化方案                   │
│  ├── 剪枝 (Pruning)                                    │
│  │   └── 移除不重要的参数                               │
│  └── 蒸馏 (Distillation)                               │
│      └── 大模型知识迁移到小模型                          │
│                                                         │
│  ⚡ 推理加速                                            │
│  ├── KV Cache：缓存注意力键值对                         │
│  ├── Flash Attention：高效注意力计算                   │
│  ├── Continuous Batching：动态批处理                   │
│  ├── Speculative Decoding：推测解码                    │
│  └── PagedAttention：分页注意力 (vLLM)                 │
│                                                         │
│  🖥️ 硬件优化                                           │
│  ├── TensorRT：NVIDIA GPU 优化                         │
│  ├── ONNX Runtime：跨平台加速                          │
│  └── 算子融合：减少内存访问                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 量化详解

| 量化格式 | 位数 | 显存节省 | 精度损失 | 适用场景 |
|----------|------|----------|----------|----------|
| **FP16** | 16-bit | 2x | 几乎无 | 训练/推理 |
| **BF16** | 16-bit | 2x | 几乎无 | 训练/推理 |
| **INT8** | 8-bit | 4x | 很小 | 推理 |
| **INT4** | 4-bit | 8x | 较小 | 推理 |
| **GPTQ** | 4-bit | 8x | 小 | GPU 推理 |
| **AWQ** | 4-bit | 8x | 更小 | GPU 推理 |
| **GGUF** | 2-8bit | 可变 | 可变 | CPU/混合推理 |

```python
# 使用 bitsandbytes 量化加载
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

# INT8 量化
model_8bit = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-hf",
    load_in_8bit=True,
    device_map="auto"
)

# INT4 量化
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
)
model_4bit = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-hf",
    quantization_config=bnb_config,
    device_map="auto"
)
```

### 4.3 部署方案

#### 4.3.1 部署框架对比

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| **vLLM** | PagedAttention，吞吐量高 | 高并发在线服务 |
| **TGI** | HuggingFace 官方，功能全面 | 生产环境 |
| **Ollama** | 简单易用，本地部署 | 个人/开发 |
| **llama.cpp** | 纯 CPU 推理，跨平台 | 边缘设备 |
| **TensorRT-LLM** | NVIDIA 优化，极致性能 | 高性能 GPU |
| **OpenLLM** | 灵活，支持多模型 | 模型服务化 |

#### 4.3.2 vLLM 部署示例

```python
# 安装：pip install vllm

from vllm import LLM, SamplingParams

# 1. 加载模型
llm = LLM(
    model="meta-llama/Llama-2-7b-chat-hf",
    tensor_parallel_size=1,  # GPU 数量
    dtype="float16",
    max_model_len=4096,
)

# 2. 设置采样参数
sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=512,
)

# 3. 推理
prompts = ["请介绍一下人工智能", "Python有什么优点？"]
outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(output.outputs[0].text)
```

```bash
# vLLM 启动 API 服务
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-2-7b-chat-hf \
    --port 8000 \
    --tensor-parallel-size 1
```

#### 4.3.3 Ollama 本地部署

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 下载并运行模型
ollama pull llama3
ollama run llama3

# 使用 API
curl http://localhost:11434/api/generate -d '{
  "model": "llama3",
  "prompt": "什么是大语言模型？"
}'
```

```python
# Python 调用 Ollama
import ollama

response = ollama.chat(
    model='llama3',
    messages=[{'role': 'user', 'content': '你好'}]
)
print(response['message']['content'])
```

### 4.4 部署架构设计

```
┌─────────────────────────────────────────────────────────┐
│              生产级 LLM 部署架构                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  用户请求                                               │
│      ↓                                                  │
│  ┌─────────────┐                                       │
│  │   API 网关   │  ← 认证、限流、路由                    │
│  └──────┬──────┘                                       │
│         │                                              │
│         ↓                                              │
│  ┌─────────────┐                                       │
│  │  负载均衡   │  ← 分发请求到不同实例                   │
│  └──────┬──────┘                                       │
│         │                                              │
│    ┌────┴────┐                                         │
│    ↓         ↓                                         │
│ ┌──────┐ ┌──────┐                                     │
│ │推理1 │ │推理2 │  ← vLLM/TGI 实例                     │
│ │(GPU) │ │(GPU) │                                     │
│ └──────┘ └──────┘                                     │
│    ↑         ↑                                         │
│    └────┬────┘                                         │
│         │                                              │
│  ┌─────────────┐                                       │
│  │  模型存储   │  ← S3/本地/模型仓库                    │
│  └─────────────┘                                       │
│                                                         │
│  监控组件：Prometheus + Grafana                         │
│  日志组件：ELK Stack                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 其他训练与优化相关知识

### 5.1 数据工程

#### 5.1.1 数据质量的重要性

```
数据质量金字塔：

        ┌─────────┐
        │ 高质量  │  ← 人工标注、专家校验
        │  数据   │     效果最好，成本最高
        ├─────────┤
        │ 合成数据 │  ← GPT-4 生成、自我指令
        │         │     平衡效果与成本
        ├─────────┤
        │ 网络数据 │  ← CommonCrawl、网页爬取
        │         │     量大质低，需要清洗
        └─────────┘
```

#### 5.1.2 数据处理流程

```python
# 数据处理 Pipeline
data_pipeline = {
    "1. 数据收集": [
        "爬取网页数据",
        "收集开源数据集",
        "生成合成数据"
    ],
    "2. 数据清洗": [
        "去重（MinHash、SimHash）",
        "过滤低质量内容",
        "移除有害/敏感信息",
        "语言检测与分类"
    ],
    "3. 数据处理": [
        "分词 Tokenization",
        "格式标准化",
        "长度裁剪/填充"
    ],
    "4. 数据增强": [
        "回译增强",
        "同义词替换",
        "模型改写"
    ],
    "5. 质量评估": [
        "困惑度评估",
        "人工抽样检查",
        "多样性分析"
    ]
}
```

### 5.2 评估与测试

#### 5.2.1 常用评估基准

| 基准 | 评估能力 | 说明 |
|------|----------|------|
| **MMLU** | 多任务知识 | 57个学科的选择题 |
| **HellaSwag** | 常识推理 | 句子补全 |
| **GSM8K** | 数学推理 | 小学数学应用题 |
| **HumanEval** | 代码生成 | Python 函数补全 |
| **TruthfulQA** | 真实性 | 检测幻觉 |
| **MT-Bench** | 对话能力 | 多轮对话评分 |
| **C-Eval** | 中文知识 | 中文多任务 |
| **CMMLU** | 中文 MMLU | 中文版 MMLU |

#### 5.2.2 评估代码示例

```python
# 使用 lm-evaluation-harness 评估
# pip install lm-eval

from lm_eval import evaluator
from lm_eval.models.huggingface import HFLM

# 加载模型
model = HFLM(
    pretrained="meta-llama/Llama-2-7b-hf",
    device="cuda"
)

# 运行评估
results = evaluator.simple_evaluate(
    model=model,
    tasks=["hellaswag", "mmlu", "gsm8k"],
    num_fewshot=5,
    batch_size=8
)

print(results["results"])
```

### 5.3 常见问题与解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| **训练不收敛** | 学习率不当、数据问题 | 调整 LR、检查数据 |
| **过拟合** | 数据量不足、模型过大 | 数据增强、正则化 |
| **灾难性遗忘** | 微调破坏原有能力 | LoRA、较小学习率 |
| **幻觉** | 训练数据有噪声 | RAG 增强、RLHF |
| **推理慢** | 模型大、硬件弱 | 量化、蒸馏、升级硬件 |
| **显存不足** | 模型/batch 太大 | 梯度累积、量化、LoRA |

### 5.4 训练资源估算

```python
# 显存估算公式（近似）
def estimate_memory(params_billion, precision="fp16", training=True):
    """
    params_billion: 参数量（十亿）
    precision: fp32/fp16/int8/int4
    training: 是否训练
    """
    bytes_per_param = {
        "fp32": 4,
        "fp16": 2,
        "bf16": 2,
        "int8": 1,
        "int4": 0.5
    }
    
    # 模型权重
    model_memory = params_billion * bytes_per_param[precision]
    
    if training:
        # 训练时需要额外的优化器状态和梯度
        # AdamW: 参数 + 梯度 + 一阶动量 + 二阶动量 ≈ 4x
        # 加上激活值等，总计约 6-8x
        total_memory = model_memory * 6
    else:
        # 推理时主要是模型权重 + KV Cache
        total_memory = model_memory * 1.2
    
    return f"{total_memory:.1f} GB"

# 示例
print(estimate_memory(7, "fp16", training=True))   # 约 84 GB
print(estimate_memory(7, "fp16", training=False))  # 约 16.8 GB
print(estimate_memory(7, "int4", training=False))  # 约 4.2 GB
```

### 5.5 训练工具生态

```
┌─────────────────────────────────────────────────────────┐
│                  训练工具生态                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔧 训练框架                                            │
│  ├── Hugging Face Transformers                         │
│  ├── DeepSpeed                                         │
│  ├── Megatron-LM                                       │
│  ├── ColossalAI                                        │
│  └── LLaMA-Factory                                     │
│                                                         │
│  📊 实验管理                                            │
│  ├── Weights & Biases                                  │
│  ├── MLflow                                            │
│  └── TensorBoard                                       │
│                                                         │
│  🗃️ 数据处理                                           │
│  ├── Datasets (HuggingFace)                            │
│  ├── Apache Spark                                      │
│  └── Dask                                              │
│                                                         │
│  ☁️ 云平台                                              │
│  ├── AWS SageMaker                                     │
│  ├── Google Vertex AI                                  │
│  ├── Azure ML                                          │
│  └── AutoDL / 恒源云（国内）                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. 总结

### 6.1 核心要点

| 主题 | 关键点 |
|------|--------|
| **架构与训练** | Transformer 架构、预训练三阶段、分布式训练 |
| **对齐与优化** | RLHF/DPO 对齐、提示工程技巧 |
| **微调技术** | LoRA/QLoRA 参数高效微调、数据格式 |
| **推理部署** | 量化压缩、vLLM/Ollama 部署、架构设计 |

### 6.2 学习路径

```
基础 → 实践 → 深入

1️⃣ 基础理论
   • Transformer 架构原理
   • 注意力机制
   • 预训练目标

2️⃣ 动手实践
   • 使用 HuggingFace 微调模型
   • 尝试 LoRA/QLoRA
   • 本地部署 Ollama

3️⃣ 深入优化
   • 分布式训练
   • 推理优化
   • 生产部署
```

### 6.3 参考资源

- [《Attention Is All You Need》](https://arxiv.org/abs/1706.03762)
- [《LoRA: Low-Rank Adaptation》](https://arxiv.org/abs/2106.09685)
- [《Training language models to follow instructions with human feedback》](https://arxiv.org/abs/2203.02155)
- [Hugging Face 文档](https://huggingface.co/docs)
- [vLLM 项目](https://github.com/vllm-project/vllm)
- [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory)
