# Website maintenance

## Busy-only Outlook calendar

The homepage's Availability section reads `data/availability.json`, which contains
only occupied time intervals in `America/Chicago`. Free and cancelled events are
excluded; tentative and out-of-office events are displayed as Busy. Recurring
events, exceptions, all-day events, and daylight saving time are handled by the
Python calendar parser. Event metadata and the original ICS are never saved to
the website output. The source URL is configured in `.github/calendar-source.json`;
it is a published availability-only link and is visible in the repository.
Keep its Outlook publishing permission set to **Can view when I'm busy**.

### Enable automatic updates

1. In GitHub repository **Settings → Pages → Build and deployment → Source**,
   select **GitHub Actions**.
2. Push website changes to `main`; the workflow publishes the updated site.
3. To refresh manually, open **Actions → Publish website and busy calendar**
   and select **Run workflow**.

The workflow then refreshes the calendar and deploys the site twice an hour,
as well as on pushes to `main`. GitHub may delay scheduled runs and may disable
schedules after 60 days without repository activity; run/re-enable the workflow
in Actions if needed. The page shows the last successful update and marks data
older than six hours as delayed. Refresh failures stop deployment and preserve
the previous website. No event data is committed by the workflow.

To replace the source without editing the config, set the repository Actions
secret `OUTLOOK_ICS_URL`. The built website contains neither source configuration
nor calendar tooling.

### Local refresh and preview

```sh
python -m pip install -r scripts/calendar-requirements.txt
python -m unittest discover -s tests
node --test tests/availability.test.cjs
python scripts/sync_calendar.py
python -m http.server 8000
```

Open `http://localhost:8000`. A successful snapshot is checked in so the page also
works before the first automated deployment. Refresh it before publishing manually.
