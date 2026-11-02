import { ignoreResizeObserverLoops, waitTimeout } from '@fullcalendar-tests/standard/lib/misc'

const LABEL_WIDTH = 34
const WIDEST_LABEL_WIDTH = 44 // of the 12pm label
const DIRECTIONS = ['ltr', 'rtl'] as const

describe('timeline virtualized slot labels', () => {
  pushOptions({
    initialView: 'resourceTimelineDay',
    initialDate: '2026-10-05',
    virtualization: true,
    scrollTime: '00:00',
    resourceColumnsWidth: 200,
    resources: [],
    // At the narrower labels' slot width, the 12pm label is mounted through overscan. At the slot
    // width it causes, it's scrolled too far out to be mounted
    slotHeaderContent: (arg) => ({
      html: `<div style="width:${arg.text === '12pm' ? WIDEST_LABEL_WIDTH : LABEL_WIDTH}px"></div>`,
    }),
  })

  async function countMutationsWhenIdle(calendar) {
    let mutationCnt = 0
    const observer = new MutationObserver((records) => {
      mutationCnt += records.length
    })

    observer.observe(calendar.el, { attributes: true, childList: true, characterData: true, subtree: true })
    await waitTimeout(300)
    mutationCnt += observer.takeRecords().length
    observer.disconnect()

    return mutationCnt
  }

  DIRECTIONS.forEach((direction) => {
    it(`settles when the widest label only fits at narrower slots, in ${direction}`, async () => {
      await ignoreResizeObserverLoops(async () => {
        const el = document.createElement('div')
        el.style.width = '830px'
        document.body.appendChild(el)

        const calendar = initCalendar({ direction }, el)

        await waitTimeout(200)
        expect(await countMutationsWhenIdle(calendar)).toBe(0)
        calendar.destroy()
        await waitTimeout(50)
        el.remove()
      })
    })
  })
})
