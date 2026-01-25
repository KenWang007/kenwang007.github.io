#!/usr/bin/env python3
"""
导航数据自动生成脚本
用于扫描notes目录结构，生成导航菜单和博客文章数据
同时将Markdown文件转换为HTML格式，生成sitemap.xml和RSS feed
"""

import os
import json
import re
import subprocess
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Set
from datetime import datetime
import hashlib
import xml.etree.ElementTree as ET
from xml.dom import minidom

# ====== 配置 ======
class Config:
    """配置类"""
    # 项目根目录
    ROOT_DIR = Path(__file__).parent
    # Notes目录
    NOTES_DIR = ROOT_DIR / "notes"
    # HTML模板文件
    TEMPLATE_FILE = ROOT_DIR / "template.html"
    # 输出JSON文件
    OUTPUT_FILE = ROOT_DIR / "nav_data.json"
    # Sitemap输出文件
    SITEMAP_FILE = ROOT_DIR / "sitemap.xml"
    # RSS Feed输出文件
    RSS_FILE = ROOT_DIR / "rss.xml"

    # New ASCII-only output roots (under dist/ for cleaner separation)
    DIST_DIR = ROOT_DIR / "dist"
    POSTS_OUT_DIR = DIST_DIR / "p"
    CATEGORIES_OUT_DIR = DIST_DIR / "c"
    
    # 网站配置
    SITE_URL = "https://kenwang007.github.io"
    SITE_NAME = "Ken的知识库"
    SITE_DESCRIPTION = "记录AI学习、架构设计、编程技术和读书心得的个人知识库"
    AUTHOR_NAME = "Ken Wang"
    AUTHOR_EMAIL = "ken@example.com"
    
    # 关键词提取配置
    MAX_KEYWORDS_PER_POST = 5
    MIN_KEYWORD_LENGTH = 2
    
    # 核心主题词（这些词如果出现，应该优先作为关键词）
    CORE_TOPICS = {
        'RAG', '检索增强生成', 'LLM', '大语言模型', '向量数据库',
        'AI', 'Python', 'JavaScript', 'TypeScript', '架构', '设计模式',
        '微服务', 'Docker', 'Kubernetes', '数据库', 'Redis', 'MongoDB',
        '算法', '数据结构', '机器学习', '深度学习', 'NLP', 'Ollama',
        'OpenWebUI', 'Cursor', 'Prompt', 'Fine-tuning', '提示工程'
    }
    
    # 要移除的修饰词
    MODIFIER_WORDS = {
        '全面', '详细', '深入', '最新', '完整', '简明', '快速', 
        '实战', '入门', '进阶', '高级', '基础', '初级', '中级',
        '介绍', '教程', '指南', '学习', '技术'
    }
    
    # 停用词（在关键词提取时忽略）
    STOP_WORDS = {
        '的', '了', '和', '是', '在', '与', '或', '等', '及',
        '这', '那', '其', '此', '为', '有', '将', '可', '能',
        'How', 'What', 'When', 'Where', 'Why', 'to', 'is', 'in',
        'the', 'a', 'an', 'and', 'or', 'but', 'of', 'at', 'by'
    }

# ====== 日志配置 ======
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

_PANDOC_AVAILABLE: Optional[bool] = None

def pandoc_available() -> bool:
    global _PANDOC_AVAILABLE
    if _PANDOC_AVAILABLE is not None:
        return _PANDOC_AVAILABLE
    try:
        subprocess.run(['pandoc', '--version'], capture_output=True, check=True)
        _PANDOC_AVAILABLE = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        _PANDOC_AVAILABLE = False
    return _PANDOC_AVAILABLE

def extract_markdown_content_from_legacy_html(legacy_html_path: Path) -> str:
    """
    Extract the inner HTML of <article class="markdown-content">...</article> from an existing legacy HTML page.
    Falls back to <body> content if not found.
    """
    try:
        with open(legacy_html_path, 'r', encoding='utf-8') as f:
            html = f.read()
        article_match = re.search(
            r'<article[^>]*class="[^"]*markdown-content[^"]*"[^>]*>([\s\S]*?)</article>',
            html,
            re.IGNORECASE
        )
        if article_match:
            return article_match.group(1).strip()
        body_match = re.search(r'<body[^>]*>([\s\S]*?)</body>', html, re.IGNORECASE)
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
    """
    Very small YAML front-matter parser.
    Supports top-of-file:
      ---
      key: value
      ---
    Returns (meta, content_without_front_matter).
    """
    m = _FRONT_MATTER_RE.match(md_text)
    if not m:
        return {}, md_text

    raw = m.group(1)
    meta: Dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            meta[k] = v
    return meta, md_text[m.end():]

def validate_slug(slug: str) -> str:
    slug = (slug or '').strip()
    if not slug:
        raise ValueError("slug is empty")
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise ValueError(f"invalid slug: {slug} (allowed: a-z0-9 and '-')")
    return slug


