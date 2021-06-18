import { getBoundingRect } from 'fullcalendar-tests/src/lib/dom-geom'
import { findElements } from '@fullcalendar/core'
import { getRectCenter, addPoints } from 'fullcalendar-tests/src/lib/geom'
import { CalendarWrapper } from 'fullcalendar-tests/src/lib/wrappers/CalendarWrapper'
import { TimelineGridWrapper } from './TimelineGridWrapper'

export class ResourceTimelineGridWrapper {
  base: TimelineGridWrapper

  constructor(public el: HTMLElement) {
    this.base = new TimelineGridWrapper(el)
  }

  getRootEl() {
    return this.base.el
  }

  rightClick(resourceId: string, date) {
    let point = this.getPoint(resourceId, date)

    if ($(this.el).css('direction') === 'ltr') {
      point.left += 1
    } else {
      point.left -= 1
    }

    $.simulateByPoint('contextmenu', {
      button: 2,
      point,
      clientX: point.left,
      clientY: point.top,
    })
    return new Promise((resolve) => { resolve() })
  }

  click(resourceId: string, date) { // not JUST a date. a resource too
    let point = this.getPoint(resourceId, date)

    if ($(this.el).css('direction') === 'ltr') {
      point.left += 1
    } else {
      point.left -= 1
    }

    return new Promise<void>((resolve) => {
      $.simulateByPoint('drag', {
        point,
        onRelease: () => resolve(),
      })
    })
  }

  dragEventTo(eventEl: HTMLElement, resourceId: string, date) {
    const MOVEOVER = 2
    let moveover = $(eventEl).css('direction') === 'ltr' ? MOVEOVER : -MOVEOVER
    let point = this.getPoint(resourceId, date)

    point.left += moveover

    return new Promise<void>((resolve) => {
      $(eventEl).simulate('drag', {
        localPoint: { left: moveover, top: '50%' }, // 2 for zoom
        end: point,
        onRelease: () => resolve(),
      })
    })
  }

  resizeEvent(eventEl: HTMLElement, newResourceId, newEndDate, fromStart?) {
    return new Promise<void>((resolve) => {
      let $eventEl = $(eventEl)
      let eventRect = eventEl.getBoundingClientRect()
      let isRtl = $eventEl.css('direction') === 'rtl'

      let resizerEl = $eventEl.find(
        '.' + (fromStart ? CalendarWrapper.EVENT_START_RESIZER_CLASSNAME : CalendarWrapper.EVENT_END_RESIZER_CLASSNAME),
      ).css('display', 'block')[0] // usually only displays on hover. force display

      let resizerPoint = getRectCenter(resizerEl.getBoundingClientRect())
      let xCorrect = resizerPoint.left - (isRtl ? eventRect.left : eventRect.right)
      let destPoint = this.getPoint(newResourceId, newEndDate)
      destPoint = addPoints(destPoint, { left: xCorrect, top: 0 })

      $(resizerEl).simulate('drag', {
        end: destPoint,
        onRelease: () => resolve(),
      })
    })
  }

  // TODO: util for selecting NOT on resource (mousedown on the slats underneath)
  selectDates(startInfo, inclusiveEndInfo) {
    let point0 = this.getPoint(startInfo.resourceId, startInfo.date)
    let point1 = this.getPoint(inclusiveEndInfo.resourceId, inclusiveEndInfo.date)

    if ($(this.el).css('direction') === 'rtl') {
      point0.left -= 2
      point1.left += 2
    } else {
      point0.left += 2
      point1.left -= 2
    }

    return new Promise<void>((resolve) => {
      $.simulateByPoint('drag', {
        point: point0,
        end: point1,
        onRelease: () => resolve(),
      })
    })
  }

  getRect(resourceId, start, end) {
    let coord0 = this.base.getLeft(start)
    let coord1 = this.base.getLeft(end)
    let rowRect = getBoundingRect(this.getResourceLaneEl(resourceId))

    return {
      left: Math.min(coord0, coord1),
      right: Math.max(coord0, coord1),
      top: rowRect.top,
      bottom: rowRect.bottom,
    }
  }

  getPoint(resourceId, date) {
    let rowRect = getBoundingRect(this.getResourceLaneEl(resourceId))

    return {
      left: this.base.getLeft(date),
      top: (rowRect.top + rowRect.bottom) / 2,
    }
  }

  getResourceIds() {
    return this.getResourceLaneEls().map((rowEl) => (
      rowEl.getAttribute('data-resource-id')
    ))
  }

  getResourceLaneEl(resourceId) {
    return this.el.querySelector(`.fc-timeline-lane[data-resource-id="${resourceId}"]`) as HTMLElement
  }

  getResourceLaneEls() { // are <td> cells
    return findElements(this.el, '.fc-timeline-lane[data-resource-id]')
  }

  getLeft(targetDate) {
    return this.base.getLeft(targetDate)
  }

  getSlatElByDate(date) {
    return this.base.getSlatElByDate(date)
  }

  getEventEls() { // FG events
    return this.base.getEventEls()
  }

  getFirstEventEl() {
    return this.base.getFirstEventEl()
  }

  getHGroupCnt() {
    return this.el.querySelectorAll('.fc-timeline-lane.fc-resource-group').length
  }

  hasNowIndicator() {
    return this.base.hasNowIndicator()
  }

  getBgEventEls() {
    return this.base.getBgEventEls()
  }

  getMirrorEventEls() {
    return this.base.getMirrorEventEls()
  }

  getNonBusinessDayEls() {
    return this.base.getNonBusinessDayEls()
  }

  getHighlightEls() {
    return this.base.getHighlightEls()
  }

  getMoreEls() {
    return findElements(this.el, '.fc-timeline-more-link')
  }

  openMorePopover(index?) {
    $(this.getMoreEls()[index || 0]).simulate('click')
  }

  getMorePopoverEl() {
    let viewWrapperEl = this.el.closest('.fc-view-harness')
    return viewWrapperEl.querySelector('.fc-more-popover') as HTMLElement
  }

  getMorePopoverEventEls() {
    return findElements(this.getMorePopoverEl(), '.fc-event')
  }

  static getEventElInfo(eventEl) {
    return {
      title: $(eventEl).find('.fc-event-title').text(),
      timeText: $(eventEl).find('.fc-event-time').text(),
    }
  }
}
