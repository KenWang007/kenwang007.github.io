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
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".md") or file.endswith(".html"):
                # 跳过index.html和index.md
                if file.lower() == "index.html" or file.lower() == "index.md":
                    continue
                
                file_path = Path(root) / file
                file_rel_path = str(file_path.relative_to(ROOT_DIR))
                
                # 如果是.md文件，检查对应的.html文件是否存在
                if file_rel_path.endswith('.md'):
                    html_path = file_rel_path[:-3] + '.html'
                    html_file = ROOT_DIR / html_path
                    # 如果对应的.html文件不存在，跳过这个.md文件
                    if not html_file.exists():
                        continue
                    file_rel_path = html_path
                elif not file_rel_path.endswith('.html'):
                    # 既不是.md也不是.html文件，跳过
                    continue
                
                # 提取标题和关键词
                title, keywords = extract_metadata(file_path)
                
                # 添加到博客文章数据
                blog_posts.append({
                    "title": title or file_path.stem,
                    "path": file_rel_path,
                    "keywords": keywords
                })


def extract_metadata(file_path):
    """从文件中提取标题和关键词"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 提取标题（Markdown格式）
        title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
        title = title_match.group(1) if title_match else None
        
        # 提取关键词（从标题和内容中）
        keywords = extract_keywords(content, title)
        
        return title, keywords
    except Exception as e:
        print(f"提取文件元数据失败: {file_path} - {e}")
        return file_path.stem, []


def extract_keywords(content, title=None):
    """从内容中提取关键词"""
    # 停用词列表，排除无意义的单词
    stop_words = {
        # 数字和序号
        '1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.', '10.',
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
        
        # 常用无意义单词
        'is', 'in', 'to', 'the', 'of', 'and', 'a', 'an', 'for', 'on',
        'with', 'by', 'at', 'from', 'as', 'was', 'were', 'are', 'be',
        'what', 'how', 'use', 'local', 'cursor', 'delivery',
        'run', 'open', 'web', 'ui', 'python', 'learning', 
        '变量', '数据', '类型', 'devs', 'does', 'help', 'can',
        '10', '加载文档', '创建检索链', '创建查询引擎', '向量化并存储', '创建索引',
        
        # 动词和常见短语
        '提取', '生成', '更新', '使用', '创建', '加载', '运行', '打开',
        '设置', '配置', '安装', '部署', '测试', '开发', '实现',
        '学习', '研究', '分析', '思考', '总结', '介绍', '说明',
        '详细', '全面', '技术', '方法', '步骤', '过程', '原理',
        '架构', '设计', '实现', '功能', '特性', '优势', '劣势',
        '应用', '场景', '案例', '实践', '经验', '技巧', '建议',
        '问题', '解决方案', '挑战', '趋势', '未来', '发展', '前景'
    }
    
    keywords = set()
    
    # 从标题提取关键词
    if title:
        # 移除表情符号
        clean_title = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', title)
        
        # 直接将整个标题作为关键词（如果有意义）
        if len(clean_title) > 2 and clean_title.lower() not in stop_words:
            keywords.add(clean_title)
    
    # 从内容中提取关键词
    if content:
        # 提取H1-H3标题
        headers = re.findall(r'^(#{1,3})\s+(.+)$', content, re.MULTILINE)
        for level, header in headers:
            # 移除表情符号
            clean_header = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', header)
            
            # 跳过无意义的标题
            if len(clean_header) <= 2 or clean_header.lower() in stop_words:
                continue
            
            # 直接将标题作为关键词（如果是主要标题）
            if level == '#':
                keywords.add(clean_header)
            else:
                # 对于次级标题，提取核心主题词
                header_parts = re.split(r'[\s,，.。:：;；!?！？]+', clean_header)
                for part in header_parts:
                    part = part.strip()
                    if len(part) > 2 and part.lower() not in stop_words:
                        keywords.add(part)
    
    # 特殊处理：移除过于通用的关键词
    final_keywords = []
    for keyword in keywords:
        # 移除包含数字的关键词
        if re.search(r'\d', keyword):
            continue
        # 移除过于简短的关键词
        if len(keyword) <= 2:
            continue
        # 移除过于通用的关键词
        if keyword in ['什么', '如何', '使用', '安装', '配置', '教程', '指南', '基础', '进阶']:
            continue
        final_keywords.append(keyword)
    
    return final_keywords


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
