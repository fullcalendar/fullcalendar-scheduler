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

  // #8135
  it('does not adjust scroll for empty lanes shorter than their row', async () => {
    const calendar = initCalendar({
      resources: buildResources(),
      // With the cell's 16px of inner spacing, the row is exactly the estimate. Nothing to correct
      resourceCellContent: { html: '<div style="height:24px"></div>' },
    })
    const scrollEl = new ResourceTimelineViewWrapper(calendar).getTimeBodyEl()

    await ignoreResizeObserverLoops(async () => {
      await waitTimeout(100)
      const initialScrollHeight = scrollEl.scrollHeight

      await scrollPastUnmeasuredRows(scrollEl)
      const scrollTop = scrollEl.scrollTop

      expect(scrollTop).toBe(SCROLL_STEP * SCROLL_STEP_CNT)
      expect(scrollEl.scrollHeight).toBe(initialScrollHeight)

      await waitTimeout(SCROLL_END_WAIT)
      expect(scrollEl.scrollTop).toBe(scrollTop)
    })
  })
})
