import { createPlugin } from '@fullcalendar/core'
import TimelineView from './TimelineView'

export { TimelineView }
export { default as TimelineLane, TimelineLaneProps, TimelineLaneSeg } from './TimelineLane'
export { default as ScrollJoiner } from './util/ScrollJoiner'
export { default as StickyScroller } from './util/StickyScroller'
export { default as TimeAxis, TimeAxisProps } from './TimeAxis'
export { default as HeaderBodyLayout } from './HeaderBodyLayout'
export { default as ClippedScroller } from './util/ClippedScroller'
export { default as EnhancedScroller } from './util/EnhancedScroller'
export { default as ScrollerCanvas } from './util/ScrollerCanvas'
export {
  TimelineDateProfile, TimelineHeaderCell, buildTimelineDateProfile, isValidDate, normalizeDate, normalizeRange
} from './timeline-date-profile'
export { default as TimelineHeader, TimelineHeaderProps } from './TimelineHeader'
export { default as TimelineLaneEventRenderer } from './TimelineLaneEventRenderer'
export { default as TimelineLaneFillRenderer } from './TimelineLaneFillRenderer'
export { default as TimelineNowIndicator } from './TimelineNowIndicator'
export { default as TimelineSlats, TimelineSlatsProps} from './TimelineSlats'

export default createPlugin({
  defaultView: 'timelineDay',
  views: {

    timeline: {
      class: TimelineView,
      eventResizableFromStart: true // how is this consumed for TimelineView tho?
    },

    timelineDay: {
      type: 'timeline',
      duration: { days: 1 }
    },

    timelineWeek: {
      type: 'timeline',
      duration: { weeks: 1 }
    },

    timelineMonth: {
      type: 'timeline',
      duration: { months: 1 }
    },

    timelineYear: {
      type: 'timeline',
      duration: { years: 1 }
    }

  }
})
