<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { today, isoDay } from '../lib/tasks';
import { focus, startFocus, finishFocus, stopFocus, toggleFocus, extendFocus, openMini, canMini, mmss, plannedMins } from '../lib/focus';
import Icon from './Icon.vue';
import { catColor } from '../lib/cats';
import BlockField from './BlockField.vue';

// Lock In: Taskie's timer, full screen. A chunky toy timer on a black field of
// scattered Tetris blocks,
// with a pixel screen: ▲ adds five minutes, ▼ takes five off, the long
// button pauses. Minimise (Esc) keeps it in the top bar.

// Pixel digits, 5 wide by 7 tall. Unlit cells of an "8" stay faintly visible, like a real LCD.
const DIGITS = {
  0: ['11111', '10001', '10001', '10001', '10001', '10001', '11111'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['11111', '00001', '00001', '11111', '10000', '10000', '11111'],
  3: ['11111', '00001', '00001', '01111', '00001', '00001', '11111'],
  4: ['10001', '10001', '10001', '11111', '00001', '00001', '00001'],
  5: ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
  6: ['11111', '10000', '10000', '11111', '10001', '10001', '11111'],
  7: ['11111', '00001', '00001', '00010', '00100', '00100', '00100'],
  8: ['11111', '10001', '10001', '11111', '10001', '10001', '11111'],
  9: ['11111', '10001', '10001', '11111', '00001', '00001', '11111'],
};
const GHOST = DIGITS[8];
// Pixel pictures, 11 by 9: a padlock while locked in, pause bars, and a cat for the break.
const ICONS = {
  lock: ['00011111000', '00100000100', '00100000100', '00100000100', '01111111110', '01000000010', '01000100010', '01000100010', '01111111110'],
  pause: ['00000000000', '00110001100', '00110001100', '00110001100', '00110001100', '00110001100', '00110001100', '00110001100', '00000000000'],
  cat: ['10000000001', '11000000011', '10111111101', '10000000001', '10110001101', '10000000001', '10001110001', '01000000010', '00111111100'],
};
const cells = rows => rows.join('').split('').map(c => c === '1');
const time = computed(() => (focus.ended ? '00:00' : mmss(focus.left)));
const glyphs = computed(() => time.value.split('').map(ch => (ch === ':' ? { colon: true } : { on: cells(DIGITS[ch] || DIGITS[0]), ghost: cells(GHOST) })));
const icon = computed(() => cells(ICONS[focus.ended ? 'cat' : focus.running ? 'lock' : 'pause']));

// One of three toy colours per session, and a line of encouragement.
const COLORS = ['cyan', 'lime', 'grape'];
const color = computed(() => COLORS[(focus.task?.title?.length || 0) % COLORS.length]);
// The timer is the colour of the task's category, like its block on the calendar.
const bodyColor = computed(() => (focus.task ? catColor(focus.task) : ''));
const LINES = [
  'Phone face down. Future you says thanks.',
  'One thing. Just this one. The rest can wait its turn.',
  'Tabs closed? Be honest.',
  'You are not procrastinating. You are locked in.',
  'Small steps still count as steps.',
  'Hydrate. Then crush it.',
];
const line = computed(() => (focus.ended ? 'Time is up. Stretch, sip, then go again or call it done.' : !focus.running ? 'Paused. The timer waits. It is very patient.' : LINES[(focus.task?.title?.length || 0) % LINES.length]));
const minsToday = computed(() => (store.focusLog || []).filter(x => isoDay(new Date(x.at)) === today()).reduce((n, x) => n + (x.mins || 0), 0));
const less = () => { if (focus.left > 5 * 60) extendFocus(-5); };
// The session's length against the activity's own: "+10 min" or "−5 min" when changed.
const planned = computed(() => plannedMins(focus.task));
const change = computed(() => Math.round(focus.total / 60) - planned.value);
const changeText = computed(() => (change.value > 0 ? `+${change.value} min` : change.value < 0 ? `−${-change.value} min` : ''));
const minimize = () => { focus.min = true; };
const esc = e => { if (e.key === 'Escape' && focus.task && !focus.min) minimize(); };
onMounted(() => document.addEventListener('keydown', esc));
onUnmounted(() => document.removeEventListener('keydown', esc));
</script>

<template>
  <Teleport to="body">
    <div v-if="focus.task && !focus.min" class="lk" :class="[color, { ended: focus.ended, paused: !focus.running && !focus.ended, tinted: !!bodyColor }]" :style="bodyColor ? { '--task': bodyColor } : {}" role="dialog" aria-modal="true" :aria-label="`Lock In: ${focus.task.title}`" data-test="timer">
      <BlockField />
      <div class="lk-glass" aria-hidden="true" />
      <button type="button" class="lk-min" title="Minimise (Esc): keep the timer in the top bar" aria-label="Minimise" data-test="timer-min" @click="minimize"><Icon name="collapse" :size="18" />Minimise</button>

      <div class="lk-stage">
        <p class="lk-kicker">{{ focus.ended ? 'Break time' : focus.running ? 'Locked in on' : 'Paused on' }}</p>
        <h2 class="lk-title">{{ focus.task.title }}</h2>

        <div class="lk-device">
          <div class="lk-bezel">
            <div class="lk-lcd" role="timer" :aria-label="`${mmss(focus.left)} left`">
              <div class="lk-icon" aria-hidden="true"><i v-for="(c, n) in icon" :key="n" :class="{ on: c }" /></div>
              <div class="lk-time" aria-hidden="true">
                <template v-for="(g, n) in glyphs" :key="n">
                  <span v-if="g.colon" class="lk-colon"><i /><i /></span>
                  <span v-else class="lk-digit"><i v-for="(c, k) in g.on" :key="k" :class="{ on: c, ghost: !c && g.ghost[k] }" /></span>
                </template>
              </div>
              <b class="lk-lcd-text">{{ time }}</b>
              <span class="lk-lcd-sub">{{ focus.ended ? 'you earned it' : `of ${Math.round(focus.total / 60)} min` }}</span>
            </div>
          </div>
          <div class="lk-keys">
            <button type="button" class="lk-key round" title="Five more minutes (▲)" aria-label="Five more minutes" data-test="timer-more" @click="extendFocus(5)"><span class="tri up" /></button>
            <button type="button" class="lk-key round" title="Five minutes less" aria-label="Five minutes less" :disabled="focus.ended || focus.left <= 5 * 60" data-test="timer-less" @click="less"><span class="tri down" /></button>
            <button v-if="!focus.ended" type="button" class="lk-key long" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" data-test="timer-toggle" @click="toggleFocus"><span class="lk-lines" /></button>
            <button v-else type="button" class="lk-key long" title="Go again" aria-label="Go again" @click="startFocus(focus.task)"><span class="lk-lines" /></button>
          </div>
        </div>

        <p class="lk-line">{{ changeText ? `${Math.round(focus.total / 60)} min, ${changeText} on the plan. ` : '' }}{{ line }}</p>
        <div class="lk-acts">
          <button type="button" class="lk-chip strong" data-test="timer-done" @click="finishFocus"><Icon name="check" :size="16" />Done</button>
          <button v-if="canMini" type="button" class="lk-chip" :class="{ on: focus.mini }" title="Keep the timer on top of other windows" data-test="timer-float" @click="openMini"><Icon name="external" :size="16" />Float</button>
          <button type="button" class="lk-chip ghost" data-test="timer-stop" @click="stopFocus"><Icon name="x" :size="16" />Bail</button>
        </div>
        <p class="lk-foot">
          <span>{{ minsToday }} min locked in today</span>
          <span v-if="focus.held.length && !focus.ended" data-test="focus-held"> · {{ focus.held.length }} {{ focus.held.length === 1 ? 'reminder is' : 'reminders are' }} waiting politely</span>
        </p>
      </div>
    </div>
  </Teleport>
</template>
