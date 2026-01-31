#!/usr/bin/env python3
"""导航数据自动生成脚本（基于 site_builder 模块化管道）。"""

import argparse
import json
import logging
from datetime import datetime
from typing import Any, Dict

from site_builder import config
from site_builder.feeds import generate_rss_feed, generate_sitemap
from site_builder.renderers import convert_markdown_to_html, generate_directory_page
from site_builder.scanner import collect_markdown_posts, scan_notes_structure, slug_report


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def build_site(args: argparse.Namespace) -> Dict[str, Any]:
    md_files = collect_markdown_posts()
    if args.slugs_report:
        raise SystemExit(slug_report(md_files))

    scan_result = scan_notes_structure(md_files)

    converted_ok = 0
    for md in scan_result.md_files:
        rel_md = str(md.relative_to(scan_result.root_dir))
        post = scan_result.md_to_post.get(rel_md)
        if not post:
            continue
        out_path = config.ROOT_DIR / post["url"]
        if convert_markdown_to_html(md, out_path, scan_result.legacy_to_new):
            converted_ok += 1
    logger.info("文章页生成完成: %s/%s", converted_ok, len(scan_result.md_files))

    dir_pages_ok = 0
    for directory in scan_result.flat_directories:
        if generate_directory_page(directory, scan_result.legacy_to_new):
            dir_pages_ok += 1
    logger.info("目录页生成完成: %s/%s", dir_pages_ok, len(scan_result.flat_directories))

    nav_data = {
        "nav_menu": scan_result.nav_menu,
        "blog_posts": scan_result.blog_posts,
        "directory_structure": scan_result.directory_structure,
        "generated_at": datetime.now().timestamp(),
    }
    config.OUTPUT_FILE.write_text(json.dumps(nav_data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("✅ 导航数据已保存: %s", config.OUTPUT_FILE)

    if not args.no_sitemap:
        generate_sitemap(scan_result.blog_posts)
    if not args.no_rss:
        generate_rss_feed(scan_result.blog_posts)

    return nav_data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导航数据自动生成工具")
    parser.add_argument("--no-sitemap", action="store_true", help="不生成sitemap.xml")
    parser.add_argument("--no-rss", action="store_true", help="不生成RSS feed")
    parser.add_argument("--verbose", "-v", action="store_true", help="详细输出模式")
    parser.add_argument("--slugs-report", action="store_true", help="输出 slug 检查报告（缺失/非法/重复）并退出")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.verbose:
        logger.setLevel(logging.DEBUG)

    print("=== 导航数据自动生成工具 ===")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    nav_data = build_site(args)

    print("\n" + "=" * 50)
    print("生成完成！")
    print("=" * 50)
    print(f"📁 导航菜单数量: {len(nav_data['nav_menu'])}")
    print(f"📝 博客文章数量: {len(nav_data['blog_posts'])}")
    print(f"🗂️  目录结构数量: {len(nav_data['directory_structure'])}")
    print("\n输出文件:")
    print(f"  • {config.OUTPUT_FILE}")
    if not args.no_sitemap:
        print(f"  • {config.SITEMAP_FILE}")
    if not args.no_rss:
        print(f"  • {config.RSS_FILE}")
    print(f"\n完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
