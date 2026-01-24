#!/usr/bin/env python3
"""
导航数据自动生成脚本
用于扫描notes目录结构，生成导航菜单和博客文章数据
"""

import os
import json
import re
from pathlib import Path

# 项目根目录
ROOT_DIR = Path(__file__).parent
# Notes目录
NOTES_DIR = ROOT_DIR / "notes"
# 输出JSON文件
OUTPUT_FILE = ROOT_DIR / "nav_data.json"


def scan_notes_directory():
    """扫描notes目录结构"""
    print("开始扫描notes目录...")
    
    # 导航菜单数据
    nav_menu = []
    # 博客文章数据
    blog_posts = []
    # 目录结构数据
    directory_structure = []
    
    # 扫描一级目录
    for dir_path in sorted(NOTES_DIR.iterdir()):
        if dir_path.is_dir():
            dir_name = dir_path.name
            dir_rel_path = str(dir_path.relative_to(ROOT_DIR))
            
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
    
    return nav_menu, blog_posts, directory_structure


def check_directory_has_html(directory):
    """检查目录下是否有.html文件（包括子目录）"""
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".html"):
                return True
    return False


def scan_directory_structure(directory):
    """扫描目录结构，返回子目录列表"""
    subdirs = []
    
    try:
        for item in sorted(directory.iterdir()):
            if item.is_dir():
                dir_rel_path = str(item.relative_to(ROOT_DIR))
                has_html = check_directory_has_html(item)
                subdirs_structure = scan_directory_structure(item)
                
                # 只有当目录本身有.html文件或有包含.html文件的子目录时才添加
                if has_html or subdirs_structure:
                    subdirs.append({
                        "path": dir_rel_path,
                        "has_html": has_html,
                        "subdirs": subdirs_structure
                    })
    except PermissionError:
        pass
    
    return subdirs


def scan_blog_posts(directory, blog_posts):
    """扫描目录下的博客文章"""
    processed_files = set()
    
    for root, _, files in os.walk(directory):
        for file in files:
            file_path = Path(root) / file
            file_rel_path = str(file_path.relative_to(ROOT_DIR))
            
            # 只处理.html文件
            if file_rel_path.endswith('.html'):
                # 跳过index.html
                if file.lower() == "index.html":
                    continue
                
                # 确保每个.html文件只处理一次
                if file_rel_path not in processed_files:
                    # 提取标题和关键词
                    title, keywords = extract_metadata(file_path)
                    
                    # 添加到博客文章数据
                    blog_posts.append({
                        "title": title or file_path.stem,
                        "path": file_rel_path,
                        "keywords": keywords
                    })
                    
                    processed_files.add(file_rel_path)


