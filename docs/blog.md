# Writing blog posts

Each article is a Markdown file in `posts/`. The filename becomes its URL:
`posts/my-first-post.md` is published at `blog/my-first-post.html`.
Use lowercase letters, numbers, and hyphens in filenames; titles and tags can
be in Chinese or English.

Copy `posts/example.md`, rename it, and edit the metadata at the top:

```yaml
---
title: "我的第一篇博客"
date: 2026-10-21
tags: [科研, 生活, 随笔]
summary: "这里写一两句文章简介。"
draft: false
---
```

Write the article below the closing `---` using Markdown. Headings, links,
photos, lists, tables, and fenced code blocks are supported. To insert a photo,
save it in `images/` and use `![说明](../images/photo.jpg)` in the article.
For links between articles, use `[标题](other-post.html)`.

Set `draft: true` to keep a post out of the published site. Draft source files
remain visible in the GitHub repository; only the built website excludes them.
The provided example is a draft and is not displayed as a real article.

Each post can have multiple tags. Tags appear under the article and in the
Blog page's filter bar. Selecting a tag shows matching posts, and the filtered
view can be shared via `blog.html?tag=...`. Posts are sorted newest first.
The summary is optional; without it, the build uses the beginning of the article.

## Preview and publish

```sh
python -m pip install -r scripts/blog-requirements.txt
python scripts/build_blog.py
python -m http.server 8000
```

Open `http://localhost:8000/blog.html`. Run the build command again after editing
an article, then refresh the page. It generates `blog.html` and the `blog/` folder.
Do not manually edit generated pages; layout changes belong in
`.github/templates/blog.html`, with shared styles in `stylesheet.css`.

Push the Markdown source files to `main`. The existing GitHub Actions workflow
builds and deploys the blog along with the rest of the website. The `posts/`
source directory, draft articles, and build tools are excluded from its public
website artifact. The generated `blog/` folder is ignored by Git because the
workflow recreates it on deployment.
