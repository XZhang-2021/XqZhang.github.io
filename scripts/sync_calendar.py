"""Publish only occupied time intervals; never save the source ICS or event metadata."""

import argparse
import json
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from icalendar import Calendar
import recurring_ical_events

ROOT = Path(__file__).resolve().parents[1]
UTC = timezone.utc


def as_datetime(value, zone):
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=zone)
    return datetime.combine(value, time.min, tzinfo=zone)


def build_availability(source, now=None, time_zone="America/Chicago"):
    zone = ZoneInfo(time_zone)
    now = now or datetime.now(UTC)
    today = now.astimezone(zone).date()
    # Whole weeks: the previous week, this week, and the following twelve weeks.
    first = today - timedelta(days=today.weekday() + 7)
    last = first + timedelta(weeks=14)
    range_start = datetime.combine(first, time.min, tzinfo=zone)
    range_end = datetime.combine(last, time.min, tzinfo=zone)
    calendar = Calendar.from_ical(source)
    if calendar.name != "VCALENDAR":
        raise ValueError("The response is not an iCalendar calendar")
    intervals = []
    # The library handles RRULE, EXDATE, moved occurrences, and embedded VTIMEZONE.
    for event in recurring_ical_events.of(calendar).between(range_start, range_end):
        if str(event.get("STATUS", "")).upper() == "CANCELLED":
            continue
        if str(event.get("TRANSP", "")).upper() == "TRANSPARENT":
            continue
        if str(event.get("X-MICROSOFT-CDO-BUSYSTATUS", "")).upper() == "FREE":
            continue
        raw_start = event.decoded("DTSTART")
        start = as_datetime(raw_start, zone)
        if "DTEND" in event:
            end = as_datetime(event.decoded("DTEND"), zone)
        elif "DURATION" in event:
            end = start + event.decoded("DURATION")
        elif isinstance(raw_start, date) and not isinstance(raw_start, datetime):
            end = start + timedelta(days=1)
        else:
            end = start
        start = max(start.astimezone(UTC), range_start.astimezone(UTC))
        end = min(end.astimezone(UTC), range_end.astimezone(UTC))
        if end > start:
            intervals.append((start, end))

    # Merge overlapping and adjacent events so only occupied times survive.
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))

    days = {}
    day = first
    while day < last:
        days[day.isoformat()] = []
        day += timedelta(days=1)
    for start, end in merged:
        while start < end:
            local_start = start.astimezone(zone)
            next_date = local_start.date() + timedelta(days=1)
            midnight = datetime.combine(next_date, time.min, tzinfo=zone).astimezone(UTC)
            segment_end = min(end, midnight)
            days[local_start.date().isoformat()].append({
                "start": local_start.strftime("%H:%M"),
                "end": "24:00" if segment_end == midnight else segment_end.astimezone(zone).strftime("%H:%M"),
            })
            start = segment_end

    # Explicit allowlist: no titles, descriptions, locations, IDs, or source URLs.
    return {
        "updatedAt": now.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "timeZone": time_zone,
        "rangeStart": first.isoformat(),
        "rangeEnd": last.isoformat(),
        "days": days,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/availability.json")
    args = parser.parse_args()
    config = json.loads((ROOT / ".github/calendar-source.json").read_text(encoding="utf-8"))
    source_url = os.environ.get("OUTLOOK_ICS_URL") or config["url"]
    if not source_url.startswith("https://"):
        raise ValueError("The calendar URL must use HTTPS")
    request = Request(source_url, headers={"User-Agent": "PersonalWebsiteAvailability/1.0"})
    with urlopen(request, timeout=45) as response:
        source = response.read(5_000_001)
    if len(source) > 5_000_000:
        raise ValueError("Calendar response exceeds the size limit")
    payload = build_availability(source, time_zone=config["timeZone"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print("Updated busy-only availability for", len(payload["days"]), "days.")


if __name__ == "__main__":
    main()
