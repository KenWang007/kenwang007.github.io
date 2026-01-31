"""Rendering utilities for markdown posts and directory pages."""
from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path
from typing import Dict

from . import config
from .utils import (
    extract_keywords,
    extract_markdown_content_from_legacy_html,
    generate_metadata_for_template,
    pandoc_available,
    parse_front_matter,
)

logger = logging.getLogger(__name__)


def convert_code_blocks_for_highlightjs(html_content: str) -> str:
    """Convert pandoc-generated code blocks to highlight.js compatible format."""
    # Find all pre blocks with sourceCode class (handle multiline)
    pattern = r'<div class="sourceCode"[^>]*>\s*<pre\s+class="sourceCode\s+([^"]+)">'
    
    def replace_code_block(match: re.Match) -> str:
        language = match.group(1)
        # Convert to standard <pre><code> format for highlight.js
        return f'<pre><code class="language-{language}">'
    
    return re.sub(pattern, replace_code_block, html_content)


def rewrite_internal_links(html_fragment: str, current_md: Path, legacy_to_new: Dict[str, str]) -> str:
    """Rewrite links that point to legacy markdown/html files into ASCII-only URLs."""
    current_rel_dir = Path(current_md.relative_to(config.ROOT_DIR)).parent

    def resolve_candidate(href: str) -> str | None:
        base = href.split("#", 1)[0].split("?", 1)[0]
        if not base:
            return None
        if base.startswith(("http://", "https://", "mailto:", "tel:")):
            return None
        if base.startswith("/"):
            return base.lstrip("/")
        try:
            resolved = (current_rel_dir / base).as_posix()
            resolved = str(Path(resolved))
            return resolved
        except Exception:
            return None

    href_re = re.compile(r'''href=(['"])([^"']+)\1''', re.IGNORECASE)

    def repl(match: re.Match[str]) -> str:
        quote = match.group(1)
        href = match.group(2)
        candidate = resolve_candidate(href)
        if not candidate:
            return match.group(0)
        candidates = [candidate]
        if candidate.endswith(".md"):
            candidates.append(candidate[:-3] + ".html")
        if candidate.endswith(".html"):
            candidates.append(candidate[:-5] + ".md")
        for option in candidates:
            if option in legacy_to_new:
                return f"href={quote}/{legacy_to_new[option]}{quote}"
            prefixed = f"/{option}"
            if prefixed in legacy_to_new:
                return f"href={quote}/{legacy_to_new[prefixed]}{quote}"
        return match.group(0)

    return href_re.sub(repl, html_fragment)


