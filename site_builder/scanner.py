"""Scanning utilities for notes directory and slug validation."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from . import config
from .utils import extract_keywords, parse_front_matter, stable_id, validate_slug

logger = logging.getLogger(__name__)


@dataclass
class ScanResult:
    nav_menu: List[Dict]
    blog_posts: List[Dict]
    directory_structure: List[Dict]
    flat_directories: List[Dict]
    legacy_to_new: Dict[str, str]
    md_to_post: Dict[str, Dict]
    md_files: List[Path]
    root_dir: Path
    notes_dir: Path


def collect_markdown_posts(notes_dir: Optional[Path] = None) -> List[Path]:
    notes_dir = notes_dir or config.NOTES_DIR
    md_files: List[Path] = []
    for root, _, files in os.walk(notes_dir):
        for file in files:
            if file.endswith(".md") and file != "index.md":
                md_files.append(Path(root) / file)
    return sorted(md_files)


def slug_report(md_files: List[Path], root_dir: Optional[Path] = None, notes_dir: Optional[Path] = None) -> int:
    root_dir = root_dir or config.ROOT_DIR
    notes_dir = notes_dir or config.NOTES_DIR
    missing_posts: List[Tuple[str, str]] = []
    invalid_posts: List[Tuple[str, str]] = []
    dup_posts: Dict[str, List[str]] = {}

    missing_dirs: List[Tuple[str, str]] = []
    invalid_dirs: List[Tuple[str, str]] = []
    dup_dirs: Dict[str, List[str]] = {}

    seen_post: Dict[str, List[str]] = {}
    seen_dir: Dict[str, List[str]] = {}

    for md in md_files:
        rel_md = str(md.relative_to(root_dir))
        text = md.read_text(encoding="utf-8")
        meta, _ = parse_front_matter(text)
        slug = meta.get("slug")
        if not slug:
            missing_posts.append((rel_md, f"post-{stable_id(rel_md)}"))
            continue
        try:
            slug = validate_slug(slug)
            seen_post.setdefault(slug, []).append(rel_md)
        except Exception:
            invalid_posts.append((rel_md, slug))

    for slug_value, files in seen_post.items():
        if len(files) > 1:
            dup_posts[slug_value] = files

    for root, _, files in os.walk(notes_dir):
        if "index.md" not in files:
            continue
        idx = Path(root) / "index.md"
        rel_idx = str(idx.relative_to(root_dir))
        meta, _ = parse_front_matter(idx.read_text(encoding="utf-8"))
        slug = meta.get("slug")
        if not slug:
            rel_dir = str(Path(root).relative_to(root_dir))
            missing_dirs.append((rel_idx, f"cat-{stable_id(rel_dir)}"))
            continue
        try:
            slug = validate_slug(slug)
            seen_dir.setdefault(slug, []).append(rel_idx)
        except Exception:
            invalid_dirs.append((rel_idx, slug))

    for slug_value, files in seen_dir.items():
        if len(files) > 1:
            dup_dirs[slug_value] = files

    issues = (
        len(missing_posts)
        + len(invalid_posts)
        + len(dup_posts)
        + len(missing_dirs)
        + len(invalid_dirs)
        + len(dup_dirs)
    )

    print("=== Slug Report ===")
    print(f"Posts scanned: {len(md_files)}\n")
    if missing_posts:
        print(f"[Posts missing slug] {len(missing_posts)}")
        for rel_md, sug in missing_posts:
            print(f"  - {rel_md}\n    suggested: slug: {sug}")
        print()
    if invalid_posts:
        print(f"[Posts invalid slug] {len(invalid_posts)}")
        for rel_md, bad in invalid_posts:
            print(f"  - {rel_md}\n    found: slug: {bad}\n    rule: a-z 0-9 and '-' only (lowercase)")
        print()
    if dup_posts:
        print(f"[Posts duplicate slug] {len(dup_posts)}")
        for slug_value, files in dup_posts.items():
            print(f"  - slug: {slug_value}")
            for f in files:
                print(f"    * {f}")
        print()
    if missing_dirs:
        print(f"[Dirs missing slug] {len(missing_dirs)} (optional)")
        for rel_idx, sug in missing_dirs:
            print(f"  - {rel_idx}\n    suggested: slug: {sug}")
        print()
    if invalid_dirs:
        print(f"[Dirs invalid slug] {len(invalid_dirs)}")
        for rel_idx, bad in invalid_dirs:
            print(f"  - {rel_idx}\n    found: slug: {bad}\n    rule: a-z 0-9 and '-' only (lowercase)")
        print()
    if dup_dirs:
        print(f"[Dirs duplicate slug] {len(dup_dirs)}")
        for slug_value, files in dup_dirs.items():
            print(f"  - slug: {slug_value}")
            for f in files:
                print(f"    * {f}")
        print()

    if issues == 0:
        print("✅ No slug issues found.")
        return 0

    print(f"❌ Found {issues} issue(s).")
    return 1


def build_directory_structure_from_md(
    md_files: List[Path],
    notes_dir: Optional[Path] = None,
    root_dir: Optional[Path] = None,
) -> List[Dict]:
    notes_dir = notes_dir or config.NOTES_DIR
    root_dir = root_dir or config.ROOT_DIR

    dir_set: Set[Path] = set()
    for md in md_files:
        dir_set.add(md.parent)
        p = md.parent
        while p != notes_dir and notes_dir in p.parents:
            p = p.parent
            dir_set.add(p)

    for root, _, files in os.walk(notes_dir):
        if "index.md" in files:
            dir_set.add(Path(root))

    dir_slug_by_rel: Dict[str, str] = {}
    used_dir_slugs: Set[str] = set()
    for directory in list(dir_set):
        index_md = directory / "index.md"
        if not index_md.exists():
            continue
        try:
            text = index_md.read_text(encoding="utf-8")
            meta, _ = parse_front_matter(text)
            if meta.get("slug"):
                slug = validate_slug(meta["slug"])
                if slug in used_dir_slugs:
                    raise ValueError(f"duplicate directory slug: {slug}")
                used_dir_slugs.add(slug)
                rel_dir = str(directory.relative_to(root_dir))
                dir_slug_by_rel[rel_dir] = slug
        except Exception as exc:
            logger.warning("目录 slug 解析失败 %s: %s", index_md, exc)

    def node_for_dir(dir_path: Path) -> Dict:
        rel_dir = str(dir_path.relative_to(root_dir))
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
            "subdirs": [],
        }

    def build_children(parent: Path) -> List[Dict]:
        children: List[Dict] = []
        for child in sorted(parent.iterdir()):
            if not child.is_dir():
                continue
            if child not in dir_set and not any((d != child and child in d.parents) for d in dir_set):
                continue
            child_node = node_for_dir(child)
            child_node["subdirs"] = build_children(child)
            if child_node["has_posts"] or child_node["subdirs"]:
                children.append(child_node)
        return children

    roots: List[Dict] = []
    for top in sorted(notes_dir.iterdir()):
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
    out: List[Dict] = []

    def walk(nodes: List[Dict]) -> None:
        for node in nodes:
            out.append(node)
            walk(node.get("subdirs", []))

    walk(dirs)
    return out


def _post_metadata_from_markdown(md_path: Path) -> Tuple[Dict[str, str], str, str, List[str]]:
    md_text = md_path.read_text(encoding="utf-8")
    meta, md_wo_fm = parse_front_matter(md_text)
    title = meta.get("title")
    if not title:
        match = os.path.basename(md_path).split(".")[0]
        heading_match = _first_heading(md_wo_fm)
        title = heading_match or match
    keywords = extract_keywords(title or md_path.stem, md_wo_fm)
    return meta, md_wo_fm, title or md_path.stem, keywords


def _first_heading(md_content: str) -> Optional[str]:
    for line in md_content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def scan_notes_structure(
    md_files: List[Path],
    *,
    root_dir: Optional[Path] = None,
    notes_dir: Optional[Path] = None,
) -> ScanResult:
    root_dir = root_dir or config.ROOT_DIR
    notes_dir = notes_dir or config.NOTES_DIR
    directory_structure = build_directory_structure_from_md(md_files, notes_dir=notes_dir, root_dir=root_dir)
    flat_dirs = flatten_directories(directory_structure)

    nav_menu = [
        {"name": d["name"], "id": d["id"], "url": d["url"], "path": d["path"]}
        for d in directory_structure
    ]

    blog_posts: List[Dict] = []
    legacy_to_new: Dict[str, str] = {}
    used_post_slugs: Set[str] = set()
    md_to_post: Dict[str, Dict] = {}

    for md in md_files:
        rel_md = str(md.relative_to(root_dir))
        rel_html_legacy = str(md.with_suffix(".html").relative_to(root_dir))
        post_id = stable_id(rel_md)

        meta, _, title, keywords = _post_metadata_from_markdown(md)
        manual_slug = None
        if meta.get("slug"):
            manual_slug = validate_slug(meta["slug"])
            if manual_slug in used_post_slugs:
                raise ValueError(f"duplicate post slug: {manual_slug}")
            used_post_slugs.add(manual_slug)

        post_url = f"dist/p/{manual_slug}.html" if manual_slug else f"dist/p/{post_id}.html"
        post_record = {
            "title": title,
            "id": post_id,
            "slug": manual_slug,
            "url": post_url,
            "original_path": rel_html_legacy,
            "keywords": keywords,
        }
        blog_posts.append(post_record)
        md_to_post[rel_md] = post_record

        legacy_to_new[rel_html_legacy] = post_url
        legacy_to_new[f"/{rel_html_legacy}"] = post_url
        legacy_to_new[rel_md] = post_url
        legacy_to_new[f"/{rel_md}"] = post_url

    for directory in flat_dirs:
        legacy_index = f"{directory['path']}/index.html"
        legacy_to_new[legacy_index] = directory["url"]
        legacy_to_new[f"/{legacy_index}"] = directory["url"]

    return ScanResult(
        nav_menu=nav_menu,
        blog_posts=blog_posts,
        directory_structure=directory_structure,
        flat_directories=flat_dirs,
        legacy_to_new=legacy_to_new,
        md_to_post=md_to_post,
        md_files=md_files,
        root_dir=root_dir,
        notes_dir=notes_dir,
    )
