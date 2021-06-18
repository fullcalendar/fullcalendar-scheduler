import { ResourceTimelineViewWrapper } from '../lib/wrappers/ResourceTimelineViewWrapper'
import { TimelineViewWrapper } from '../lib/wrappers/TimelineViewWrapper'

describe('timeline dateClick', () => {
  pushOptions({
    now: '2015-11-28',
    scrollTime: '00:00',
    resources: [
      { id: 'a', title: 'Resource A' },
      { id: 'b', title: 'Resource B' },
    ],
  })

  describeOptions('direction', {
    LTR: false,
    RTL: true,
  }, () => {
    describeTimeZones((tz) => {
      describe('when time scale', () => {
        pushOptions({
          initialView: 'resourceTimelineDay',
        })

        describe('when snap matches slots', () => {
          describe('when no resources', () => {
            pushOptions({
              initialView: 'timelineDay',
            })

            it('reports date with no resource', (done) => {
              let dateClickCalled = false
              let calendar = initCalendar({
                dateClick(arg) {
                  dateClickCalled = true
                  expect(arg.date).toEqualDate(tz.parseDate('2015-11-28T04:30:00'))
                  expect(typeof arg.jsEvent).toBe('object')
                  expect(typeof arg.view).toBe('object')
                  expect(arg.resource).toBeFalsy()
                },
              })

              let timelineGrid = new TimelineViewWrapper(calendar).timelineGrid
              timelineGrid.clickDate('2015-11-28T04:30:00').then(() => {
                expect(dateClickCalled).toBe(true)
                done()
              })
            })
          })

          describe('when resources', () => {
            it('won\'t report anything if not clicked on resource', (done) => {
              let dateClickCalled = false
              let calendar = initCalendar({
                dateClick() {
                  dateClickCalled = true
                },
              })

              let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
              let slatEl = timelineGrid.getSlatElByDate('2015-11-28T04:30:00')
              $(slatEl).simulate('drag', {
                callback() {
                  expect(dateClickCalled).toBe(false)
                  done()
                },
              })
            })

            it('reports click on a resource', (done) => {
              let dateClickCalled = false
              let calendar = initCalendar({
                dateClick(arg) {
                  dateClickCalled = true
                  expect(arg.date).toEqualDate(tz.parseDate('2015-11-28T04:30:00'))
                  expect(typeof arg.jsEvent).toBe('object')
                  expect(typeof arg.view).toBe('object')
                  expect(arg.resource.id).toBe('b')
                },
              })

              let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
              timelineGrid.click('b', '2015-11-28T04:30:00').then(() => {
                expect(dateClickCalled).toBe(true)
                done()
              })
            })

            it('reports right click on a resource', (done) => {
              let dateClickCalled = false
              let calendar = initCalendar({
                dateClick(arg) {
                  dateClickCalled = true
                  expect(arg.date).toEqualDate(tz.parseDate('2015-11-28T04:30:00'))
                  expect(typeof arg.jsEvent).toBe('object')
                  expect(typeof arg.view).toBe('object')
                  expect(arg.resource.id).toBe('b')
                },
              })

              let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
              timelineGrid.rightClick('b', '2015-11-28T04:30:00').then(() => {
                expect(dateClickCalled).toBe(true)
                done()
              })
            })
          })
        })

        describe('when snap smaller than slots', () => {
          pushOptions({
            slotDuration: '00:30',
            snapDuration: '00:15',
          })

          it('reports a smaller granularity', (done) => {
            let dateClickCalled = false
            let calendar = initCalendar({
              dateClick(arg) {
                dateClickCalled = true
                expect(arg.date).toEqualDate(tz.parseDate('2015-11-28T04:15:00'))
                expect(typeof arg.jsEvent).toBe('object')
                expect(typeof arg.view).toBe('object')
                expect(arg.resource.id).toBe('b')
              },
            })

            let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
            timelineGrid.click('b', '2015-11-28T04:15:00').then(() => {
              expect(dateClickCalled).toBe(true)
              done()
            })
          })
        })
      })
    })

    describe('when day scale', () => {
      pushOptions({
        initialView: 'resourceTimelineMonth',
        slotDuration: { days: 1 },
      })

      it('reports untimed dates', (done) => {
        let dateClickCalled = false
        let calendar = initCalendar({
          dateClick(arg) {
            dateClickCalled = true
            expect(arg.date).toEqualDate('2015-11-03')
            expect(typeof arg.jsEvent).toBe('object')
            expect(typeof arg.view).toBe('object')
            expect(arg.resource.id).toBe('a')
          },
        })

        let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
        timelineGrid.click('a', '2015-11-03').then(() => {
          expect(dateClickCalled).toBe(true)
          done()
        })
      })
    })

    describe('when week scale', () => {
      pushOptions({
        initialView: 'resourceTimelineYear',
        slotDuration: { weeks: 1 },
      })

      it('reports untimed dates', (done) => {
        let dateClickCalled = false
        let calendar = initCalendar({
          dateClick(arg) {
            dateClickCalled = true
            expect(arg.date).toEqualDate('2015-01-18')
            expect(typeof arg.jsEvent).toBe('object')
            expect(typeof arg.view).toBe('object')
            expect(arg.resource.id).toBe('a')
          },
        })

        let timelineGrid = new ResourceTimelineViewWrapper(calendar).timelineGrid
        timelineGrid.click('a', '2015-01-18').then(() => {
          expect(dateClickCalled).toBe(true)
          done()
        })
      })
    })
  })
})