def slug_report(md_files: List[Path]) -> int:
    """
    Print a report of post/directory slugs:
    - missing slug
    - invalid slug
    - duplicate slug
    Returns process exit code (0 if OK, 1 if issues found).
    """
    missing_posts: List[Tuple[str, str]] = []   # (rel_md, suggested_slug)
    invalid_posts: List[Tuple[str, str]] = []   # (rel_md, slug)
    dup_posts: Dict[str, List[str]] = {}        # slug -> [rel_md]

    missing_dirs: List[Tuple[str, str]] = []    # (rel_dir_index_md, suggested_slug)
    invalid_dirs: List[Tuple[str, str]] = []    # (rel_dir_index_md, slug)
    dup_dirs: Dict[str, List[str]] = {}         # slug -> [rel_dir_index_md]

    seen_post: Dict[str, List[str]] = {}
    seen_dir: Dict[str, List[str]] = {}

    # Posts
    for md in md_files:
        rel_md = str(md.relative_to(Config.ROOT_DIR))
        text = md.read_text(encoding='utf-8')
        meta, _ = parse_front_matter(text)
        slug = meta.get('slug')
        if not slug:
            missing_posts.append((rel_md, f"post-{stable_id(rel_md)}"))
            continue
        try:
            slug = validate_slug(slug)
            seen_post.setdefault(slug, []).append(rel_md)
        except Exception:
            invalid_posts.append((rel_md, slug))

    for slug, files in seen_post.items():
        if len(files) > 1:
            dup_posts[slug] = files

    # Directories (index.md only)
    for root, _, files in os.walk(Config.NOTES_DIR):
        if "index.md" not in files:
            continue
        idx = Path(root) / "index.md"
        rel_idx = str(idx.relative_to(Config.ROOT_DIR))
        text = idx.read_text(encoding='utf-8')
        meta, _ = parse_front_matter(text)
        slug = meta.get('slug')
        if not slug:
            # Suggest a stable placeholder based on directory path
            rel_dir = str(Path(root).relative_to(Config.ROOT_DIR))
            missing_dirs.append((rel_idx, f"cat-{stable_id(rel_dir)}"))
            continue
        try:
            slug = validate_slug(slug)
            seen_dir.setdefault(slug, []).append(rel_idx)
        except Exception:
            invalid_dirs.append((rel_idx, slug))

    for slug, files in seen_dir.items():
        if len(files) > 1:
            dup_dirs[slug] = files

    issues = (
        len(missing_posts) + len(invalid_posts) + len(dup_posts) +
        len(missing_dirs) + len(invalid_dirs) + len(dup_dirs)
    )

    print("=== Slug Report ===")
    print(f"Posts scanned: {len(md_files)}")
    print()

    if missing_posts:
        print(f"[Posts missing slug] {len(missing_posts)}")
        for rel_md, sug in missing_posts:
            print(f"  - {rel_md}")
            print(f"    suggested: slug: {sug}")
        print()

    if invalid_posts:
        print(f"[Posts invalid slug] {len(invalid_posts)}")
        for rel_md, bad in invalid_posts:
            print(f"  - {rel_md}")
            print(f"    found: slug: {bad}")
            print("    rule: a-z 0-9 and '-' only (lowercase)")
        print()

    if dup_posts:
        print(f"[Posts duplicate slug] {len(dup_posts)}")
        for slug, files in dup_posts.items():
            print(f"  - slug: {slug}")
            for f in files:
                print(f"    * {f}")
        print()

    if missing_dirs:
        print(f"[Dirs missing slug] {len(missing_dirs)} (optional)")
        for rel_idx, sug in missing_dirs:
            print(f"  - {rel_idx}")
            print(f"    suggested: slug: {sug}")
        print()

    if invalid_dirs:
        print(f"[Dirs invalid slug] {len(invalid_dirs)}")
        for rel_idx, bad in invalid_dirs:
            print(f"  - {rel_idx}")
            print(f"    found: slug: {bad}")
            print("    rule: a-z 0-9 and '-' only (lowercase)")
        print()

    if dup_dirs:
        print(f"[Dirs duplicate slug] {len(dup_dirs)}")
        for slug, files in dup_dirs.items():
            print(f"  - slug: {slug}")
            for f in files:
                print(f"    * {f}")
        print()

    if issues == 0:
        print("✅ No slug issues found.")
        return 0

    print(f"❌ Found {issues} issue(s).")
    return 1

def collect_markdown_posts() -> List[Path]:
    """Collect all markdown posts under notes/ excluding index.md."""
    md_files: List[Path] = []
    for root, _, files in os.walk(Config.NOTES_DIR):
        for file in files:
            if not file.endswith(".md"):
                continue
            if file == "index.md":
                continue
            md_files.append(Path(root) / file)
    return sorted(md_files)

def build_directory_structure_from_md(md_files: List[Path]) -> List[Dict]:
    """
    Build directory structure tree (only directories that contain posts or index.md or have subdirs with posts).
    Each node has: {name, path(original), id, url, has_posts, subdirs[]}
    """
    # Build a set of directories that should exist as nodes
    dir_set: Set[Path] = set()
    for md in md_files:
        dir_set.add(md.parent)
        # include all parents up to notes
        p = md.parent
        while p != Config.NOTES_DIR and Config.NOTES_DIR in p.parents:
            p = p.parent
            dir_set.add(p)

    # also include directories that have index.md
    for root, dirs, files in os.walk(Config.NOTES_DIR):
        if "index.md" in files:
            dir_set.add(Path(root))

    # directory slug mapping from index.md front matter (manual)
    dir_slug_by_rel: Dict[str, str] = {}
    used_dir_slugs: Set[str] = set()
    for d in list(dir_set):
        index_md = d / "index.md"
        if not index_md.exists():
            continue
        try:
            text = index_md.read_text(encoding='utf-8')
            meta, _ = parse_front_matter(text)
            if meta.get('slug'):
                slug = validate_slug(meta['slug'])
                if slug in used_dir_slugs:
                    raise ValueError(f"duplicate directory slug: {slug}")
                used_dir_slugs.add(slug)
                rel_dir = str(d.relative_to(Config.ROOT_DIR))
                dir_slug_by_rel[rel_dir] = slug
        except Exception as e:
            logger.warning(f"目录 slug 解析失败 {index_md}: {e}")

    def node_for_dir(dir_path: Path) -> Dict:
        rel_dir = str(dir_path.relative_to(Config.ROOT_DIR))
        dir_id = stable_id(rel_dir)
        slug = dir_slug_by_rel.get(rel_dir)
        url = f"dist/c/{slug}/index.html" if slug else f"dist/c/{dir_id}/index.html"
        name = dir_path.name
        has_posts = any((p.parent == dir_path) for p in md_files) or (dir_path / "index.md").exists()
        return {
            "name": name,
            "path": rel_dir,
            "id": dir_id,
            "slug": slug,
            "url": url,
            "has_posts": has_posts,
            "subdirs": []
        }

    # Build tree under notes
    def build_children(parent: Path) -> List[Dict]:
        children = []
        for child in sorted(parent.iterdir()):
            if not child.is_dir():
                continue
            if child not in dir_set:
                # But keep if it has any descendant in dir_set
                if not any((d != child and child in d.parents) for d in dir_set):
                    continue
            child_node = node_for_dir(child)
            child_node["subdirs"] = build_children(child)
            # Include node if it has posts or any included subdirs
            if child_node["has_posts"] or child_node["subdirs"]:
                children.append(child_node)
        return children

    roots = []
    for top in sorted(Config.NOTES_DIR.iterdir()):
        if not top.is_dir():
            continue
        if top not in dir_set and not any((d != top and top in d.parents) for d in dir_set):
            continue
        top_node = node_for_dir(top)
        top_node["subdirs"] = build_children(top)
        if top_node["has_posts"] or top_node["subdirs"]:
            roots.append(top_node)
    return roots

