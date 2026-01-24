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


def scan_notes_directory() -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    扫描notes目录结构
    
    Returns:
        Tuple[List[Dict], List[Dict], List[Dict]]: 
            导航菜单数据、博客文章数据、目录结构数据
    """
    logger.info("开始扫描notes目录...")
    
    # 1. 首先将所有Markdown文件转换为HTML
    logger.info("=== 开始转换Markdown到HTML ===")
    convert_all_markdown_files()
    
    # 初始化数据结构
    nav_menu = []
    blog_posts = []
    directory_structure = []
    
    # 检查notes目录是否存在
    if not Config.NOTES_DIR.exists():
        logger.warning(f"Notes目录不存在: {Config.NOTES_DIR}")
        return nav_menu, blog_posts, directory_structure
    
    # 扫描一级目录
    for dir_path in sorted(Config.NOTES_DIR.iterdir()):
        if not dir_path.is_dir():
            continue
            
        dir_name = dir_path.name
        dir_rel_path = str(dir_path.relative_to(Config.ROOT_DIR))
        
        # 检查目录下是否有.html文件（包括子目录）
        has_html = check_directory_has_html(dir_path)
        
        # 扫描子目录结构
        subdirs = scan_directory_structure(dir_path)
        
        # 只有当目录本身有.html文件或有包含.html文件的子目录时才添加到导航
        if has_html or subdirs:
            nav_menu.append({
                "name": dir_name,
                "path": dir_rel_path
            })
        
        # 添加到目录结构
        directory_structure.append({
            "path": dir_rel_path,
            "has_html": has_html,
            "subdirs": subdirs
        })
        
        # 扫描目录下的博客文章
        scan_blog_posts(dir_path, blog_posts)
    
    logger.info(f"扫描完成: 找到 {len(nav_menu)} 个导航项, {len(blog_posts)} 篇文章")
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
        
        # 生成元数据
        metadata = generate_metadata_for_template(html_file_path, title, keywords)
        
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
    
    # 添加所有博客文章
    for post in blog_posts:
        url = ET.SubElement(urlset, 'url')
        post_url = f"{Config.SITE_URL}/{post['path']}"
        ET.SubElement(url, 'loc').text = post_url
        ET.SubElement(url, 'changefreq').text = 'weekly'
        ET.SubElement(url, 'priority').text = '0.8'
        
        # 获取文件修改时间
        file_path = Config.ROOT_DIR / post['path']
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
    sorted_posts = sorted(
        blog_posts,
        key=lambda p: Config.ROOT_DIR / p['path'] if (Config.ROOT_DIR / p['path']).exists() else 0,
        reverse=True
    )
    
    # 只包含最近的20篇文章
    for post in sorted_posts[:20]:
        item = ET.SubElement(channel, 'item')
        ET.SubElement(item, 'title').text = post['title']
        
        post_url = f"{Config.SITE_URL}/{post['path']}"
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
        file_path = Config.ROOT_DIR / post['path']
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


def generate_metadata_for_template(file_path: Path, title: str, keywords: List[str]) -> Dict[str, str]:
    """
    为模板生成元数据
    
    Args:
        file_path: 文件路径
        title: 标题
        keywords: 关键词列表
        
    Returns:
        Dict[str, str]: 元数据字典
    """
    # 生成描述
    description = f"{title} - "
    if keywords:
        description += f"关键词: {', '.join(keywords[:3])}"
    else:
        description += Config.SITE_DESCRIPTION
    
    # 获取文件信息
    stat = file_path.stat()
    created_date = datetime.fromtimestamp(stat.st_ctime)
    modified_date = datetime.fromtimestamp(stat.st_mtime)
    
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
    
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    print("=== 导航数据自动生成工具 ===")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
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
    
    return nav_data


if __name__ == "__main__":
    main()
