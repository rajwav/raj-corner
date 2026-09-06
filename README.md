# Raj's Corner — a personal universe

An Astro-powered, static life archive. The homepage is an entrance; individual Markdown entries are the actual world.

## Run it

```sh
npm install
npm run dev
```

## Add something real

Create a Markdown file in `src/content/entries/`. Every entry has a type, tags, date/location, and a `related` array containing other entry slugs. That metadata automatically feeds the timeline, archive, place index, world hubs, and relationship links. You can group files into folders later (for example `entries/travel/kerala-2026.md`) without changing components.

```md
---
title: A real memory
type: memory
date: 2026-09-06
location: Somewhere
tags: [small-things]
description: One sentence that earns the entry.
related: [puri-sunrise]
status: past
accent: sand
---

The actual memory goes here.
```

Keep images in `src/assets/` when you start adding them. This does not need a database, CMS, login, or bespoke search service; static search can be added later once there is enough content for it to be useful.

## Capture without thinking

Copy an appropriate starter from `templates/` into `src/content/entries/`, fill in just the fields that matter, and save. The `currently/now.md` and `lifeLists/life-list.md` files drive their pages directly.