def convert_markdown_to_html(md_file_path: Path, out_html_path: Path, legacy_to_new: Dict[str, str]) -> bool:
    """Convert markdown into final HTML using template + internal link rewriting."""
    temp_html_path = md_file_path.with_suffix(".temp.html")
    try:
        out_html_path.parent.mkdir(parents=True, exist_ok=True)

        md_content = md_file_path.read_text(encoding="utf-8")
        meta, md_content_wo_fm = parse_front_matter(md_content)

        title = meta.get("title")
        if not title:
            title_match = re.search(r"^#\s+(.+)", md_content_wo_fm, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file_path.stem

        body_content = ""
        if pandoc_available():
            temp_md_path = md_file_path.with_suffix(".nofm.temp.md")
            try:
                temp_md_path.write_text(md_content_wo_fm, encoding="utf-8")
            except Exception:
                temp_md_path = md_file_path

            result = subprocess.run(
                ["pandoc", "-s", str(temp_md_path), "-o", str(temp_html_path)],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                logger.error("Pandoc转换失败: %s", result.stderr)
                body_content = ""
            else:
                temp_html_content = temp_html_path.read_text(encoding="utf-8")
                body_match = re.search(r"<body[^>]*>([\s\S]*?)</body>", temp_html_content, re.IGNORECASE)
                body_content = body_match.group(1) if body_match else temp_html_content

                # Convert code blocks to highlight.js compatible format
                body_content = convert_code_blocks_for_highlightjs(body_content)

        else:
            legacy_html_path = md_file_path.with_suffix(".html")
            if legacy_html_path.exists():
                body_content = extract_markdown_content_from_legacy_html(legacy_html_path)
            else:
                safe = re.sub(r"&", "&amp;", md_content)
                safe = re.sub(r"<", "&lt;", safe)
                body_content = f"<h1>{title}</h1><pre>{safe}</pre>"

        body_content = rewrite_internal_links(body_content, md_file_path, legacy_to_new)

        if not config.TEMPLATE_FILE.exists():
            logger.error("模板文件不存在: %s", config.TEMPLATE_FILE)
            return False

        template_content = config.TEMPLATE_FILE.read_text(encoding="utf-8")
        keywords = extract_keywords(title, md_content_wo_fm)
        metadata = generate_metadata_for_template(out_html_path, title, keywords, source_file=md_file_path)

        final_html_content = template_content
        for key, value in metadata.items():
            final_html_content = final_html_content.replace(f"{{{{{key}}}}}", str(value))
        final_html_content = final_html_content.replace("{{content}}", body_content)

        out_html_path.write_text(final_html_content, encoding="utf-8")
        logger.info("✓ 生成: %s -> %s", md_file_path.relative_to(config.ROOT_DIR), out_html_path.relative_to(config.ROOT_DIR))
        return True
    except subprocess.TimeoutExpired:
        logger.error("转换超时: %s", md_file_path)
        return False
    except Exception as exc:
        logger.error("✗ 转换失败: %s - %s", md_file_path, exc)
        return False
    finally:
        if temp_html_path.exists():
            try:
                temp_html_path.unlink()
            except Exception:
                pass
        temp_md = md_file_path.with_suffix(".nofm.temp.md")
        if temp_md.exists():
            try:
                temp_md.unlink()
            except Exception:
                pass


def generate_directory_page(dir_node: Dict, legacy_to_new: Dict[str, str]) -> bool:
    """Generate a directory index page with optional legacy content fallback."""
    out_path = config.ROOT_DIR / dir_node["url"]
    out_path.parent.mkdir(parents=True, exist_ok=True)

    dir_abs = config.ROOT_DIR / dir_node["path"]
    legacy_index_html = dir_abs / "index.html"
    index_md = dir_abs / "index.md"
    title = dir_node.get("name") or dir_abs.name
    description = f"{title} - {config.SITE_NAME}"

    body_content = ""
    if legacy_index_html.exists():
        body_content = extract_markdown_content_from_legacy_html(legacy_index_html)
        body_content = rewrite_internal_links(body_content, legacy_index_html, legacy_to_new)

    if index_md.exists() and pandoc_available():
        temp_html_path = index_md.with_suffix(".temp.html")
        try:
            result = subprocess.run(
                ["pandoc", "-s", str(index_md), "-o", str(temp_html_path)],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0 and temp_html_path.exists():
                temp_html_content = temp_html_path.read_text(encoding="utf-8")
                body_match = re.search(r"<body[^>]*>([\s\S]*?)</body>", temp_html_content, re.IGNORECASE)
                body_content = body_match.group(1) if body_match else temp_html_content

                # Convert code blocks to highlight.js compatible format
                body_content = convert_code_blocks_for_highlightjs(body_content)

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

    body_content = f'<div id="directory-page" data-dir-id="{dir_node["id"]}"></div>\n' + body_content

    template_content = config.TEMPLATE_FILE.read_text(encoding="utf-8")
    metadata_source = index_md if index_md.exists() else (legacy_index_html if legacy_index_html.exists() else out_path)
    metadata = generate_metadata_for_template(out_path, title, [], source_file=metadata_source)

    final_html_content = template_content
    for key, value in metadata.items():
        final_html_content = final_html_content.replace(f"{{{{{key}}}}}", str(value))
    final_html_content = final_html_content.replace("{{content}}", body_content)

    out_path.write_text(final_html_content, encoding="utf-8")
    return True
