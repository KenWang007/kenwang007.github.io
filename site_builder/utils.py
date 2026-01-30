"""Utility helpers shared across the site builder pipeline."""
from __future__ import annotations

import hashlib
import logging
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import config

logger = logging.getLogger(__name__)

_PANDOC_AVAILABLE: Optional[bool] = None


def pandoc_available() -> bool:
    """Check once whether pandoc is available on the current system."""
    global _PANDOC_AVAILABLE
    if _PANDOC_AVAILABLE is not None:
        return _PANDOC_AVAILABLE
    try:
        subprocess.run(["pandoc", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        _PANDOC_AVAILABLE = False
    else:
        _PANDOC_AVAILABLE = True
    return _PANDOC_AVAILABLE


def extract_markdown_content_from_legacy_html(legacy_html_path: Path) -> str:
    """Extract the inner HTML fragment from a legacy HTML article."""
    try:
        with open(legacy_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        article_match = re.search(
            r'<article[^>]*class="[^"]*markdown-content[^"]*"[^>]*>([\s\S]*?)</article>',
            html,
            re.IGNORECASE,
        )
        if article_match:
            return article_match.group(1).strip()
        body_match = re.search(r"<body[^>]*>([\s\S]*?)</body>", html, re.IGNORECASE)
        if body_match:
            return body_match.group(1).strip()
        return html
    except Exception:
        return ""


def stable_id(text: str, length: int = 12) -> str:
    """Create a stable ASCII id from an arbitrary unicode string."""
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()
    return h[:length]


_FRONT_MATTER_RE = re.compile(r'^\s*---\s*\n([\s\S]*?)\n---\s*\n', re.MULTILINE)


def parse_front_matter(md_text: str) -> Tuple[Dict[str, str], str]:
    """Parse simple YAML-style front matter and return (meta, content)."""
    m = _FRONT_MATTER_RE.match(md_text)
    if not m:
        return {}, md_text

    raw = m.group(1)
    meta: Dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            meta[k] = v
    return meta, md_text[m.end():]


def validate_slug(slug: str) -> str:
    slug = (slug or "").strip()
    if not slug:
        raise ValueError("slug is empty")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("invalid slug: %s" % slug)
    return slug


def extract_keywords(title: str, content: str = "") -> List[str]:
    """Keyword extraction shared by article and directory generation."""
    if not title:
        return []

    keywords: List[str] = []
    seen: set[str] = set()
    keyword_scores: Dict[str, int] = {}

    clean_title = re.sub(
        r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]',
        "",
        title,
    ).strip()
    if not clean_title:
        return []

    for topic in config.CORE_TOPICS:
        if topic.lower() in clean_title.lower():
            for word in re.findall(r"\b\w+\b", clean_title):
                if word.lower() == topic.lower():
                    if word not in seen:
                        keyword_scores[word] = keyword_scores.get(word, 0) + 10
                        seen.add(word)
                    break
            else:
                if topic not in seen:
                    keyword_scores[topic] = keyword_scores.get(topic, 0) + 10
                    seen.add(topic)

    english_terms = re.findall(r"\b[A-Z][A-Za-z]+\b|\b[a-z]{4,}\b", clean_title)
    for term in english_terms:
        if term in config.STOP_WORDS or term.lower() in config.STOP_WORDS:
            continue
        if term not in seen and len(term) >= config.MIN_KEYWORD_LENGTH:
            if term[0].isupper() or len(term) > 4:
                keyword_scores[term] = keyword_scores.get(term, 0) + 5
                seen.add(term)

    processed_title = clean_title
    for modifier in config.MODIFIER_WORDS:
        processed_title = re.sub(rf"\b{modifier}\b", "", processed_title)
    processed_title = processed_title.strip()

    patterns = [
        (r"([^，。！？\s]{2,})(?:技术|框架|工具|平台|系统)", 1),
        (r"(?:使用|运行|配置|安装)\s*([^，。！？\s]{2,})", 1),
        (r"([A-Z][a-z]+(?:[A-Z][a-z]+)*)", 0),
    ]
    for pattern, group in patterns:
        matches = re.findall(pattern, clean_title)
        for match in matches:
            keyword = match if isinstance(match, str) else match[group]
            keyword = keyword.strip()
            if (
                keyword
                and keyword not in config.STOP_WORDS
                and keyword not in config.MODIFIER_WORDS
                and len(keyword) >= config.MIN_KEYWORD_LENGTH
                and keyword not in seen
            ):
                keyword_scores[keyword] = keyword_scores.get(keyword, 0) + 3
                seen.add(keyword)

    chinese_parts = re.split(r"[，。！？、\s]+", processed_title)
    for part in chinese_parts:
        chinese_words = re.findall(r"[\u4e00-\u9fff]{2,}", part)
        for word in chinese_words:
            if (
                word not in config.STOP_WORDS
                and word not in config.MODIFIER_WORDS
                and len(word) >= config.MIN_KEYWORD_LENGTH
                and word not in seen
            ):
                keyword_scores[word] = keyword_scores.get(word, 0) + 2
                seen.add(word)

    sorted_keywords = sorted(keyword_scores.items(), key=lambda x: x[1], reverse=True)
    keywords = [kw for kw, _ in sorted_keywords[: config.MAX_KEYWORDS_PER_POST]]

    if len(keywords) < 2:
        words = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}", clean_title)
        for word in words:
            if (
                word not in config.STOP_WORDS
                and word not in seen
                and len(keywords) < config.MAX_KEYWORDS_PER_POST
            ):
                keywords.append(word)
                seen.add(word)

    return keywords[: config.MAX_KEYWORDS_PER_POST]


def generate_metadata_for_template(
    file_path: Path,
    title: str,
    keywords: List[str],
    source_file: Optional[Path] = None,
) -> Dict[str, str]:
    """Generate the metadata values consumed by template.html."""
    description = f"{title} - "
    if keywords:
        description += f"关键词: {', '.join(keywords[:3])}"
    else:
        description += config.SITE_DESCRIPTION

    stat_file = source_file if source_file and source_file.exists() else file_path
    if stat_file.exists():
        stat = stat_file.stat()
        created_date = datetime.fromtimestamp(stat.st_ctime)
        modified_date = datetime.fromtimestamp(stat.st_mtime)
    else:
        created_date = datetime.now()
        modified_date = datetime.now()

    rel_path = file_path.relative_to(config.ROOT_DIR)
    return {
        "title": title,
        "description": description[:160],
        "keywords": ", ".join(keywords),
        "date": created_date.isoformat(),
        "modified_date": modified_date.isoformat(),
        "path": str(rel_path),
    }
