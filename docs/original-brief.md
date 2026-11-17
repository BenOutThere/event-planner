# OTG Event Planner

Create a modern, clean, fun and highly usable web app for The Out There Group to manage event planning from initial concept through to full delivery.

The app should begin as a “Pre-Event Planning Summary” tool, capturing the key information known at the start of planning, and then progressively evolve each event record into a full Event Delivery Plan.

The app should feel simple, logical and enjoyable to use for both administrators and team members. Use a polished, professional UI with clear sections, progress indicators, friendly microcopy, and an intuitive dashboard.

Core requirements:

1. Event Dashboard

Create a dashboard showing all events with:

- Event name

- Event type

- Date or proposed date

- Location

- Current planning stage

- Status: Draft, In Planning, Confirmed, Delivery Ready, Completed

- Assigned event lead

- Progress percentage

- Quick search and filters

2. Create New Event Workflow

Build a guided step-by-step form for creating a new event. The first version should capture the initial planning summary, including:

Event Overview:

- Event name

- Event type/category

- Event purpose/objectives

- Proposed date/s

- Proposed venue/location

- Expected audience/attendance

- Key stakeholders

- Event owner/lead

- Internal team members

- External partners/suppliers

Commercial Information:

- Budget estimate

- Revenue opportunities

- Sponsorship requirements

- Ticketing or entry details

- Key financial risks

Operations:

- Venue requirements

- Infrastructure requirements

- Permits/approvals required

- Insurance requirements

- Staffing requirements

- Contractor/supplier requirements

- Site access and bump-in/bump-out notes

Marketing & Communications:

- Target audience

- Key messages

- Marketing channels

- PR/media requirements

- Social media requirements

- Creative/design requirements

Risk & Compliance:

- Known risks

- Safety considerations

- Weather contingencies

- Compliance requirements

- Emergency considerations

Notes & Attachments:

- General notes

- Upload documents/images

- Links to external resources

3. Event Detail Page

Each event should have a dedicated page with organised tabs:

- Summary

- Budget

- Operations

- Suppliers

- Marketing

- Risk & Safety

- Tasks

- Timeline

- Files & Notes

4. Progressive Event Delivery Plan

Design the app so the initial summary can grow into a full event delivery plan over time. Allow sections to start incomplete and show completion indicators for each section.

5. Tasks and Responsibilities

Add a task management area inside each event:

- Task name

- Owner

- Due date

- Priority

- Status

- Notes

- Related event section

Show overdue tasks and upcoming deadlines clearly.

6. Timeline

Create an event timeline showing key milestones:

- Planning start

- Supplier confirmations

- Marketing launch

- Ticketing launch

- Permit deadlines

- Bump-in

- Event day

- Bump-out

- Post-event review

7. Admin Controls

Admins should be able to:

- Create/edit/delete events

- Add or edit event categories

- Manage planning stages

- Manage users/team members

- Create reusable templates for different event types

- Duplicate an existing event plan

8. User Experience

Make the UI easy and enjoyable:

- Use cards, tabs and progress bars

- Avoid overwhelming long forms

- Save progress automatically

- Use clear section headings

- Include helpful placeholder text

- Use status badges

- Include a “what still needs completing” checklist

- Make it mobile-friendly and desktop-friendly

9. Data Structure

Use a database structure suitable for:

- Events

- Users/team members

- Tasks

- Suppliers

- Files/attachments

- Notes

- Budget items

- Timeline milestones

- Risk items

- Event templates

10. Design Style

Use a premium, modern operations-dashboard style. Keep it friendly, energetic and easy to navigate. The brand should feel professional but not boring.

Start by building the MVP with:

- Event dashboard

- Create new event form

- Event detail page

- Section progress tracking

- Task list

- Timeline

- Admin event templates

Use realistic sample data for several Out There Group events so the app feels alive immediately.Before building, ask me any important questions that would help improve the app structure, especially around user roles, event types, approval workflows, and reporting needs.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://outthere-orchestrator.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/51747622-89b5-4dcc-876f-3e752aac136b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