def flatten_directories(dirs: List[Dict]) -> List[Dict]:
    """Flatten directory tree into a list."""
    out: List[Dict] = []
    def walk(nodes: List[Dict]):
        for n in nodes:
            out.append(n)
            walk(n.get("subdirs", []))
    walk(dirs)
    return out


def scan_notes_directory() -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    扫描 notes 目录结构（ASCII-only URL 输出）

    Returns:
        nav_menu: 顶层导航（使用 /c/<id>/index.html）
        blog_posts: 文章列表（使用 /p/<id>.html）
        directory_structure: 目录树（每个节点包含 id/url/path/subdirs）
    """
    logger.info("开始扫描notes目录（ASCII-only URL）...")

    if not Config.NOTES_DIR.exists():
        logger.warning(f"Notes目录不存在: {Config.NOTES_DIR}")
        return [], [], []

    md_files = collect_markdown_posts()
    logger.info(f"找到 Markdown 文章: {len(md_files)}")

    # Build directory structure from Markdown sources
    directory_structure = build_directory_structure_from_md(md_files)
    flat_dirs = flatten_directories(directory_structure)

    # Top nav uses top-level nodes
    nav_menu = [
        {"name": d["name"], "id": d["id"], "url": d["url"], "path": d["path"]}
        for d in directory_structure
    ]

    # Build post records and legacy->new url map (for link rewriting)
    blog_posts: List[Dict] = []
    legacy_to_new: Dict[str, str] = {}
    used_post_slugs: Set[str] = set()

    for md in md_files:
        rel_md = str(md.relative_to(Config.ROOT_DIR))
        # original html path (legacy)
        rel_html_legacy = str(md.with_suffix(".html").relative_to(Config.ROOT_DIR))
        post_id = stable_id(rel_md)

        # Read markdown to support manual slug/title in front matter
        md_text = md.read_text(encoding='utf-8')
        meta, md_text_wo_fm = parse_front_matter(md_text)
        manual_slug = None
        if meta.get('slug'):
            manual_slug = validate_slug(meta['slug'])
            if manual_slug in used_post_slugs:
                raise ValueError(f"duplicate post slug: {manual_slug}")
            used_post_slugs.add(manual_slug)

        post_url = f"dist/p/{manual_slug}.html" if manual_slug else f"dist/p/{post_id}.html"

        # Title / keywords (prefer front matter title if provided)
        title, keywords = extract_metadata(md)
        if meta.get('title'):
            title = meta['title']

        blog_posts.append({
            "title": title or md.stem,
            "id": post_id,
            "slug": manual_slug,
            "url": post_url,
            "original_path": rel_html_legacy,
            "keywords": keywords
        })

        # map both md/html legacy references to new url
        legacy_to_new[rel_html_legacy] = post_url
        legacy_to_new["/" + rel_html_legacy] = post_url
        legacy_to_new[rel_md] = post_url
        legacy_to_new["/" + rel_md] = post_url

    # Directory legacy index mapping (notes/.../index.html -> /c/<id>/index.html)
    for d in flat_dirs:
        legacy_index = f"{d['path']}/index.html"
        legacy_to_new[legacy_index] = d["url"]
        legacy_to_new["/" + legacy_index] = d["url"]

    # Build helper: md -> post record
    id_to_post = {p["id"]: p for p in blog_posts}
    md_to_post: Dict[str, Dict] = {}
    for md in md_files:
        rel_md = str(md.relative_to(Config.ROOT_DIR))
        pid = stable_id(rel_md)
        md_to_post[rel_md] = id_to_post.get(pid)

    converted_ok = 0
    for md in md_files:
        rel_md = str(md.relative_to(Config.ROOT_DIR))
        post = md_to_post.get(rel_md)
        if not post:
            continue
        out_path = Config.ROOT_DIR / post["url"]
        try:
            if convert_markdown_to_html(md, out_path, legacy_to_new):
                converted_ok += 1
        except Exception as e:
            logger.error(f"转换失败: {md} - {e}")

    logger.info(f"文章页生成完成: {converted_ok}/{len(md_files)}")

    # Generate directory pages
    logger.info("=== 开始生成目录页 /c/<id>/index.html ===")
    dir_pages_ok = 0
    for d in flat_dirs:
        try:
            if generate_directory_page(d, legacy_to_new):
                dir_pages_ok += 1
        except Exception as e:
            logger.error(f"目录页生成失败 {d.get('path')}: {e}")
    logger.info(f"目录页生成完成: {dir_pages_ok}/{len(flat_dirs)}")

    logger.info(f"扫描完成: 导航 {len(nav_menu)}，文章 {len(blog_posts)}，目录节点 {len(flat_dirs)}")
    return nav_menu, blog_posts, directory_structure

def convert_all_markdown_files() -> None:
    """转换所有Markdown文件为HTML"""
    converted_count = 0
    failed_count = 0
    
    for root, _, files in os.walk(Config.NOTES_DIR):
        for file in files:
            if file.endswith('.md') and file != 'index.md':
                md_file_path = Path(root) / file
                try:
                    if convert_markdown_to_html(md_file_path):
                        converted_count += 1
                except Exception as e:
                    logger.error(f"转换失败: {md_file_path} - {e}")
                    failed_count += 1
    
    logger.info(f"转换完成: {converted_count} 个成功, {failed_count} 个失败")


def check_directory_has_html(directory: Path) -> bool:
    """
    检查目录下是否有.html文件（包括子目录）
    
    Args:
        directory: 目录路径
        
    Returns:
        bool: 是否包含HTML文件
    """
    try:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.endswith(".html"):
                    return True
    except (PermissionError, OSError) as e:
        logger.warning(f"无法访问目录 {directory}: {e}")
    
    return False


def scan_directory_structure(directory: Path) -> List[Dict]:
    """
    扫描目录结构，返回子目录列表（递归）
    
    Args:
        directory: 目录路径
        
    Returns:
        List[Dict]: 子目录列表
    """
    subdirs = []
    
    try:
        for item in sorted(directory.iterdir()):
            if not item.is_dir():
                continue
                
            dir_rel_path = str(item.relative_to(Config.ROOT_DIR))
            has_html = check_directory_has_html(item)
            subdirs_structure = scan_directory_structure(item)
            
            # 只有当目录本身有.html文件或有包含.html文件的子目录时才添加
            if has_html or subdirs_structure:
                subdirs.append({
                    "path": dir_rel_path,
                    "has_html": has_html,
                    "subdirs": subdirs_structure
                })
    except (PermissionError, OSError) as e:
        logger.warning(f"无法扫描目录 {directory}: {e}")
    
    return subdirs


def scan_blog_posts(directory: Path, blog_posts: List[Dict]) -> None:
    """
    扫描目录下的博客文章
    
    Args:
        directory: 目录路径
        blog_posts: 博客文章列表（会被修改）
    """
    processed_files = set()
    
    try:
        for root, _, files in os.walk(directory):
            for file in files:
                # 只处理.html文件，跳过index.html
                if not file.endswith('.html') or file.lower() == "index.html":
                    continue
                
                file_path = Path(root) / file
                file_rel_path = str(file_path.relative_to(Config.ROOT_DIR))
                
                # 确保每个.html文件只处理一次
                if file_rel_path in processed_files:
                    continue
                
                try:
                    # 提取标题和关键词
                    title, keywords = extract_metadata(file_path)
                    
                    # 添加到博客文章数据
                    blog_posts.append({
                        "title": title or file_path.stem,
                        "path": file_rel_path,
                        "keywords": keywords
                    })
                    
                    processed_files.add(file_rel_path)
                except Exception as e:
                    logger.warning(f"处理文章失败 {file_path}: {e}")
    except (PermissionError, OSError) as e:
        logger.error(f"扫描目录失败 {directory}: {e}")


def extract_metadata(file_path: Path) -> Tuple[Optional[str], List[str]]:
    """
    从文件中提取标题和关键词
    
    Args:
        file_path: 文件路径
        
    Returns:
        Tuple[Optional[str], List[str]]: 标题和关键词列表
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        title = None
        
        # 检测文件类型并提取标题
        if file_path.suffix == '.md':
            # Markdown格式：提取#标题
            title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
            if title_match:
                title = title_match.group(1).strip()
        elif file_path.suffix == '.html':
            # HTML格式：提取<h1>标题
            title_match = re.search(r'<h1[^>]*>(.+?)</h1>', content, re.IGNORECASE)
            if title_match:
                # 移除HTML标签和特殊字符
                title = re.sub(r'<[^>]+>', '', title_match.group(1))
                title = title.strip()
        
        # 提取关键词（传入内容以获得更好的结果）
        keywords = extract_keywords(title or '', content)
        
        return title, keywords
    except Exception as e:
        logger.warning(f"提取元数据失败: {file_path} - {e}")
        return file_path.stem, []


