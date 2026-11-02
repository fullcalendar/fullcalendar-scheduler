import { ignoreResizeObserverLoops, waitTimeout } from '@fullcalendar-tests/standard/lib/misc'
import { ResourceTimelineViewWrapper } from '../lib/wrappers/ResourceTimelineViewWrapper'

const STACK_SIZE = 6

// #8127
describe('timeline virtualized row height', () => {
  pushOptions({
    initialView: 'resourceTimelineDay',
    initialDate: '2026-10-05',
    virtualization: true,
    scrollTime: '00:00',
    height: 500,
    resources: [
      { id: 'a', title: 'a' },
      { id: 'b', title: 'b' },
    ],
    events: [
      // on screen
      ...Array.from({ length: STACK_SIZE }, (_, i) => ({
        id: `stack${i}`,
        resourceId: 'a',
        start: '2026-10-05T00:00:00',
        end: '2026-10-05T02:00:00',
      })),
      // off screen
      { id: 'far', resourceId: 'a', start: '2026-10-05T22:00:00', end: '2026-10-05T23:00:00' },
    ],
  })

  function getRowRects(calendar) {
    const { dataGrid } = new ResourceTimelineViewWrapper(calendar)

    return dataGrid.getResourceInfo().map((info) => info.rowEl.getBoundingClientRect())
  }

  function getEventRects(calendar) {
    const { timelineGrid } = new ResourceTimelineViewWrapper(calendar)

    return timelineGrid.getEventEls().map((eventEl) => eventEl.getBoundingClientRect())
  }

  // The calendar's teardown is also within ignoreResizeObserverLoops
  async function withCalendar(testFunc: (calendar, scrollEl: HTMLElement) => Promise<void>) {
    await ignoreResizeObserverLoops(async () => {
      const calendar = initCalendar()

      await waitTimeout(200)
      await testFunc(calendar, new ResourceTimelineViewWrapper(calendar).getTimeBodyEl())
      calendar.destroy()
      await waitTimeout(50)
    })
  }

  it('fits a stack of on-screen events when other events are off screen', async () => {
    await withCalendar(async (calendar) => {
      const eventRects = getEventRects(calendar)
      const [rowA, rowB] = getRowRects(calendar)

      expect(eventRects.length).toBe(STACK_SIZE)
      expect(Math.max(...eventRects.map((rect) => rect.bottom))).toBeLessThanOrEqual(rowA.bottom + 1)
      expect(rowB.top).toBeGreaterThanOrEqual(rowA.bottom - 1)
    })
  })

  it('shrinks to the on-screen events after scrolling past a stack, and grows back', async () => {
    await withCalendar(async (calendar, scrollEl) => {
      const stackHeight = getRowRects(calendar)[0].height

      scrollEl.scrollLeft = scrollEl.scrollWidth
      await waitTimeout(200)
      const farHeight = getRowRects(calendar)[0].height
      expect(farHeight).toBeLessThan(stackHeight / 2)

      scrollEl.scrollLeft = 0
      await waitTimeout(200)
      expect(getRowRects(calendar)[0].height).toBe(stackHeight)
    })
  })
})
