import { ignoreResizeObserverLoops, waitTimeout } from '@fullcalendar-tests/standard/lib/misc'
import { ResourceTimelineViewWrapper } from '../lib/wrappers/ResourceTimelineViewWrapper'

const SCROLL_STEP = 2000
const SCROLL_STEP_CNT = 4
const SCROLL_END_WAIT = 700 // longer than ScrollListener's 500ms

describe('timeline virtualized fast scrolling', () => {
  pushOptions({
    initialView: 'resourceTimelineDay',
    initialDate: '2026-10-05',
    virtualization: true,
    height: 500,
  })

  function buildResources() {
    const resources = []

    for (let i = 0; i < 1000; i += 1) {
      const id = 'r' + String(i).padStart(4, '0')
      resources.push({ id, title: id })
    }

    return resources
  }

  /*
  Scrolls away as soon as new rows render, before they're measured, so that the measurements
  report rows that are now above the viewport, like during a fast scroll or scrollbar drag.
  */
  async function scrollPastUnmeasuredRows(scrollEl: HTMLElement) {
    let stepsLeft = SCROLL_STEP_CNT - 1
    const observer = new MutationObserver(() => {
      if (stepsLeft) {
        stepsLeft -= 1
        scrollEl.scrollTop += SCROLL_STEP
      }
    })

    observer.observe(scrollEl, { childList: true, subtree: true })
    scrollEl.scrollTop += SCROLL_STEP
    await waitTimeout(200)
    observer.disconnect()
  }

  async function expectStableFastScroll(scrollEl: HTMLElement) {
    const initialScrollHeight = scrollEl.scrollHeight

    await scrollPastUnmeasuredRows(scrollEl)
    const scrollTop = scrollEl.scrollTop

    expect(scrollTop).toBe(SCROLL_STEP * SCROLL_STEP_CNT)
    expect(scrollEl.scrollHeight).toBe(initialScrollHeight)

    await waitTimeout(SCROLL_END_WAIT)
    expect(scrollEl.scrollTop).toBe(scrollTop)
    expect(scrollEl.scrollHeight).toBe(initialScrollHeight)
  }

  // The calendar's teardown is also within ignoreResizeObserverLoops
  async function withCalendar(options, testFunc: (calendar, scrollEl: HTMLElement) => Promise<void>) {
    await ignoreResizeObserverLoops(async () => {
      const calendar = initCalendar(options)

      await waitTimeout(100)
      await testFunc(calendar, new ResourceTimelineViewWrapper(calendar).getTimeBodyEl())
      calendar.destroy()
      await waitTimeout(50)
    })
  }

  // #8135
  it('does not adjust scroll for empty lanes shorter than their row', async () => {
    await withCalendar({
      resources: buildResources(),
      // With the cell's 16px of inner spacing, the row is exactly the estimate. Nothing to correct
      resourceCellContent: { html: '<div style="height:24px"></div>' },
    }, async (_calendar, scrollEl) => {
      await expectStableFastScroll(scrollEl)
    })
  })

  // #8135
  it('estimates unmeasured rows from measured rows, leaving scroll stable when alike', async () => {
    await withCalendar({
      resources: buildResources(),
      resourceCellContent: { html: '<div style="height:60px"></div>' },
    }, async (_calendar, scrollEl) => {
      await expectStableFastScroll(scrollEl)
    })
  })

  it('keeps the visible row in place when the estimate changes', async () => {
    await withCalendar({
      resources: buildResources(),
      resourceCellContent: (arg) => ({
        // Enough tall rows to set the initial estimate, then fewer than the short rows measured later
        html: `<div style="height:${arg.resource.id < 'r0010' ? 80 : 10}px"></div><span>${arg.resource.id}</span>`,
      }),
    }, async (calendar, scrollEl) => {
      const getFirstVisibleRow = () => {
        const scrollerTop = scrollEl.getBoundingClientRect().top
        const dataGridEl = new ResourceTimelineViewWrapper(calendar).getDataGridBodyEl()
        const labels = (Array.from(dataGridEl.querySelectorAll('span')) as HTMLElement[])
          .map((el) => ({ id: el.textContent, top: el.getBoundingClientRect().top - scrollerTop }))
          .filter((label) => label.top >= 0 && /^r\d+$/.test(label.id))
          .sort((a, b) => a.top - b.top)

        return labels[0]
      }
      scrollEl.scrollTop = 20000
      await waitTimeout(200) // rows at the destination are measured, but the scroll hasn't ended
      const rowDuringScroll = getFirstVisibleRow()
      const scrollHeightDuringScroll = scrollEl.scrollHeight

      await waitTimeout(SCROLL_END_WAIT)
      expect(scrollEl.scrollHeight).toBeLessThan(scrollHeightDuringScroll / 2) // the estimate came down

      const rowAfterScroll = getFirstVisibleRow()
      expect(rowAfterScroll.id).toBe(rowDuringScroll.id)
      expect(Math.abs(rowAfterScroll.top - rowDuringScroll.top)).toBeLessThanOrEqual(1)
    })
  })

  it('does not change the estimate when the window scrolls', async () => {
    await withCalendar({
      height: 'auto',
      resources: buildResources(),
      resourceCellContent: { html: '<div style="height:60px"></div>' },
    }, async (_calendar, scrollEl) => {
      // 1px border on each row. Most rows are unmeasured and remain at the initial estimate of 40px
      expect(scrollEl.scrollHeight).toBeLessThan(buildResources().length * 41 * 1.5)
    })
  })
})
