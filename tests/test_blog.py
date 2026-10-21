from pathlib import Path
import tempfile
import unittest

from scripts.build_blog import build, load_posts


class BlogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.posts = self.root / "posts"
        self.posts.mkdir()
        self.output = self.root / "site"

    def write(self, slug, metadata, body="Article text."):
        (self.posts / (slug + ".md")).write_text(
            f"---\n{metadata}\n---\n\n{body}\n", encoding="utf-8")

    def test_articles_are_sorted_and_markdown_and_chinese_tags_are_rendered(self):
        self.write("older", "title: Older\ndate: 2026-10-01\ntags: [Research]")
        self.write("newer", 'title: "科研笔记"\ndate: 2026-10-21\ntags: [科研, Life, 科研]',
                   "## A heading\n\n**Bold** text.\n\n```python\nprint(1)\n```")
        self.assertEqual(build(self.posts, self.output), 2)
        index = (self.output / "blog.html").read_text(encoding="utf-8")
        self.assertLess(index.index('href="blog/newer.html"'), index.index('href="blog/older.html"'))
        self.assertIn('data-blog-filter="科研"', index)
        article = (self.output / "blog/newer.html").read_text(encoding="utf-8")
        self.assertIn('href="../stylesheet.css"', article)
        self.assertIn('href="../blog.html?tag=%E7%A7%91%E7%A0%94"', article)
        self.assertIn('<h2>A heading</h2>', article)
        self.assertIn('<strong>Bold</strong>', article)
        self.assertIn('<code class="language-python">', article)
        self.assertNotIn('{{', article)
        self.assertEqual(load_posts(self.posts)[0]["tags"], ["科研", "Life"])

    def test_drafts_are_excluded_and_unpublished_pages_are_removed(self):
        self.write("published", "title: Published\ndate: 2026-10-21\ntags: [Public]")
        self.write("draft", "title: Secret draft\ndraft: true\ntags: [DraftOnly]")
        build(self.posts, self.output)
        self.assertTrue((self.output / "blog/published.html").exists())
        self.assertFalse((self.output / "blog/draft.html").exists())
        index = (self.output / "blog.html").read_text(encoding="utf-8")
        self.assertNotIn("Secret draft", index)
        self.assertNotIn("DraftOnly", index)
        self.assertFalse((self.output / "posts").exists())
        self.write("published", "title: Published\ndraft: true")
        self.assertEqual(build(self.posts, self.output), 0)
        self.assertFalse((self.output / "blog/published.html").exists())
        self.assertIn("No posts yet.", (self.output / "blog.html").read_text(encoding="utf-8"))

    def test_metadata_is_escaped_and_invalid_tags_fail_the_build(self):
        self.write("escaped", 'title: "<b>Title</b>"\ndate: 2026-10-21\ntags: ["A & B"]\nsummary: "<img src=x>"')
        build(self.posts, self.output)
        index = (self.output / "blog.html").read_text(encoding="utf-8")
        self.assertIn("&lt;b&gt;Title&lt;/b&gt;", index)
        self.assertIn("&lt;img src=x&gt;", index)
        self.assertIn("A &amp; B", index)
        self.write("invalid", "title: Bad tags\ndate: 2026-10-21\ntags: Research")
        with self.assertRaisesRegex(ValueError, "tags must be a list"):
            build(self.posts, self.output)


if __name__ == "__main__":
    unittest.main()
