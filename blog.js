(function () {
  'use strict';
  var list = document.getElementById('blog-posts');
  if (!list) return;
  var posts = Array.from(list.querySelectorAll('.blog-card'));
  var buttons = Array.from(document.querySelectorAll('[data-blog-filter]'));
  var count = document.getElementById('blog-count');
  var empty = document.getElementById('blog-empty');

  function filter(tag, updateUrl) {
    var visible = 0;
    posts.forEach(function (post) {
      var tags = JSON.parse(post.dataset.blogTags);
      post.hidden = !!tag && !tags.includes(tag);
      if (!post.hidden) visible++;
    });
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.blogFilter === tag));
    });
    count.textContent = visible + (visible === 1 ? ' post' : ' posts');
    empty.hidden = visible > 0;
    empty.textContent = tag ? 'No posts tagged “' + tag + '”.' : 'No posts yet.';
    if (updateUrl) {
      var url = new URL(window.location.href);
      if (tag) url.searchParams.set('tag', tag);
      else url.searchParams.delete('tag');
      window.history.pushState(null, '', url);
    }
  }
  buttons.forEach(function (button) {
    button.addEventListener('click', function () { filter(button.dataset.blogFilter, true); });
  });
  function readUrl() { filter(new URL(window.location.href).searchParams.get('tag') || '', false); }
  window.addEventListener('popstate', readUrl);
  readUrl();
})();
