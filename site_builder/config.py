"""Configuration utilities for site generation."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Set


ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config.json"


_DEFAULTS: Dict[str, Any] = {
    "site": {
        "name": "Ken的知识库",
        "url": "https://kenwang007.github.io",
        "description": "记录AI学习、架构设计、编程技术和读书心得的个人知识库",
        "author": "Ken Wang",
    },
    "features": {
        "keywords": {
            "maxPerPost": 5,
            "minLength": 2,
        }
    }
}


CORE_TOPICS: Set[str] = {
    "RAG",
    "检索增强生成",
    "LLM",
    "大语言模型",
    "向量数据库",
    "AI",
    "Python",
    "JavaScript",
    "TypeScript",
    "架构",
    "设计模式",
    "微服务",
    "Docker",
    "Kubernetes",
    "数据库",
    "Redis",
    "MongoDB",
    "算法",
    "数据结构",
    "机器学习",
    "深度学习",
    "NLP",
    "Ollama",
    "OpenWebUI",
    "Cursor",
    "Prompt",
    "Fine-tuning",
    "提示工程",
}

MODIFIER_WORDS: Set[str] = {
    "全面",
    "详细",
    "深入",
    "最新",
    "完整",
    "简明",
    "快速",
    "实战",
    "入门",
    "进阶",
    "高级",
    "基础",
    "初级",
    "中级",
    "介绍",
    "教程",
    "指南",
    "学习",
    "技术",
}

STOP_WORDS: Set[str] = {
    "的",
    "了",
    "和",
    "是",
    "在",
    "与",
    "或",
    "等",
    "及",
    "这",
    "那",
    "其",
    "此",
    "为",
    "有",
    "将",
    "可",
    "能",
    "How",
    "What",
    "When",
    "Where",
    "Why",
    "to",
    "is",
    "in",
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "of",
    "at",
    "by",
}


def _load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return _DEFAULTS.copy()


@lru_cache(maxsize=1)
def config_data() -> Dict[str, Any]:
    data = _DEFAULTS.copy()
    overrides = _load_config()
    for key, value in overrides.items():
        if isinstance(value, dict) and key in data:
            data[key] = {**data[key], **value}
        else:
            data[key] = value
    return data


def site() -> Dict[str, Any]:
    data = config_data()["site"].copy()
    return data


def features() -> Dict[str, Any]:
    data = config_data()["features"].copy()
    return data


SITE = site()
FEATURES = features()

SITE_URL = SITE["url"]
SITE_NAME = SITE["name"]
SITE_DESCRIPTION = SITE["description"]

MAX_KEYWORDS_PER_POST = FEATURES.get("keywords", {}).get("maxPerPost", 5)
MIN_KEYWORD_LENGTH = FEATURES.get("keywords", {}).get("minLength", 2)

NOTES_DIR = ROOT_DIR / "notes"
TEMPLATE_FILE = ROOT_DIR / "template.html"
OUTPUT_FILE = ROOT_DIR / "nav_data.json"
SITEMAP_FILE = ROOT_DIR / "sitemap.xml"
RSS_FILE = ROOT_DIR / "rss.xml"

DIST_DIR = ROOT_DIR / "dist"
POSTS_OUT_DIR = DIST_DIR / "p"
CATEGORIES_OUT_DIR = DIST_DIR / "c"
