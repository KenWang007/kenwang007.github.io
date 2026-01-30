"""Sitemap and RSS feed generation helpers."""
from __future__ import annotations

import logging
from datetime import datetime
import xml.etree.ElementTree as ET
from typing import Dict, List
from xml.dom import minidom

from . import config

logger = logging.getLogger(__name__)


def generate_sitemap(blog_posts: List[Dict]) -> None:
    logger.info("开始生成sitemap.xml...")

    urlset = ET.Element("urlset")
    urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")

    url = ET.SubElement(urlset, "url")
    ET.SubElement(url, "loc").text = f"{config.SITE_URL}/"
    ET.SubElement(url, "changefreq").text = "daily"
    ET.SubElement(url, "priority").text = "1.0"
    ET.SubElement(url, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    for post in blog_posts:
        url = ET.SubElement(urlset, "url")
        rel = post.get("url") or post.get("path")
        post_url = f"{config.SITE_URL}/{rel}"
        ET.SubElement(url, "loc").text = post_url
        ET.SubElement(url, "changefreq").text = "weekly"
        ET.SubElement(url, "priority").text = "0.8"
        file_path = config.ROOT_DIR / rel
        if file_path.exists():
            mod_time = datetime.fromtimestamp(file_path.stat().st_mtime)
            ET.SubElement(url, "lastmod").text = mod_time.strftime("%Y-%m-%d")

    xml_str = minidom.parseString(ET.tostring(urlset)).toprettyxml(indent="  ")
    xml_str = "\n".join([line for line in xml_str.split("\n") if line.strip()])
    config.SITEMAP_FILE.write_text(xml_str, encoding="utf-8")
    logger.info("✅ Sitemap生成完成: %s", config.SITEMAP_FILE)


def generate_rss_feed(blog_posts: List[Dict]) -> None:
    logger.info("开始生成RSS feed...")

    rss = ET.Element("rss")
    rss.set("version", "2.0")
    rss.set("xmlns:atom", "http://www.w3.org/2005/Atom")

    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = config.SITE_NAME
    ET.SubElement(channel, "link").text = config.SITE_URL
    ET.SubElement(channel, "description").text = config.SITE_DESCRIPTION
    ET.SubElement(channel, "language").text = "zh-CN"
    ET.SubElement(channel, "lastBuildDate").text = datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0000")

    atom_link = ET.SubElement(channel, "atom:link")
    atom_link.set("href", f"{config.SITE_URL}/rss.xml")
    atom_link.set("rel", "self")
    atom_link.set("type", "application/rss+xml")

    def post_mtime(post: Dict) -> float:
        rel = post.get("url") or post.get("path")
        file_path = config.ROOT_DIR / rel
        return file_path.stat().st_mtime if file_path.exists() else 0

    sorted_posts = sorted(blog_posts, key=post_mtime, reverse=True)

    for post in sorted_posts[:20]:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = post["title"]
        rel = post.get("url") or post.get("path")
        post_url = f"{config.SITE_URL}/{rel}"
        ET.SubElement(item, "link").text = post_url
        ET.SubElement(item, "guid").text = post_url
        if post.get("keywords"):
            description = f"关键词: {', '.join(post['keywords'])}"
            ET.SubElement(item, "description").text = description
        for keyword in post.get("keywords", []):
            ET.SubElement(item, "category").text = keyword
        file_path = config.ROOT_DIR / rel
        if file_path.exists():
            pub_date = datetime.fromtimestamp(file_path.stat().st_mtime)
            ET.SubElement(item, "pubDate").text = pub_date.strftime("%a, %d %b %Y %H:%M:%S +0000")

    xml_str = minidom.parseString(ET.tostring(rss)).toprettyxml(indent="  ")
    xml_str = "\n".join([line for line in xml_str.split("\n") if line.strip()])
    config.RSS_FILE.write_text(xml_str, encoding="utf-8")
    logger.info("✅ RSS Feed生成完成: %s", config.RSS_FILE)