def convert_markdown_to_html(md_file_path: Path) -> Optional[Path]:
    """
    将Markdown文件转换为HTML文件
    
    Args:
        md_file_path: Markdown文件路径
        
    Returns:
        Optional[Path]: 转换后的HTML文件路径，失败返回None
    """
    # NOTE: kept for backward compatibility of API signature; new pipeline uses the
    # overloaded function signature below that writes to an ASCII-only output path.
    html_file_path = md_file_path.with_suffix('.html')
    temp_html_path = md_file_path.with_suffix('.temp.html')
    
    try:
        # 检查pandoc是否可用
        try:
            subprocess.run(['pandoc', '--version'], 
                         capture_output=True, 
                         check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.error("Pandoc未安装或不可用，请先安装pandoc")
            return None
        
        # 读取Markdown文件内容
        with open(md_file_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        # 提取标题
        title_match = re.search(r'^#\s+(.+)', md_content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else md_file_path.stem
        
        # 使用pandoc转换Markdown到HTML
        result = subprocess.run(
            ['pandoc', '-s', str(md_file_path), '-o', str(temp_html_path)],
            capture_output=True,
            text=True,
            timeout=30  # 30秒超时
        )
        
        if result.returncode != 0:
            logger.error(f"Pandoc转换失败: {result.stderr}")
            return None
        
        # 读取并提取转换后的HTML内容
        with open(temp_html_path, 'r', encoding='utf-8') as f:
            temp_html_content = f.read()
        
        # 提取<body>标签内的内容
        body_match = re.search(
            r'<body[^>]*>([\s\S]*?)</body>', 
            temp_html_content, 
            re.IGNORECASE
        )
        body_content = body_match.group(1) if body_match else temp_html_content
        
        # 读取模板文件
        if not Config.TEMPLATE_FILE.exists():
            logger.error(f"模板文件不存在: {Config.TEMPLATE_FILE}")
            return None
            
        with open(Config.TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            template_content = f.read()
        
        # 提取关键词
        keywords = extract_keywords(title, md_content)
        
        # 生成元数据（使用源md文件获取文件信息，因为html文件还不存在）
        metadata = generate_metadata_for_template(html_file_path, title, keywords, source_file=md_file_path)
        
        # 替换模板中的所有占位符
        final_html_content = template_content
        for key, value in metadata.items():
            final_html_content = final_html_content.replace(f'{{{{{key}}}}}', str(value))
        
        # 替换内容
        final_html_content = final_html_content.replace('{{content}}', body_content)
        
        # 写入最终的HTML文件
        with open(html_file_path, 'w', encoding='utf-8') as f:
            f.write(final_html_content)
        
        logger.info(f"✓ 转换完成: {md_file_path.name} -> {html_file_path.name}")
        return html_file_path
        
    except subprocess.TimeoutExpired:
        logger.error(f"转换超时: {md_file_path}")
        return None
    except Exception as e:
        logger.error(f"✗ 转换失败: {md_file_path} - {e}")
        return None
    finally:
        # 清理临时文件
        if temp_html_path.exists():
            try:
                temp_html_path.unlink()
            except Exception as e:
                logger.warning(f"清理临时文件失败: {e}")


def rewrite_internal_links(html_fragment: str, current_md: Path, legacy_to_new: Dict[str, str]) -> str:
    """
    Rewrite internal links pointing to notes/*.md or notes/*.html into ASCII-only /p/<id>.html or /c/<id>/index.html.
    """
    # Resolve relative href against current markdown directory
    current_rel_dir = Path(current_md.relative_to(Config.ROOT_DIR)).parent

    def resolve_candidate(href: str) -> Optional[str]:
        # strip query/hash for mapping
        base = href.split('#', 1)[0].split('?', 1)[0]
        if not base:
            return None
        if base.startswith(("http://", "https://", "mailto:", "tel:")):
            return None
        # absolute to site root
        if base.startswith("/"):
            return base.lstrip("/")
        # relative path
        try:
            # Use PurePosix-ish behavior with Path join then normalize
            resolved = (current_rel_dir / base).as_posix()
            # normalize ./ and ../ via Path
            resolved = str(Path(resolved))
            return resolved
        except Exception:
            return None

    # Replace href="..." and href='...'
    href_re = re.compile(r'''href=(["'])([^"']+)\1''', re.IGNORECASE)

    def repl(m):
        quote = m.group(1)
        href = m.group(2)
        candidate = resolve_candidate(href)
        if not candidate:
            return m.group(0)

        # If points to .md, map .md and also .html sibling
        candidates = [candidate]
        if candidate.endswith(".md"):
            candidates.append(candidate[:-3] + ".html")
        if candidate.endswith(".html"):
            candidates.append(candidate[:-5] + ".md")

        for c in candidates:
            if c in legacy_to_new:
                return f'href={quote}/{legacy_to_new[c]}{quote}'
            if ("/" + c) in legacy_to_new:
                return f'href={quote}/{legacy_to_new["/" + c]}{quote}'

        return m.group(0)

    return href_re.sub(repl, html_fragment)


def convert_markdown_to_html(md_file_path: Path, out_html_path: Path, legacy_to_new: Dict[str, str]) -> bool:
    """
    Convert a Markdown file to an HTML page at an explicit output path (ASCII-only URL),
    using the template and rewriting internal links based on legacy_to_new mapping.
    """
    temp_html_path = md_file_path.with_suffix('.temp.html')

    try:
        # Ensure output directories exist
        out_html_path.parent.mkdir(parents=True, exist_ok=True)

        with open(md_file_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        meta, md_content_wo_fm = parse_front_matter(md_content)

        # Title
        title = meta.get('title')
        if not title:
            title_match = re.search(r'^#\s+(.+)', md_content_wo_fm, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file_path.stem

        body_content = ""
        if pandoc_available():
            # Write a temp md without front matter to avoid leaking slug/title into content
            temp_md_path = md_file_path.with_suffix('.nofm.temp.md')
            try:
                with open(temp_md_path, 'w', encoding='utf-8') as f:
                    f.write(md_content_wo_fm)
            except Exception:
                temp_md_path = md_file_path

            # Convert to temp HTML
            result = subprocess.run(
                ['pandoc', '-s', str(temp_md_path), '-o', str(temp_html_path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode != 0:
                logger.error(f"Pandoc转换失败: {result.stderr}")
                body_content = ""
            else:
                with open(temp_html_path, 'r', encoding='utf-8') as f:
                    temp_html_content = f.read()
                body_match = re.search(r'<body[^>]*>([\s\S]*?)</body>', temp_html_content, re.IGNORECASE)
                body_content = body_match.group(1) if body_match else temp_html_content
        else:
            # Fallback: reuse existing legacy html content if present
            legacy_html_path = md_file_path.with_suffix('.html')
            if legacy_html_path.exists():
                body_content = extract_markdown_content_from_legacy_html(legacy_html_path)
            else:
                safe = re.sub(r'&', '&amp;', md_content)
                safe = re.sub(r'<', '&lt;', safe)
                body_content = f"<h1>{title}</h1><pre>{safe}</pre>"

        # Rewrite internal links to ASCII-only urls
        body_content = rewrite_internal_links(body_content, md_file_path, legacy_to_new)

        if not Config.TEMPLATE_FILE.exists():
            logger.error(f"模板文件不存在: {Config.TEMPLATE_FILE}")
            return False

        with open(Config.TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            template_content = f.read()

        keywords = extract_keywords(title, md_content_wo_fm)
        metadata = generate_metadata_for_template(out_html_path, title, keywords, source_file=md_file_path)

        final_html_content = template_content
        for key, value in metadata.items():
            final_html_content = final_html_content.replace(f'{{{{{key}}}}}', str(value))
        final_html_content = final_html_content.replace('{{content}}', body_content)

        with open(out_html_path, 'w', encoding='utf-8') as f:
            f.write(final_html_content)

        logger.info(f"✓ 生成: {md_file_path.relative_to(Config.ROOT_DIR)} -> {out_html_path.relative_to(Config.ROOT_DIR)}")
        return True
    except subprocess.TimeoutExpired:
        logger.error(f"转换超时: {md_file_path}")
        return False
    except Exception as e:
        logger.error(f"✗ 转换失败: {md_file_path} - {e}")
        return False
    finally:
        if temp_html_path.exists():
            try:
                temp_html_path.unlink()
            except Exception as e:
                logger.warning(f"清理临时文件失败: {e}")
        try:
            temp_md_path = md_file_path.with_suffix('.nofm.temp.md')
            if temp_md_path.exists():
                temp_md_path.unlink()
        except Exception:
            pass


def generate_directory_page(dir_node: Dict, legacy_to_new: Dict[str, str]) -> bool:
    """Generate a directory index page at /c/<id>/index.html."""
    out_path = Config.ROOT_DIR / dir_node["url"]
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Prefer existing legacy index.html content, then index.md content
    dir_abs = Config.ROOT_DIR / dir_node["path"]
    legacy_index_html = dir_abs / "index.html"
    index_md = dir_abs / "index.md"
    title = dir_node.get("name") or dir_abs.name
    description = f"{title} - {Config.SITE_NAME}"

    body_content = ""
    if legacy_index_html.exists():
        body_content = extract_markdown_content_from_legacy_html(legacy_index_html)
        body_content = rewrite_internal_links(body_content, legacy_index_html, legacy_to_new)

    if index_md.exists() and pandoc_available():
        # Convert index.md to HTML fragment
        temp_html_path = index_md.with_suffix(".temp.html")
        try:
            result = subprocess.run(
                ['pandoc', '-s', str(index_md), '-o', str(temp_html_path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0 and temp_html_path.exists():
                with open(temp_html_path, 'r', encoding='utf-8') as f:
                    temp_html_content = f.read()
                body_match = re.search(r'<body[^>]*>([\s\S]*?)</body>', temp_html_content, re.IGNORECASE)
                body_content = body_match.group(1) if body_match else temp_html_content
                body_content = rewrite_internal_links(body_content, index_md, legacy_to_new)
        except Exception:
            body_content = ""
        finally:
            if temp_html_path.exists():
                try:
                    temp_html_path.unlink()
                except Exception:
                    pass

    if not body_content:
        body_content = f"<h1>{title}</h1><p>{description}</p>"

    # Inject directory id marker for frontend rendering
    body_content = f'<div id="directory-page" data-dir-id="{dir_node["id"]}"></div>\n' + body_content

    with open(Config.TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template_content = f.read()

    metadata_source = index_md if index_md.exists() else (legacy_index_html if legacy_index_html.exists() else out_path)
    metadata = generate_metadata_for_template(out_path, title, [], source_file=metadata_source)

    final_html_content = template_content
    for key, value in metadata.items():
        final_html_content = final_html_content.replace(f'{{{{{key}}}}}', str(value))
    final_html_content = final_html_content.replace('{{content}}', body_content)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(final_html_content)
    return True


def extract_keywords(title: str, content: str = "") -> List[str]:
    """
    改进的关键词提取算法
    
    Args:
        title: 文章标题
        content: 文章内容（可选，用于更好的关键词提取）
        
    Returns:
        List[str]: 关键词列表
    """
    if not title:
        return []
    
    keywords = []
    seen: Set[str] = set()
    keyword_scores: Dict[str, int] = {}
    
    # 移除表情符号和特殊字符
    clean_title = re.sub(
        r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', 
        '', 
        title
    ).strip()
    
    if not clean_title:
        return []
    
    # 1. 提取核心主题词（高优先级）
    for topic in Config.CORE_TOPICS:
        # 不区分大小写匹配
        if topic.lower() in clean_title.lower():
            # 保留原始大小写
            for word in re.findall(r'\b\w+\b', clean_title):
                if word.lower() == topic.lower():
                    if word not in seen:
                        keyword_scores[word] = keyword_scores.get(word, 0) + 10
                        seen.add(word)
                    break
            else:
                # 如果没有找到精确匹配，使用配置中的版本
                if topic not in seen:
                    keyword_scores[topic] = keyword_scores.get(topic, 0) + 10
                    seen.add(topic)
    
    # 2. 提取英文术语（中等优先级）
    english_terms = re.findall(r'\b[A-Z][A-Za-z]+\b|\b[a-z]{4,}\b', clean_title)
    for term in english_terms:
        # 过滤停用词
        if term in Config.STOP_WORDS or term.lower() in Config.STOP_WORDS:
            continue
        
        if term not in seen and len(term) >= Config.MIN_KEYWORD_LENGTH:
            # 技术术语通常首字母大写或全小写
            if term[0].isupper() or len(term) > 4:
                keyword_scores[term] = keyword_scores.get(term, 0) + 5
                seen.add(term)
    
    # 3. 提取中文关键概念
    # 移除修饰词
    processed_title = clean_title
    for modifier in Config.MODIFIER_WORDS:
        processed_title = re.sub(rf'\b{modifier}\b', '', processed_title)
    processed_title = processed_title.strip()
    
    # 查找技术相关模式
    patterns = [
        (r'([^，。！？\s]{2,})(?:技术|框架|工具|平台|系统)', 1),  # 技术词汇
        (r'(?:使用|运行|配置|安装)\s*([^，。！？\s]{2,})', 1),  # 操作对象
        (r'([A-Z][a-z]+(?:[A-Z][a-z]+)*)', 0),  # 驼峰命名
    ]
    
    for pattern, group in patterns:
        matches = re.findall(pattern, clean_title)
        for match in matches:
            keyword = match if isinstance(match, str) else match[group]
            keyword = keyword.strip()
            
            # 过滤停用词和已见关键词
            if (keyword and 
                keyword not in Config.STOP_WORDS and
                keyword not in Config.MODIFIER_WORDS and
                len(keyword) >= Config.MIN_KEYWORD_LENGTH and 
                keyword not in seen):
                keyword_scores[keyword] = keyword_scores.get(keyword, 0) + 3
                seen.add(keyword)
    
    # 4. 简单的中文分词（基于常见分隔符）
    chinese_parts = re.split(r'[，。！？、\s]+', processed_title)
    for part in chinese_parts:
        # 提取纯中文词汇
        chinese_words = re.findall(r'[\u4e00-\u9fff]{2,}', part)
        for word in chinese_words:
            if (word not in Config.STOP_WORDS and 
                word not in Config.MODIFIER_WORDS and
                len(word) >= Config.MIN_KEYWORD_LENGTH and 
                word not in seen):
                keyword_scores[word] = keyword_scores.get(word, 0) + 2
                seen.add(word)
    
    # 按分数排序并返回前N个关键词
    sorted_keywords = sorted(
        keyword_scores.items(), 
        key=lambda x: x[1], 
        reverse=True
    )
    
    keywords = [kw for kw, score in sorted_keywords[:Config.MAX_KEYWORDS_PER_POST]]
    
    # 如果关键词太少，添加标题中的主要词汇
    if len(keywords) < 2:
        words = re.findall(r'[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}', clean_title)
        for word in words:
            if (word not in Config.STOP_WORDS and 
                word not in seen and 
                len(keywords) < Config.MAX_KEYWORDS_PER_POST):
                keywords.append(word)
                seen.add(word)
    
    return keywords[:Config.MAX_KEYWORDS_PER_POST]


def generate_sitemap(blog_posts: List[Dict]) -> None:
    """
    生成sitemap.xml文件
    
    Args:
        blog_posts: 博客文章列表
    """
    logger.info("开始生成sitemap.xml...")
    
    # 创建XML根元素
    urlset = ET.Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    
    # 添加首页
    url = ET.SubElement(urlset, 'url')
    ET.SubElement(url, 'loc').text = f"{Config.SITE_URL}/"
    ET.SubElement(url, 'changefreq').text = 'daily'
    ET.SubElement(url, 'priority').text = '1.0'
    ET.SubElement(url, 'lastmod').text = datetime.now().strftime('%Y-%m-%d')
    
    # 添加所有博客文章（ASCII-only URL 优先）
    for post in blog_posts:
        url = ET.SubElement(urlset, 'url')
        rel = post.get('url') or post.get('path')
        post_url = f"{Config.SITE_URL}/{rel}"
        ET.SubElement(url, 'loc').text = post_url
        ET.SubElement(url, 'changefreq').text = 'weekly'
        ET.SubElement(url, 'priority').text = '0.8'
        
        # 获取文件修改时间
        file_path = Config.ROOT_DIR / rel
        if file_path.exists():
            mod_time = datetime.fromtimestamp(file_path.stat().st_mtime)
            ET.SubElement(url, 'lastmod').text = mod_time.strftime('%Y-%m-%d')
    
    # 美化XML输出
    xml_str = minidom.parseString(ET.tostring(urlset)).toprettyxml(indent="  ")
    
    # 移除空行
    xml_str = '\n'.join([line for line in xml_str.split('\n') if line.strip()])
    
    # 保存sitemap.xml
    with open(Config.SITEMAP_FILE, 'w', encoding='utf-8') as f:
        f.write(xml_str)
    
    logger.info(f"✅ Sitemap生成完成: {Config.SITEMAP_FILE}")


def generate_rss_feed(blog_posts: List[Dict]) -> None:
    """
    生成RSS feed
    
    Args:
        blog_posts: 博客文章列表
    """
    logger.info("开始生成RSS feed...")
    
    # 创建RSS根元素
    rss = ET.Element('rss')
    rss.set('version', '2.0')
    rss.set('xmlns:atom', 'http://www.w3.org/2005/Atom')
    
    channel = ET.SubElement(rss, 'channel')
    ET.SubElement(channel, 'title').text = Config.SITE_NAME
    ET.SubElement(channel, 'link').text = Config.SITE_URL
    ET.SubElement(channel, 'description').text = Config.SITE_DESCRIPTION
    ET.SubElement(channel, 'language').text = 'zh-CN'
    ET.SubElement(channel, 'lastBuildDate').text = datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')
    
    # 添加atom:link
    atom_link = ET.SubElement(channel, 'atom:link')
    atom_link.set('href', f"{Config.SITE_URL}/rss.xml")
    atom_link.set('rel', 'self')
    atom_link.set('type', 'application/rss+xml')
    
    # 按修改时间排序文章（最新的在前）
    def post_mtime(p: Dict) -> float:
        rel = p.get('url') or p.get('path')
        fp = Config.ROOT_DIR / rel
        return fp.stat().st_mtime if fp.exists() else 0

    sorted_posts = sorted(blog_posts, key=post_mtime, reverse=True)
    
    # 只包含最近的20篇文章
    for post in sorted_posts[:20]:
        item = ET.SubElement(channel, 'item')
        ET.SubElement(item, 'title').text = post['title']
        
        rel = post.get('url') or post.get('path')
        post_url = f"{Config.SITE_URL}/{rel}"
        ET.SubElement(item, 'link').text = post_url
        ET.SubElement(item, 'guid').text = post_url
        
        # 生成描述（包含关键词）
        if post.get('keywords'):
            description = f"关键词: {', '.join(post['keywords'])}"
            ET.SubElement(item, 'description').text = description
        
        # 添加分类（使用关键词）
        for keyword in post.get('keywords', []):
            ET.SubElement(item, 'category').text = keyword
        
        # 添加发布日期
        file_path = Config.ROOT_DIR / rel
        if file_path.exists():
            pub_date = datetime.fromtimestamp(file_path.stat().st_mtime)
            ET.SubElement(item, 'pubDate').text = pub_date.strftime('%a, %d %b %Y %H:%M:%S +0000')
    
    # 美化XML输出
    xml_str = minidom.parseString(ET.tostring(rss)).toprettyxml(indent="  ")
    
    # 移除空行
    xml_str = '\n'.join([line for line in xml_str.split('\n') if line.strip()])
    
    # 保存RSS文件
    with open(Config.RSS_FILE, 'w', encoding='utf-8') as f:
        f.write(xml_str)
    
    logger.info(f"✅ RSS Feed生成完成: {Config.RSS_FILE}")


def generate_metadata_for_template(file_path: Path, title: str, keywords: List[str], source_file: Path = None) -> Dict[str, str]:
    """
    为模板生成元数据
    
    Args:
        file_path: 目标文件路径
        title: 标题
        keywords: 关键词列表
        source_file: 源文件路径（用于获取文件信息，如果目标文件不存在）
        
    Returns:
        Dict[str, str]: 元数据字典
    """
    # 生成描述
    description = f"{title} - "
    if keywords:
        description += f"关键词: {', '.join(keywords[:3])}"
    else:
        description += Config.SITE_DESCRIPTION
    
    # 获取文件信息（优先使用源文件，因为目标文件可能还不存在）
    stat_file = source_file if source_file and source_file.exists() else file_path
    if stat_file.exists():
        stat = stat_file.stat()
        created_date = datetime.fromtimestamp(stat.st_ctime)
        modified_date = datetime.fromtimestamp(stat.st_mtime)
    else:
        created_date = datetime.now()
        modified_date = datetime.now()
    
    # 相对路径
    rel_path = file_path.relative_to(Config.ROOT_DIR)
    
    return {
        'title': title,
        'description': description[:160],  # 限制描述长度
        'keywords': ', '.join(keywords),
        'date': created_date.isoformat(),
        'modified_date': modified_date.isoformat(),
        'path': str(rel_path)
    }


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='导航数据自动生成工具')
    parser.add_argument('--no-sitemap', action='store_true', help='不生成sitemap.xml')
    parser.add_argument('--no-rss', action='store_true', help='不生成RSS feed')
    parser.add_argument('--verbose', '-v', action='store_true', help='详细输出模式')
    parser.add_argument('--slugs-report', action='store_true', help='输出 slug 检查报告（缺失/非法/重复）并退出')
    
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    print("=== 导航数据自动生成工具 ===")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Slug report mode (no build)
    if args.slugs_report:
        md_files = collect_markdown_posts()
        return slug_report(md_files)
    
    # 扫描目录结构
    nav_menu, blog_posts, directory_structure = scan_notes_directory()
    
    # 生成导航数据
    nav_data = {
        "nav_menu": nav_menu,
        "blog_posts": blog_posts,
        "directory_structure": directory_structure,
        "generated_at": datetime.now().timestamp()
    }
    
    # 保存为JSON文件
    with open(Config.OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(nav_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ 导航数据已保存: {Config.OUTPUT_FILE}")
    
    # 生成sitemap.xml
    if not args.no_sitemap:
        try:
            generate_sitemap(blog_posts)
        except Exception as e:
            logger.error(f"❌ Sitemap生成失败: {e}")
    
    # 生成RSS feed
    if not args.no_rss:
        try:
            generate_rss_feed(blog_posts)
        except Exception as e:
            logger.error(f"❌ RSS生成失败: {e}")
    
    # 输出统计信息
    print(f"\n{'='*50}")
    print("生成完成！")
    print(f"{'='*50}")
    print(f"📁 导航菜单数量: {len(nav_menu)}")
    print(f"📝 博客文章数量: {len(blog_posts)}")
    print(f"🗂️  目录结构数量: {len(directory_structure)}")
    print(f"\n输出文件:")
    print(f"  • {Config.OUTPUT_FILE}")
    if not args.no_sitemap:
        print(f"  • {Config.SITEMAP_FILE}")
    if not args.no_rss:
        print(f"  • {Config.RSS_FILE}")
    print(f"\n完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    return 0  # 成功返回 0


if __name__ == "__main__":
    raise SystemExit(main())
