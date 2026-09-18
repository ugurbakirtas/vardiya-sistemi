TURKMEDYA V62 - INGEST CARRY-FORWARD FIX10
==========================================
Version: V62-INGEST-CARRY-FORWARD-FIX10-20260918

PURPOSE
-------
Fix the remaining INGEST no-backup failure where emergency mode could assign a previous-Sunday
16:00-00:00 operator to Monday 06:30-16:00 and then reject the whole schedule for rest violation.

NEW HARD OPERATIONAL RULE
-------------------------
When an INGEST hard absence begins and no qualified INGEST backup is available:
1) Read the immediately previous REAL day for the two remaining core INGEST operators.
2) Previous-day MORNING operator stays MORNING.
3) Previous-day EVENING operator stays EVENING.
4) If the absence begins Monday, the previous REAL day is the prior week's Sunday.
5) Only if previous-day lane information is unavailable does the deterministic legacy orientation cost apply.

This preserves the user's operational rule:
- Sunday morning -> Monday morning.
- Sunday evening -> Monday evening.

EMERGENCY COVERAGE REMAINS
--------------------------
Mon-Fri: one MORNING + one EVENING.
Saturday: one MORNING + one OFF.
Sunday: roles reverse, one MORNING + one OFF.
Full-week absence: each remaining operator = 6 work + 1 off.

UNCHANGED
---------
- Approved annual leave / report / manual leave = HARD LOCK.
- Qualified INGEST backup: same backup carries absent person's scheduled work slots until return.
- MCR fixed cycle remains locked.
- Normal INGEST A/B/C weekly rotation remains unchanged when all 3 core operators are present.
- Camera/Excel preservation, HAVUZ MIN5/capacity-floor, manual/local reoptimization remain unchanged.