def extract_metadata(file_path):
    """从文件中提取标题和关键词"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        title = None
        
        # 检测文件类型并提取标题
        if file_path.suffix == '.md':
            # Markdown格式：提取#标题
            title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
            if title_match:
                title = title_match.group(1)
        elif file_path.suffix == '.html':
            # HTML格式：提取<h1>标题
            title_match = re.search(r'<h1[^>]*>(.+?)</h1>', content, re.IGNORECASE)
            if title_match:
                # 移除HTML标签和特殊字符
                title = re.sub(r'<[^>]+>', '', title_match.group(1))
                # 移除多余空格
                title = title.strip()
        
        # 提取关键词（从标题和内容中）
        keywords = extract_keywords(content, title)
        
        return title, keywords
    except Exception as e:
        print(f"提取文件元数据失败: {file_path} - {e}")
        return file_path.stem, []


def extract_keywords(content, title=None):
    """只从文章标题提取关键词"""
    # 核心主题词优先级（这些词如果出现，应该优先作为关键词）
    core_topics = {
        'RAG', '检索增强生成', 'LLM', '大型语言模型', '向量数据库',
        '嵌入模型', '知识管理', '客户服务', '学术研究', '多模态',
        '自适应检索', '实时更新', '跨语言', '轻量化'
    }
    
    # 从标题提取关键词
    final_keywords = []
    seen_keywords = set()
    
    if title:
        # 移除表情符号
        clean_title = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', title)
        
        # 1. 首先查找标题中是否包含核心主题词
        for topic in core_topics:
            if topic in clean_title and topic not in seen_keywords:
                final_keywords.append(topic)
                seen_keywords.add(topic)
                if len(final_keywords) >= 2:
                    return final_keywords
        
        # 2. 如果标题中包含英文缩写，提取出来作为关键词
        # 例如："RAG技术全面介绍" -> "RAG"
        english_terms = re.findall(r'[A-Za-z]+', clean_title)
        for term in english_terms:
            if len(term) > 1 and term not in seen_keywords:  # 忽略单个字母和重复项
                final_keywords.append(term)
                seen_keywords.add(term)
                if len(final_keywords) >= 2:
                    return final_keywords
        
        # 3. 提取标题中的核心概念组合
        # 例如："RAG技术全面介绍" -> "技术介绍"
        # 移除常见修饰词
        modifiers = ['全面', '详细', '深入', '最新', '完整', '简明', '快速', '实战', '入门', '进阶', '高级']
        processed_title = clean_title
        for modifier in modifiers:
            processed_title = processed_title.replace(modifier, '')
        
        # 提取有意义的概念组合
        # 中文标题常见模式：[主题] + [技术/方法/工具] + [介绍/教程/指南]
        concepts = []
        
        # 提取"技术"相关组合
        if '技术' in processed_title:
            tech_index = processed_title.find('技术')
            # 提取"技术"后面的内容
            after_tech = processed_title[tech_index:]
            if after_tech and after_tech not in seen_keywords:
                concepts.append(after_tech)
        
        # 提取"介绍"相关组合
        if '介绍' in processed_title:
            intro_index = processed_title.find('介绍')
            # 提取"介绍"前面的内容
            before_intro = processed_title[:intro_index+2]  # 包括"介绍"
            if before_intro and before_intro not in seen_keywords:
                concepts.append(before_intro)
        
        # 提取"学习"相关组合
        if '学习' in processed_title:
            learn_index = processed_title.find('学习')
            # 提取"学习"前面的内容
            before_learn = processed_title[:learn_index+2]  # 包括"学习"
            if before_learn and before_learn not in seen_keywords:
                concepts.append(before_learn)
        
        # 添加提取的概念到关键词列表
        for concept in concepts:
            if concept not in seen_keywords:
                final_keywords.append(concept)
                seen_keywords.add(concept)
                if len(final_keywords) >= 2:
                    return final_keywords
        
        # 4. 最后，如果关键词不足，使用标题中的主要主题词
        if len(final_keywords) < 2:
            # 尝试提取标题的前半部分和后半部分作为不同关键词
            if len(clean_title) > 6:
                parts = clean_title.split()
                if len(parts) >= 2:
                    for part in parts:
                        if part and len(part) > 2 and part not in seen_keywords:
                            final_keywords.append(part)
                            seen_keywords.add(part)
                            if len(final_keywords) >= 2:
                                return final_keywords
                else:
                    # 对于没有空格的长标题，拆分为两部分
                    mid = len(clean_title) // 2
                    part1 = clean_title[:mid].strip()
                    part2 = clean_title[mid:].strip()
                    
                    for part in [part1, part2]:
                        if part and len(part) > 2 and part not in seen_keywords:
                            final_keywords.append(part)
                            seen_keywords.add(part)
                            if len(final_keywords) >= 2:
                                return final_keywords
    
    # 最终返回最多2个关键词
    return final_keywords[:2]


def main():
    """主函数"""
    print("=== 导航数据自动生成工具 ===")
    
    # 扫描目录结构
    nav_menu, blog_posts, directory_structure = scan_notes_directory()
    
    # 生成导航数据
    nav_data = {
        "nav_menu": nav_menu,
        "blog_posts": blog_posts,
        "directory_structure": directory_structure,
        "generated_at": os.path.getmtime(__file__)
    }
    
    # 保存为JSON文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(nav_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n生成完成！")
    print(f"导航菜单数量: {len(nav_menu)}")
    print(f"博客文章数量: {len(blog_posts)}")
    print(f"目录结构数量: {len(directory_structure)}")
    print(f"输出文件: {OUTPUT_FILE}")
    
    return nav_data


if __name__ == "__main__":
    main()
