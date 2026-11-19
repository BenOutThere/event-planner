# R10: starter fields for the empty areas (draft for department leads)

Four areas in the event template have no fields yet, so they show as "not set up"
on every event: **Operations**, **Marketing & Communications**, **Commercial** and
**Event Scope**. There's also no **Site Information** area, so the Site information
tile on Event Home has nowhere to point.

Below is the proposed starting list. Please ask each department lead to check
their area and say what to add, remove or rename. Nothing is added until you
say it's agreed. After that, everything stays editable in **Admin → Template**.

How it's added: fields only go into an area that has no fields yet, so nothing
anyone has already set up is changed. Running it twice does nothing extra.

## Operations

| Field | Type | What it's for |
|---|---|---|
| Operations overview | Text | How the event runs on the day: zones, key timings and who leads each part. |
| Staffing & crew | Table (Role, Name, Number needed, Mobile) | Who's working and in what role. |
| Accreditation & wristbands | Text | Who needs which pass, and where to collect it. |
| Security | Text | Provider, numbers, posts and key contacts. |
| Traffic management | Text | Traffic plan, road closures and approvals. |
| Operational documents | Files | Run sheets, bump-in plans and other working documents. |

## Marketing & Communications

| Field | Type | What it's for |
|---|---|---|
| Key messages | Text | What every department should say about the event. |
| Target audience | Text | Who the event is for. |
| Campaign timeline | Text | Announcements, on-sale dates and key campaign moments. |
| Channels | Text | Website, social, email, media and paid channels being used. |
| Brand & media assets | Links | Logos, photos and templates. |

## Commercial

| Field | Type | What it's for |
|---|---|---|
| Sponsors & partners | Text | Who's involved and their key entitlements. |
| Commercial agreements | Links | Links to signed agreements. |
| Food & beverage | Text | Caterers, bars and licensing. |
| Merchandise | Text | Range, suppliers and selling points. |

## Event Scope

| Field | Type | What it's for |
|---|---|---|
| In scope | Text | What this event includes. |
| Out of scope | Text | What it doesn't, to avoid assumptions. |
| Key deliverables | Text | What OTG must deliver, and for whom. |
| Assumptions & constraints | Text | Anything the plan depends on. |

## Site Information (new area, in the Delivery group after Operations)

| Field | Type | What it's for |
|---|---|---|
| Site map | Files | Upload the current site or floor plan. |
| Site access & parking | Text | Gates, deliveries, staff and public parking. |
| Power & water | Text | Supply points, generators and outlets. |
| Waste & cleaning | Text | Bins, contractors and schedules. |
| Emergency points | Text | Assembly areas, first aid, emergency access routes. |

None of these fields are marked required, so they won't lower any event's
readiness score until someone decides they should be.

SQL file: `supabase/migrations/20261120000600_r10_set_up_empty_areas.sql`
(run it only once the list is agreed; edit the list in that file first if
leads ask for changes).
