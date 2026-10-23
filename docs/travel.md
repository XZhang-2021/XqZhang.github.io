# Travel albums

Edit `travel.html` to add a trip or organize photos. The page is plain HTML and
works without JavaScript. `miscellanea.html` redirects visitors from the old URL.

## Add a trip

Copy a `<details class="travel-album">...</details>` block inside
`<div class="travel-albums">`. Update its cover photo, title, location, date,
photo count, and the photos inside `travel-photos`.

Keep Austin first, then arrange the other album blocks by date, newest first.
When two trips have the same month, use their photo capture dates to order them.

Each album opens when its cover or information is clicked, or with Enter/Space
when focused. Photos open full-resolution images. Use `travel-photos-single` on
the photo container for an album with just one photo; remove it for multiple
photos. The layout switches to one column on small screens.

## Set the location and date

The Boston location comes from the original caption. The Virginia photo is
grouped under Charlottesville, Virginia, and the other seven photos under
Austin, Texas, as confirmed by the site owner.
Austin is the site owner's home, so its album contains everyday photos and has
no date field. Boston was visited in January 2026 and Charlottesville in
November 2025, as confirmed by the site owner.
The additional trips use the place and month in the uploaded filenames
(`Place_Mon YYYY.heic` or `Place_Mon YYYY.jpg`). Check capture metadata when
available; retain the filename's month when metadata is absent or invalid, as
with the Melbourne and Sydney JPEGs.
Use a `<time>` element for a travel date, month, or date range, for example:

```html
<span class="travel-meta"><span class="travel-meta-label">Date</span>
  <time datetime="2025-05">May 2025</time>
</span>
```

For a range, use two time elements:

```html
<span class="travel-meta"><span class="travel-meta-label">Date</span>
  <time datetime="2025-05-10">May 10</time>–<time datetime="2025-05-14">14, 2025</time>
</span>
```

These dates are examples only. Keep the Austin album without a date field.

## Add a photo

Store the original image in `images/Miscellanea/` (or another image folder), then
copy a photo's `<figure>` block. Update both the link and image paths, the alt
text, caption, and the image's actual width and height. These dimensions reserve
space while images load; the page scales them to fit automatically.

The HEIC originals remain in `images/Miscellanea/`. Their browser-compatible,
full-resolution JPEG copies are in `images/travel/`, alongside smaller WebP
covers. Album covers use the `-cover.webp` files; photo links and expanded images
use the JPEG files. Convert future HEIC uploads before adding them to the page,
and preserve their orientation and color profile during conversion.

Navigation lives in the root HTML files and `.github/templates/blog.html`.
The blog template must keep its Travel link so rebuilt articles use the new URL.
