# Features

## Add: talk to Taskie
Tap **Add** (or press `N`) and say everything on your mind, in any order: "essay due Friday at 5 for English, gym Monday Wednesday Friday at 6, call mom tomorrow and I want to run a 10K by March". Nothing is written while you talk. On **Stop**:
1. **Deepgram Nova-3** (Cloudflare Workers AI) writes the recording down, boosted with your own words: course codes, names, places, categories.
2. **Gemini 2.5 Flash** listens to the same recording with Nova-3's text, the words it was unsure of and your planner, fixes what was misheard from context (accents, names that sound like common words) and lists every item with its title, kind, date, time, repeat and course. Without Gemini, Taskie's own Llama 3.3 splits Nova-3's text.
3. Each item is placed as pending, and a short review walks you through them: keep, switch (task, routine, goal) or drop.

You can also type. Titles are written in Title Case, emojis and spoken punctuation ("comma", "question mark", "heart emoji") are understood, and chit-chat and half sentences are left out.

## Overview
- **The brief:** your day in a sentence, with a ring for how much of today is done.
- **What's next:** ideas written by AI from your planner (start an assignment early, prepare for an exam, bring overdue things to today), refreshed by themselves as your planner changes, then today's things and this week's deadlines, each with one action.
- **Goals** with milestones, **how things are going** (things done over a week, month or three months) and **how your month went**.

## Schedule
- **Day, week and month**, with one header. Click an empty slot to add at that time.
- **Each activity is edited in place:** rename it, pick its day and time in one card (a month and phone-style wheels with a soft click), **Lock In** (a full-screen focus timer in the task's colour), **Break down** into small steps (Gemini first) as many times as you like, or delete it.
- **Calendars:** Canvas, Google, Apple and Outlook links, plus about 80 public calendars (holidays, sports, school terms).
- **Priority** is set by the AI from what you said.

## Notifications
Turn them on for each laptop and phone in **Settings, Profile**. Taskie's server checks every 5 minutes and sends:
- a reminder **10 minutes before** anything with a time,
- a short **brief at 8 AM** (things today, the first one, anything overdue),
- **deadlines the evening before**.
They arrive even when Taskie is closed. On iPhone and iPad, add Taskie to the Home Screen first (Share, Add to Home Screen). During Lock In, what gets through follows your Lock In settings.

## Help Taskie hear better
On unless you turn it off in **Settings, AI**. After each recording Taskie keeps the text of what Nova-3 heard and what it became after Gemini's correction (never the audio). These pairs are the training data for the daily training runs (see the training issue) and for each person's keyterms.

## Admin (owner)
A dashboard with a sidebar: Dashboard (people, recordings, Gemini share, errors, a week of activity), People (filter, sort, invite), Voice (by device and browser), Models (Nova-3, Gemini, Llama, Qwen, rules: calls, misses, speed), Training, Errors and app versions, Sync and Calendars. Counts and states only: nobody's tasks or words.

## Search
Finds tasks, goals, calendars and pages, and turns typed text into an action. Press `/` to jump to it.
