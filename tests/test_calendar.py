import json
import unittest
from datetime import datetime, timezone

from scripts.sync_calendar import build_availability


NOW = datetime(2026, 10, 21, 15, tzinfo=timezone.utc)


def calendar(*events):
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendar tests//EN\r\n"
            + "\r\n".join(events) + "\r\nEND:VCALENDAR\r\n").encode()


def event(body):
    return "BEGIN:VEVENT\r\n" + body.replace("\n", "\r\n") + "\r\nEND:VEVENT"


class CalendarTests(unittest.TestCase):
    def build(self, *events):
        return build_availability(calendar(*events), now=NOW)

    def test_only_time_intervals_are_published_and_overlaps_are_merged(self):
        output = self.build(event("""UID:secret-identifier
DTSTART:20261021T150000Z
DTEND:20261021T160000Z
SUMMARY:Confidential meeting
DESCRIPTION:Private notes
LOCATION:Private office
ORGANIZER:mailto:private@example.com"""), event("""UID:another-identifier
DTSTART:20261021T153000Z
DTEND:20261021T163000Z"""))
        self.assertEqual(output["days"]["2026-10-21"], [{"start": "10:00", "end": "11:30"}])
        self.assertEqual(set(output), {"updatedAt", "timeZone", "rangeStart", "rangeEnd", "days"})
        for slots in output["days"].values():
            for slot in slots:
                self.assertEqual(set(slot), {"start", "end"})
        for private_text in ("Confidential", "secret", "Private", "example.com", "mailto"):
            self.assertNotIn(private_text, json.dumps(output))

    def test_free_and_cancelled_events_are_excluded_tentative_blocks_time(self):
        output = self.build(*[
            event("UID:" + str(i) + "\nDTSTART:20261021T150000Z\nDTEND:20261021T160000Z\n" + status)
            for i, status in enumerate(("TRANSP:TRANSPARENT", "STATUS:CANCELLED", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"))
        ], event("""UID:tentative
DTSTART:20261021T170000Z
DTEND:20261021T180000Z
STATUS:TENTATIVE
X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE"""))
        self.assertEqual(output["days"]["2026-10-21"], [{"start": "12:00", "end": "13:00"}])

    def test_recurrence_exclusions_and_moved_occurrences(self):
        output = self.build(event("""UID:series
DTSTART;TZID=America/Chicago:20261019T090000
DTEND;TZID=America/Chicago:20261019T100000
RRULE:FREQ=DAILY;COUNT=3
EXDATE;TZID=America/Chicago:20261020T090000"""), event("""UID:series
RECURRENCE-ID;TZID=America/Chicago:20261021T090000
DTSTART;TZID=America/Chicago:20261022T110000
DTEND;TZID=America/Chicago:20261022T120000"""))
        self.assertEqual(output["days"]["2026-10-19"], [{"start": "09:00", "end": "10:00"}])
        self.assertEqual(output["days"]["2026-10-20"], [])
        self.assertEqual(output["days"]["2026-10-21"], [])
        self.assertEqual(output["days"]["2026-10-22"], [{"start": "11:00", "end": "12:00"}])

    def test_dst_preserves_local_recurring_time_and_converts_utc_correctly(self):
        output = self.build(event("""UID:dst-series
DTSTART;TZID=America/Chicago:20261030T090000
DTEND;TZID=America/Chicago:20261030T100000
RRULE:FREQ=DAILY;COUNT=5"""), event("""UID:utc-after-dst
DTSTART:20261102T180000Z
DTEND:20261102T190000Z"""))
        self.assertEqual(output["days"]["2026-10-30"], [{"start": "09:00", "end": "10:00"}])
        self.assertEqual(output["days"]["2026-11-02"], [
            {"start": "09:00", "end": "10:00"}, {"start": "12:00", "end": "13:00"}])

    def test_all_day_exclusive_end_and_cross_midnight_duration(self):
        output = self.build(event("""UID:all-day
DTSTART;VALUE=DATE:20261025
DTEND;VALUE=DATE:20261027"""), event("""UID:overnight
DTSTART;TZID=America/Chicago:20261021T233000
DURATION:PT2H"""))
        for day in ("2026-10-25", "2026-10-26"):
            self.assertEqual(output["days"][day], [{"start": "00:00", "end": "24:00"}])
        self.assertEqual(output["days"]["2026-10-27"], [])
        self.assertEqual(output["days"]["2026-10-21"], [{"start": "23:30", "end": "24:00"}])
        self.assertEqual(output["days"]["2026-10-22"], [{"start": "00:00", "end": "01:30"}])


if __name__ == "__main__":
    unittest.main()
