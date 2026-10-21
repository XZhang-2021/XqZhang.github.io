"""Build a static blog and individual article pages from posts/*.md."""

import argparse
from datetime import date, datetime
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import quote

import markdown
import yaml

ROOT = Path(__file__).resolve().parents[1]


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def load_posts(directory):
    posts = []
    for path in sorted(directory.glob("*.md")):
        source = path.read_text(encoding="utf-8-sig")
        match = re.fullmatch(r"---\s*\n(.*?)\n---\s*\n(.*)", source, re.DOTALL)
        if not match:
            raise ValueError(f"{path.name}: add YAML metadata between --- lines")
        metadata = yaml.safe_load(match[1])
        if not isinstance(metadata, dict):
            raise ValueError(f"{path.name}: metadata must be a mapping")
        draft = metadata.get("draft", False)
        if not isinstance(draft, bool):
            raise ValueError(f"{path.name}: draft must be true or false")
        if draft:
            continue
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", path.stem):
            raise ValueError(f"{path.name}: use lowercase letters, numbers, and hyphens in the filename")
        title = metadata.get("title")
        tags = metadata.get("tags", [])
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"{path.name}: a title is required")
        if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            raise ValueError(f"{path.name}: tags must be a list of nonempty strings")
        raw_date = metadata.get("date")
        if isinstance(raw_date, datetime):
            published = raw_date.date()
        elif isinstance(raw_date, date):
            published = raw_date
        else:
            try:
                published = date.fromisoformat(str(raw_date))
            except ValueError as error:
                raise ValueError(f"{path.name}: date must use YYYY-MM-DD") from error
        body = markdown.markdown(match[2], extensions=["extra", "sane_lists"], output_format="html")
        plain = PlainText()
        plain.feed(body)
        summary = metadata.get("summary")
        if summary is not None and not isinstance(summary, str):
            raise ValueError(f"{path.name}: summary must be text")
        if summary is None:
            summary = " ".join(" ".join(plain.parts).split())
            summary = summary[:200].rstrip() + ("…" if len(summary) > 200 else "")
        posts.append({
            "slug": path.stem, "title": title.strip(), "date": published.isoformat(),
            "tags": list(dict.fromkeys(tag.strip() for tag in tags)),
            "summary": summary, "body": body,
        })
    return sorted(posts, key=lambda post: (post["date"], post["slug"]), reverse=True)


def tag_links(tags, prefix=""):
    return '<div class="blog-tags">' + "".join(
        f'<a class="blog-tag" href="{prefix}blog.html?tag={quote(tag, safe="")}">{escape(tag)}</a>'
        for tag in tags
    ) + '</div>'


def render_page(template, title, description, content, prefix="", scripts=""):
    return (template.replace("{{ROOT}}", prefix)
            .replace("{{TITLE}}", escape(title))
            .replace("{{DESCRIPTION}}", escape(description, quote=True))
            .replace("{{SCRIPTS}}", scripts)
            .replace("{{CONTENT}}", content))


def build(posts_directory, output_directory, template_path=None):
    posts = load_posts(posts_directory)
    template = (template_path or ROOT / ".github/templates/blog.html").read_text(encoding="utf-8")
    tags = sorted({tag for post in posts for tag in post["tags"]}, key=str.casefold)
    filters = '<button type="button" class="blog-filter" data-blog-filter="" aria-pressed="true">All</button>'
    for tag in tags:
        filters += (f'<button type="button" class="blog-filter" data-blog-filter="{escape(tag, quote=True)}" '
                    f'aria-pressed="false">{escape(tag)}</button>')
    cards = []
    for post in posts:
        cards.append(
            f'<article class="blog-card" data-blog-tags="{escape(json.dumps(post["tags"], ensure_ascii=False), quote=True)}">'
            f'<time class="blog-date" datetime="{post["date"]}">{post["date"]}</time>'
            f'<h2 class="blog-post-title"><a href="blog/{post["slug"]}.html">{escape(post["title"])}</a></h2>'
            f'<p class="blog-summary">{escape(post["summary"])}</p>'
            f'{tag_links(post["tags"])}</article>'
        )
    noun = "post" if len(posts) == 1 else "posts"
    listing = (
        '<h1 class="page-title">Blog</h1><p class="blog-intro">Notes, ideas, and occasional digressions.</p>'
        f'<div class="blog-filters" role="group" aria-label="Filter posts by tag">{filters}</div>'
        f'<p id="blog-count" class="blog-count" role="status">{len(posts)} {noun}</p>'
        f'<div id="blog-posts">{"".join(cards)}</div>'
        f'<p id="blog-empty" class="blog-empty"{" hidden" if posts else ""}>No posts yet.</p>'
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / "blog.html").write_text(render_page(
        template, "Blog — Xuqi Zhang", "Notes and articles by Xuqi Zhang.", listing,
        scripts='<script src="blog.js" defer></script>'
    ), encoding="utf-8", newline="\n")
    article_directory = output_directory / "blog"
    # This directory contains generated pages only. Remove obsolete published pages
    # when a source article is renamed, deleted, or returned to draft.
    if article_directory.exists():
        for path in article_directory.glob("*.html"):
            if path.stem not in {post["slug"] for post in posts}:
                path.unlink()
    for post in posts:
        article_directory.mkdir(exist_ok=True)
        article = (
            '<p class="blog-back"><a href="../blog.html">← All posts</a></p>'
            '<article class="blog-article">'
            f'<h1 class="page-title">{escape(post["title"])}</h1>'
            f'<time class="blog-date" datetime="{post["date"]}">{post["date"]}</time>'
            f'{tag_links(post["tags"], "../")}'
            f'<div class="blog-content">{post["body"]}</div></article>'
        )
        (article_directory / (post["slug"] + ".html")).write_text(render_page(
            template, post["title"] + " — Xuqi Zhang", post["summary"], article, prefix="../"
        ), encoding="utf-8", newline="\n")
    return len(posts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    count = build(ROOT / "posts", args.output.resolve())
    print(f"Built Blog with {count} published posts.")


if __name__ == "__main__":
    main()
